self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
    let data = {};

    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = {};
    }

    const title = data.title || "BoviNetra";

    event.waitUntil(
        self.registration.showNotification(title, {
            body: data.body || "",
            icon: "/assets/images/fav.png",
            badge: "/assets/images/fav.png",
            tag: data.link || "bovinetra",
            data: { link: typeof data.link === "string" && data.link.startsWith("/") ? data.link : "/notifications" }
        })
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    const target = new URL(event.notification.data?.link || "/notifications", self.location.origin).href;

    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
            for (const client of windows) {
                if (client.url === target && "focus" in client) return client.focus();
            }

            return self.clients.openWindow(target);
        })
    );
});
