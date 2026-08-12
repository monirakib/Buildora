/* Buildora service worker — Web Push only.
 *
 * Deliberately does NOT cache anything. A service worker is the only way a
 * browser can be woken for a push, but caching an app this stateful would serve
 * stale escrow balances and stale bid counts, which is far worse than a network
 * round trip. So this file handles two events and nothing else.
 */

/**
 * A push arrived. The payload is the JSON that services/webpush.ts sent:
 * { title, body, link, tag }.
 *
 * `event.waitUntil` matters — without it the browser may kill the worker before
 * the notification is shown, and the user silently gets nothing.
 */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // A push with no body, or one this version doesn't understand. Still worth
    // surfacing something rather than dropping it.
    payload = {};
  }

  const title = payload.title || "Buildora";
  const options = {
    body: payload.body || "",
    // No `icon`/`badge` on purpose: the repo has no PNG app icon yet, and
    // pointing at a file that 404s looks worse than the browser's own default.
    // Drop a 192px icon in public/ and add `icon: "/icon-192.png"` here.
    //
    // Same tag replaces an earlier notification instead of stacking beside it,
    // so five milestone updates leave one entry, not five.
    tag: payload.tag || "buildora",
    renotify: true,
    data: { link: payload.link || "/dashboard" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * The user clicked it. Focus an already-open Buildora tab and navigate it
 * rather than opening a duplicate — someone with the app open in a tab expects
 * that tab to move, not a second one to appear.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      return self.clients.openWindow(link);
    })
  );
});
