/**
 * Unit tests for supabase/functions/send-push/webpush.ts (run with plain
 * `node scripts/test-webpush.mjs`; Node 22.18+ strips the types natively).
 *
 * 1. RFC 8291 Appendix A test vector — the encrypted body must match the
 *    RFC byte-for-byte (keys and salt pinned to the vector's values).
 * 2. VAPID Authorization header — the ES256 JWT must verify against the
 *    public key and carry the right audience/subject.
 * 3. Round-trip — encrypt with fresh keys, decrypt as a user agent would.
 */
import {
  b64urlDecode,
  b64urlEncode,
  encryptPayload,
  vapidAuthorization,
} from '../supabase/functions/send-push/webpush.ts';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
}

// ---------- 1. RFC 8291 Appendix A ----------
const V = {
  plaintext: 'When I grow up, I want to be a watermelon',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

function ecJwk(publicB64, privateB64, usages) {
  const pub = b64urlDecode(publicB64);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: b64urlEncode(pub.slice(1, 33)),
    y: b64urlEncode(pub.slice(33, 65)),
  };
  if (privateB64) jwk.d = privateB64;
  return jwk;
}

const asKeyPair = {
  publicKey: await crypto.subtle.importKey(
    'raw', b64urlDecode(V.asPublic), { name: 'ECDH', namedCurve: 'P-256' }, true, [],
  ),
  privateKey: await crypto.subtle.importKey(
    'jwk', ecJwk(V.asPublic, V.asPrivate), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'],
  ),
};

const rfcBody = await encryptPayload(
  { endpoint: 'https://push.example.net/x', keys: { p256dh: V.uaPublic, auth: V.authSecret } },
  V.plaintext,
  asKeyPair,
  b64urlDecode(V.salt),
);
check(
  'RFC 8291 Appendix A vector matches byte-for-byte',
  b64urlEncode(rfcBody) === V.body,
  `got ${b64urlEncode(rfcBody).slice(0, 60)}…`,
);

// ---------- 2. VAPID header ----------
const vapidPair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
);
const vapidPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', vapidPair.publicKey));
const vapidPrivJwk = await crypto.subtle.exportKey('jwk', vapidPair.privateKey);
const vapid = {
  publicKey: b64urlEncode(vapidPubRaw),
  privateKey: vapidPrivJwk.d,
  subject: 'mailto:matt@example.com',
};

const header = await vapidAuthorization('https://web.push.apple.com/QOX...abc', vapid);
const match = header.match(/^vapid t=([^,]+), k=(.+)$/);
check('authorization header shape', !!match);
if (match) {
  check('k= is the public key', match[2] === vapid.publicKey);
  const [h, p, s] = match[1].split('.');
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  check('aud is the push origin', claims.aud === 'https://web.push.apple.com');
  check('sub is the subject', claims.sub === vapid.subject);
  check('exp within 24h', claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 86400);
  const verified = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    vapidPair.publicKey,
    b64urlDecode(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  check('ES256 signature verifies', verified);
}

// ---------- 3. Round-trip with fresh keys ----------
const uaPair = await crypto.subtle.generateKey(
  { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
);
const uaPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', uaPair.publicKey));
const auth = crypto.getRandomValues(new Uint8Array(16));
const payload = JSON.stringify({ title: '✨ A spark', body: 'test' });

const message = await encryptPayload(
  { endpoint: 'https://x', keys: { p256dh: b64urlEncode(uaPubRaw), auth: b64urlEncode(auth) } },
  payload,
);

// Decrypt exactly as a user agent does (RFC 8291 §3).
const salt = message.slice(0, 16);
const keyIdLen = message[20];
const asPub = message.slice(21, 21 + keyIdLen);
const ciphertext = message.slice(21 + keyIdLen);
const asPubKey = await crypto.subtle.importKey(
  'raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, [],
);
const ecdh = new Uint8Array(
  await crypto.subtle.deriveBits({ name: 'ECDH', public: asPubKey }, uaPair.privateKey, 256),
);
async function hkdf(saltB, ikmB, infoB, n) {
  const k = await crypto.subtle.importKey('raw', ikmB, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: saltB, info: infoB }, k, n * 8),
  );
}
const te = new TextEncoder();
const keyInfo = new Uint8Array([...te.encode('WebPush: info\0'), ...uaPubRaw, ...asPub]);
const ikm = await hkdf(auth, ecdh, keyInfo, 32);
const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
const padded = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, ciphertext));
check('round-trip: delimiter is 0x02', padded[padded.length - 1] === 2);
check(
  'round-trip: plaintext survives',
  new TextDecoder().decode(padded.slice(0, -1)) === payload,
);
check('record size field is 4096', new DataView(message.buffer, message.byteOffset).getUint32(16) === 4096);

console.log(failures === 0 ? '\nALL WEBPUSH TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
