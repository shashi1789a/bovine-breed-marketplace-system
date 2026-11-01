(() => {
    const badges = document.querySelectorAll("[data-notify-badge]");
    if (!badges.length) return;

    const paint = (count) => {
        const text = count > 99 ? "99+" : String(count);

        badges.forEach((badge) => {
            badge.textContent = text;
            badge.hidden = count < 1;
        });
    };

    const load = async () => {
        try {
            const response = await fetch("/notifications/count", {
                credentials: "same-origin",
                headers: { Accept: "application/json" }
            });

            if (!response.ok) return;

            const json = await response.json();
            paint(Number(json?.data?.count) || 0);
        } catch {
            return;
        }
    };

    load();
    setInterval(() => {
        if (!document.hidden) load();
    }, 60000);
})();
