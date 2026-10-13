// Pentilius service worker — Web Push only (owner decision, 2026-10-13).
// The server decides what and when; this just shows the notification and
// opens the game on click. No caching/offline logic here on purpose.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // The game is open and in front of the player — it shows its own in-game notice.
      if (clients.some((client) => client.visibilityState === 'visible' && client.focused)) return undefined;
      return self.registration.showNotification(data.title || 'Pentilius', {
        body: data.body || '',
        tag: data.tag,
        icon: '/logo_255x255.png',
        badge: '/logo_255x255.png',
        data: { url: data.url || '/' },
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
