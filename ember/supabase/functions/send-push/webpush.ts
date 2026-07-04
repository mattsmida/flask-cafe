/**
 * Minimal Web Push sender: RFC 8291 (aes128gcm content encryption) +
 * RFC 8292 (VAPID), on pure WebCrypto. No dependencies, no push-vendor
 * SDKs — works against Apple's, Mozilla's, and Google's push services
 * alike, and runs unchanged on Deno (Supabase Edge) and Node 20+.
 *
 * The encryption path is verified against the RFC 8291 Appendix A test
 * vector (see scripts/test-webpush.mjs in the ember folder).
 */

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface VapidKeys {
  /** base64url, 65-byte uncompressed P-256 point (`npx web-push generate-vapid-keys` format) */
  publicKey: string;
  /** base64url, 32-byte scalar */
  privateKey: string;
  /** mailto: or https: contact for the push service operator */
  subject: string;
}

const te = new TextEncoder();

export function b64urlDecode(s: string): Uint8Array {
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function b64urlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let raw = '';
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  bytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, [
    'deriveBits',
  ]);
  const derived = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
    key,
    bytes * 8,
  );
  return new Uint8Array(derived);
}

/**
 * RFC 8291 aes128gcm encryption of a payload for one subscription.
 * asKeyPair/salt are injectable only so tests can pin the RFC vector.
 */
export async function encryptPayload(
  subscription: PushSubscriptionJson,
  plaintext: string,
  asKeyPair?: CryptoKeyPair,
  salt?: Uint8Array,
): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(subscription.keys.p256dh); // 65 bytes
  const authSecret = b64urlDecode(subscription.keys.auth); // 16 bytes

  const asKeys =
    asKeyPair ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256),
  );

  // ikm = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const keyInfo = concat(te.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const theSalt = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(theSalt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(theSalt, ikm, te.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, [
    'encrypt',
  ]);
  // A single record: plaintext || 0x02 (final-record delimiter).
  const padded = concat(te.encode(plaintext), new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, aesKey, padded as BufferSource),
  );

  // Header: salt(16) || record_size(4, big-endian) || keyid_len(1) || as_public(65)
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(theSalt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);

  return concat(header, ciphertext);
}

/** RFC 8292 VAPID JWT (ES256), audience = the push service origin. */
export async function vapidAuthorization(
  endpoint: string,
  vapid: VapidKeys,
): Promise<string> {
  const url = new URL(endpoint);
  const publicBytes = b64urlDecode(vapid.publicKey);
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: b64urlEncode(publicBytes.slice(1, 33)),
    y: b64urlEncode(publicBytes.slice(33, 65)),
    d: vapid.privateKey,
  };
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const header = b64urlEncode(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64urlEncode(
    te.encode(
      JSON.stringify({
        aud: `${url.protocol}//${url.host}`,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: vapid.subject,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    te.encode(signingInput),
  );
  return `vapid t=${signingInput}.${b64urlEncode(signature)}, k=${vapid.publicKey}`;
}

/**
 * Encrypts and POSTs one push message. Returns the push service response;
 * 404/410 mean the subscription is dead and should be discarded.
 */
export async function sendWebPush(
  subscription: PushSubscriptionJson,
  payload: string,
  vapid: VapidKeys,
  opts: { ttlSeconds?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high' } = {},
): Promise<Response> {
  const [body, authorization] = await Promise.all([
    encryptPayload(subscription, payload),
    vapidAuthorization(subscription.endpoint, vapid),
  ]);
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(opts.ttlSeconds ?? 24 * 60 * 60),
      Urgency: opts.urgency ?? 'high',
    },
    body: body as BodyInit,
  });
}
