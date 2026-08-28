/* ALLEVIN MK XII.8 — Personal Alpha service worker
 *
 * The app currently performs local reminder checks while the PWA is running.
 * This worker also accepts standard Web Push payloads so a production scheduler
 * can wake the installed PWA later without changing the client UI contract.
 */

const SW_VERSION = "mkxvii-language-health-2";

self.addEventListener("install", () => {
  // Promote a newly deployed worker immediately. ALLEVIN stores user state in
  // localStorage, so there is no app-shell cache here that needs to be preserved.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      // Older experimental caches are safe to remove. User data is not stored
      // in Cache Storage.
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("allevin-") && key !== SW_VERSION)
            .map((key) => caches.delete(key)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() || "" };
  }

  const title = payload.title || "ALLEVIN";
  const actionTarget = payload.data?.actionTarget;
  const options = {
    body: typeof payload.body === "string" ? payload.body : "",
    tag: payload.tag || `allevin-push-${Date.now()}`,
    icon: "/allevin-icon-192.png",
    badge: "/allevin-icon-192.png",
    data: {
      url: payload.url || "/",
      entryId: payload.entryId,
      ...(payload.data || {}),
    },
    // These actions carry intent back into the app. The deterministic state
    // engine applies them after launch; the worker never edits schedule truth.
    ...(actionTarget ? {
      actions: [
        { action: "done", title: "Done" },
        { action: "running-late", title: "Running late" },
        { action: "skip", title: "Skip" },
      ],
    } : {}),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const actionTarget = data.actionTarget;
  const targetUrl = new URL(data.url || "/", self.location.origin);
  if (event.action && actionTarget) {
    targetUrl.searchParams.set("allevinNotificationAction", event.action);
    targetUrl.searchParams.set("source", actionTarget.source);
    targetUrl.searchParams.set("id", actionTarget.id);
    targetUrl.searchParams.set("date", actionTarget.dateKey);
  }
  const target = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => "focus" in client);
      if (existing) {
        existing.navigate(target);
        return existing.focus();
      }
      return clients.openWindow(target);
    }),
  );
});
