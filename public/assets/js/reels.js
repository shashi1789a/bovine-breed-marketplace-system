(() => {
    "use strict";

    const root = document.getElementById("reels");
    if (!root) return;

    const config = {
        me: root.dataset.me || "",
        farmer: root.dataset.farmer || "",
        cattle: root.dataset.cattle || "",
        start: root.dataset.start || ""
    };

    const feed = document.getElementById("feed");
    const toastEl = document.getElementById("toast");

    const state = { items: [], hasMore: true, loading: false, muted: true, active: null };
    const slides = new Map(); // reel id -> { section, video, frame, reel }

    /* ------------------------------------------------------------ helpers */

    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };

    const icon = (name) => {
        const node = el("i", `bi ${name}`);
        node.setAttribute("aria-hidden", "true");
        return node;
    };

    /* Only https links from our video host are ever put into the page. */
    const safeUrl = (value) => {
        if (!value || typeof value !== "string") return "";

        try {
            const url = new URL(value, location.origin);
            return url.protocol === "https:" || url.origin === location.origin ? url.href : "";
        } catch {
            return "";
        }
    };

    let toastTimer;
    const toast = (message) => {
        toastEl.textContent = message;
        toastEl.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => (toastEl.hidden = true), 3500);
    };

    const initials = (name) =>
        String(name || "?")
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toUpperCase();

    const money = (value) =>
        typeof value === "number" ? `₹ ${value.toLocaleString("en-IN")}` : "Price on request";

    const cattleLine = (cattle) => {
        const parts = [];
        if (cattle.category) parts.push(cattle.category);
        if (cattle.gender) parts.push(cattle.gender);
        if (typeof cattle.age === "number") parts.push(`${cattle.age} mo`);
        return parts.join(" · ");
    };

    const loginUrl = (next) => `/login?next=${encodeURIComponent(next)}`;

    /* -------------------------------------------------------------- render */

    const buildSlide = (reel) => {
        const section = el("section", "reel");
        section.dataset.id = reel.id;
        section.setAttribute("aria-label", `Reel by ${reel.farmer.fullName}`);

        const frame = el("div", "frame is-paused");

        const video = document.createElement("video");
        video.playsInline = true;
        video.loop = true;
        video.muted = state.muted;
        video.preload = "none";
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        video.setAttribute("aria-label", reel.caption || "Cattle video");

        const poster = safeUrl(reel.posterUrl);
        if (poster) video.poster = poster;

        video.addEventListener("waiting", () => frame.classList.add("is-loading"));
        video.addEventListener("playing", () => {
            frame.classList.remove("is-loading", "is-paused");
        });
        video.addEventListener("pause", () => frame.classList.add("is-paused"));
        video.addEventListener("canplay", () => frame.classList.remove("is-loading"));

        /* The lighter copy can still be processing. Fall back to the original once. */
        video.addEventListener("error", () => {
            const original = safeUrl(reel.originalUrl);

            if (original && video.dataset.fallback !== "1" && video.src !== original) {
                video.dataset.fallback = "1";
                video.src = original;
                if (state.active === reel.id) video.play().catch(() => {});
            } else {
                frame.classList.remove("is-loading");
                toast("This video could not be played.");
            }
        });

        const tap = el("button", "tap");
        tap.type = "button";
        tap.setAttribute("aria-label", "Play or pause");
        tap.addEventListener("click", () => {
            if (video.paused) video.play().catch(() => {});
            else video.pause();
        });

        const mark = el("div", "paused-mark");
        mark.append(icon("bi-play-fill"));

        frame.append(video, tap, mark, el("div", "loader"), buildSide(reel, video), buildInfo(reel));
        section.append(frame);

        return { section, frame, video, reel };
    };

    const buildSide = (reel, video) => {
        const side = el("div", "side");

        if (!reel.mine) {
            const chat = el("a", "act chat");
            chat.href = config.me
                ? `/chat?with=${encodeURIComponent(reel.farmer.id)}`
                : loginUrl(`/chat?with=${reel.farmer.id}`);
            chat.setAttribute("aria-label", `Message ${reel.farmer.fullName}`);
            chat.append(icon("bi-chat-dots-fill"), el("span", "", "Message"));
            side.append(chat);
        }

        const details = el("a", "act");
        details.href = `/cattle/${encodeURIComponent(reel.cattle.id)}`;
        details.setAttribute("aria-label", "See all details of this cattle");
        details.append(icon("bi-card-list"), el("span", "", "Details"));
        side.append(details);

        const share = el("button", "act");
        share.type = "button";
        share.setAttribute("aria-label", "Share this reel");
        share.append(icon("bi-share-fill"), el("span", "", "Share"));
        share.addEventListener("click", () => shareReel(reel));
        side.append(share);

        const sound = el("button", "act");
        sound.type = "button";
        sound.dataset.role = "sound";
        sound.setAttribute("aria-label", "Turn sound on or off");
        sound.append(icon(state.muted ? "bi-volume-mute-fill" : "bi-volume-up-fill"), el("span", "", "Sound"));
        sound.addEventListener("click", () => setMuted(!state.muted));
        side.append(sound);

        if (reel.mine) {
            const remove = el("button", "act danger");
            remove.type = "button";
            remove.setAttribute("aria-label", "Delete this reel");
            remove.append(icon("bi-trash3-fill"), el("span", "", "Delete"));
            remove.addEventListener("click", () => removeReel(reel, video));
            side.append(remove);
        }

        return side;
    };

    const buildInfo = (reel) => {
        const info = el("div", "info");

        const farmer = el("a", "farmer");
        farmer.href = reel.farmer.username ? `/farmers/${encodeURIComponent(reel.farmer.username)}` : "#";
        farmer.setAttribute("aria-label", `Open ${reel.farmer.fullName}'s profile`);

        const av = el("span", "av");
        const avatar = safeUrl(reel.farmer.avatar);

        if (avatar) {
            const img = document.createElement("img");
            img.alt = "";
            img.src = avatar;
            img.loading = "lazy";
            img.addEventListener("error", () => av.replaceChildren(initials(reel.farmer.fullName)));
            av.append(img);
        } else {
            av.textContent = initials(reel.farmer.fullName);
        }

        const who = el("span", "who");
        const place = [reel.farmer.farmName, reel.farmer.location].filter(Boolean).join(" · ");
        who.append(el("strong", "", reel.farmer.fullName), el("span", "", place || `@${reel.farmer.username}`));
        farmer.append(av, who);
        info.append(farmer);

        if (reel.caption) info.append(el("p", "caption", reel.caption));

        const chip = el("a", "cattle-chip");
        chip.href = `/cattle/${encodeURIComponent(reel.cattle.id)}`;

        const thumb = el("span", "thumb");
        const image = safeUrl(reel.cattle.image);

        if (image) {
            const img = document.createElement("img");
            img.alt = "";
            img.src = image;
            img.loading = "lazy";
            thumb.append(img);
        } else {
            thumb.append(icon("bi-image"));
        }

        const txt = el("span", "txt");
        txt.append(el("strong", "", reel.cattle.title), el("span", "", `${money(reel.cattle.price)} · ${cattleLine(reel.cattle)}`));
        chip.append(thumb, txt, el("span", "go", "View"));
        info.append(chip);

        return info;
    };

    /* ------------------------------------------------------------ behaviour */

    const setMuted = (muted) => {
        state.muted = muted;

        for (const { video, section } of slides.values()) {
            video.muted = muted;

            const sound = section.querySelector('[data-role="sound"] i');
            if (sound) sound.className = `bi ${muted ? "bi-volume-mute-fill" : "bi-volume-up-fill"}`;
        }
    };

    const shareReel = async (reel) => {
        const url = `${location.origin}/reels?start=${encodeURIComponent(reel.id)}`;
        const title = `${reel.cattle.title} · BoviNetra`;

        try {
            if (navigator.share) {
                await navigator.share({ title, url });
                return;
            }

            await navigator.clipboard.writeText(url);
            toast("Link copied");
        } catch (error) {
            if (error?.name !== "AbortError") toast("Could not share. Copy the address from the browser.");
        }
    };

    const removeReel = async (reel, video) => {
        if (!confirm("Delete this reel? This cannot be undone.")) return;

        try {
            const response = await fetch(`/reels/${encodeURIComponent(reel.id)}/delete`, {
                method: "POST",
                credentials: "same-origin",
                headers: { Accept: "application/json" }
            });

            const json = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(json.message || "Could not delete the reel");

            video.pause();
            const entry = slides.get(reel.id);
            entry?.section.remove();
            slides.delete(reel.id);
            state.items = state.items.filter((item) => item.id !== reel.id);
            if (!state.items.length) showEmpty();
            toast("Reel deleted");
        } catch (error) {
            toast(error.message);
        }
    };

    const attachSource = (entry) => {
        if (entry.video.dataset.loaded === "1") return;

        const url = safeUrl(entry.reel.videoUrl) || safeUrl(entry.reel.originalUrl);
        if (!url) return;

        entry.video.dataset.loaded = "1";
        entry.video.preload = "metadata";
        entry.video.src = url;
    };

    const activate = (id) => {
        if (state.active === id) return;
        state.active = id;

        const ids = [...slides.keys()];
        const index = ids.indexOf(id);

        for (const [slideId, entry] of slides) {
            if (slideId !== id) entry.video.pause();
        }

        const current = slides.get(id);
        if (!current) return;

        attachSource(current);
        current.frame.classList.add("is-loading");
        current.video.play().catch(() => current.frame.classList.remove("is-loading"));

        /* Warm up the next one so swiping feels instant. */
        const next = slides.get(ids[index + 1]);
        if (next) attachSource(next);

        if (state.hasMore && index >= ids.length - 2) loadMore();
    };

    const observer = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting && entry.intersectionRatio >= 0.7) activate(entry.target.dataset.id);
            }
        },
        { root: feed, threshold: [0.7] }
    );

    const showEmpty = () => {
        const box = el("div", "state");
        box.append(icon("bi-camera-reels"));
        box.append(el("p", "", "No reels yet. When farmers upload videos of their cattle, they will show up here."));

        if (root.dataset.canUpload === "1") {
            const link = el("a", "pill solid", "Upload the first reel");
            link.href = "/reels/new";
            box.append(link);
        }

        feed.replaceChildren(box);
    };

    const addReels = (reels) => {
        for (const reel of reels) {
            if (slides.has(reel.id)) continue;

            const entry = buildSlide(reel);
            slides.set(reel.id, entry);
            state.items.push(reel);
            feed.append(entry.section);
            observer.observe(entry.section);
        }
    };

    const fetchPage = async (before) => {
        const params = new URLSearchParams();
        if (before) params.set("before", before);
        if (config.farmer) params.set("farmer", config.farmer);
        if (config.cattle) params.set("cattle", config.cattle);
        if (!before && config.start) params.set("start", config.start);

        const response = await fetch(`/reels/api?${params}`, {
            credentials: "same-origin",
            headers: { Accept: "application/json" }
        });

        if (!response.ok) throw new Error("Could not load reels. Please try again.");

        return (await response.json()).data;
    };

    async function loadMore() {
        if (state.loading || !state.hasMore) return;
        state.loading = true;

        try {
            const last = state.items[state.items.length - 1];
            /* Pages go newest to oldest, so "before" is the last non-pinned reel we hold. */
            const data = await fetchPage(last ? last.id : undefined);
            state.hasMore = data.hasMore;
            addReels(data.reels);
        } catch (error) {
            toast(error.message);
        } finally {
            state.loading = false;
        }
    }

    /* ------------------------------------------------------------- wiring */

    document.addEventListener("visibilitychange", () => {
        const current = slides.get(state.active);
        if (!current) return;

        if (document.hidden) current.video.pause();
        else current.video.play().catch(() => {});
    });

    document.addEventListener("keydown", (event) => {
        if (event.target.closest?.("input, textarea, select")) return;

        const key = event.key;

        if (key === "ArrowDown" || key === "ArrowUp") {
            event.preventDefault();
            feed.scrollBy({ top: (key === "ArrowDown" ? 1 : -1) * feed.clientHeight, behavior: "smooth" });
        } else if (key === " " || key === "k") {
            const current = slides.get(state.active);
            if (!current) return;
            event.preventDefault();
            if (current.video.paused) current.video.play().catch(() => {});
            else current.video.pause();
        } else if (key === "m") {
            setMuted(!state.muted);
        }
    });

    (async () => {
        state.loading = true;

        try {
            const data = await fetchPage();
            state.hasMore = data.hasMore;

            if (!data.reels.length) {
                showEmpty();
            } else {
                feed.replaceChildren();
                addReels(data.reels);
            }
        } catch (error) {
            feed.replaceChildren();
            const box = el("div", "state");
            box.append(icon("bi-wifi-off"), el("p", "", error.message));
            feed.append(box);
        } finally {
            state.loading = false;
        }
    })();
})();
