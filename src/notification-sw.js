// Custom service worker for handling notification clicks
// This works alongside Angular's service worker

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};

  if (action === 'open' || !action) {
    // Open the app and navigate to reports page
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        // Check if there's already a window/tab open with the target URL
        const url = data.url || '/reports';
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url.includes(url) && 'focus' in client) {
            return client.focus();
          }
        }
        // If no window is open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
    );
  } else if (action === 'dismiss') {
    // Just close the notification, do nothing
    return;
  }
});

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
