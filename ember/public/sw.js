/**
 * Ember's service worker. Deliberately minimal: its job is Web Push.
 * (Offline caching is optional polish that can be added later.)
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // an unparseable push still shows something warm
  }
  const title = payload.title || '🔥 Ember';
  const options = {
    body: payload.body || 'Something is glowing in your space.',
    tag: payload.tag || 'ember',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ('focus' in client) return client.focus();
        }
        return self.clients.openWindow('/');
      }),
  );
});
