const CACHE_NAME = 'narzedziownia-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png'
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(URLS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Network first, then cache
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Skip API requests from caching (always network)
  // Or use specific strategy for API if needed. For now, let's keep API dynamic.
  if (event.request.url.includes('/api/')) {
    return; 
  }

  if (event.request.url.includes('/src/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Check if we received a valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();

        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseToCache);
          });

        return response;
      })
      .catch(() => {
        // If offline, try to serve from cache
        return caches.match(event.request)
          .then((response) => {
            if (response) {
              return response;
            }
            // Fallback for navigation requests to index.html
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
          });
      })
  );
});

// Push Notifications Logic (Preserved)
self.addEventListener('push', (event) => {
  const data = (() => {
    try { return event.data ? event.data.json() : {}; } catch (_) { return {}; }
  })();
  const title = data.title || 'Powiadomienie';
  const options = {
    body: data.body || '',
    tag: data.tag || 'admin_message',
    icon: '/logo192.png',
    badge: '/logo192.png',
    data: data.data || {}
  };
  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    try {
      const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      clientsList.forEach((client) => {
        try {
          client.postMessage({ type: 'notifications:refresh', source: 'push', tag: options.tag, url: options.data?.url || '/' });
        } catch (_) { /* noop */ }
      });
    } catch (_) { /* noop */ }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
    for (let client of windowClients) {
      if (client.url.includes(url) && 'focus' in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
