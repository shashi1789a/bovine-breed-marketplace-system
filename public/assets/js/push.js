(() => {
    const button = document.getElementById("pushToggle");
    const status = document.getElementById("pushStatus");

    if (!button || !status) return;

    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

    const say = (text) => {
        status.textContent = text;
    };

    const toKey = (base64) => {
        const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
        const raw = atob(padded);

        return Uint8Array.from(raw, (char) => char.charCodeAt(0));
    };

    const post = (path, body) =>
        fetch(path, {
            method: "POST",
            credentials: "same-origin",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

    const current = async () => {
        const registration = await navigator.serviceWorker.getRegistration("/");

        return registration ? registration.pushManager.getSubscription() : null;
    };

    const refresh = async () => {
        if (!supported) {
            button.disabled = true;
            say("This browser does not support push notifications.");
            return;
        }

        if (Notification.permission === "denied") {
            button.disabled = true;
            say("Notifications are blocked for this site. Allow them in your browser settings.");
            return;
        }

        const subscription = await current();
        button.textContent = subscription ? "Turn off on this device" : "Turn on for this device";
        button.dataset.on = subscription ? "1" : "0";
        say(subscription ? "Push notifications are on for this device." : "Push notifications are off for this device.");
    };

    button.addEventListener("click", async () => {
        button.disabled = true;

        try {
            if (button.dataset.on === "1") {
                const subscription = await current();

                if (subscription) {
                    await post("/account/push/unsubscribe", { endpoint: subscription.endpoint });
                    await subscription.unsubscribe();
                }
            } else {
                const permission = await Notification.requestPermission();

                if (permission !== "granted") {
                    say("Permission was not given.");
                    return;
                }

                const keyResponse = await fetch("/account/push/key", { credentials: "same-origin" });
                const keyJson = await keyResponse.json();

                if (!keyJson.data?.enabled) {
                    say("Push notifications are not set up on the server yet.");
                    return;
                }

                const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
                await navigator.serviceWorker.ready;

                const subscription =
                    (await registration.pushManager.getSubscription()) ||
                    (await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: toKey(keyJson.data.key)
                    }));

                const saved = await post("/account/push/subscribe", subscription.toJSON());

                if (!saved.ok) {
                    await subscription.unsubscribe();
                    say("Could not turn on push notifications. Please try again.");
                    return;
                }
            }
        } catch (error) {
            say("Something went wrong. Please try again.");
        } finally {
            button.disabled = false;
            await refresh();
        }
    });

    refresh();
})();
