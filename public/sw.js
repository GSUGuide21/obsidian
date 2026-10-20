// Obsidian Chat service worker: shows push notifications (sent by server.mts
// to people with no tab open) and opens the app on the message when one is
// clicked. It caches nothing; the app needs the live server anyway.

self.addEventListener("install", () => {
  // A new version takes over right away; there's no cached state to migrate.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    data = null;
  }
  if (!data || typeof data.title !== "string") return;
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: typeof data.body === "string" ? data.body : "",
      icon: data.icon || "/icon/192",
      badge: "/icon/192",
      // One notification per message, so a retry replaces rather than repeats.
      tag: data.tag,
      data: data.open ?? null,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const open = event.notification.data;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        // The app picks it up (see useNotificationClicks) and goes to the message.
        if (open) existing.postMessage({ type: "obsidian:open", ...open });
        return existing.focus();
      }
      const url = new URL("/", self.location.origin);
      if (open?.subgroupId) url.searchParams.set("open", open.subgroupId);
      if (open?.messageId) url.searchParams.set("message", open.messageId);
      if (open?.threadId) url.searchParams.set("thread", open.threadId);
      return self.clients.openWindow(url.href);
    })(),
  );
});
