(() => {
    "use strict";

    const root = document.getElementById("reels");
    if (!root) return;

    const config = {
        me: root.dataset.me || "",
        farmer: root.dataset.farmer || "",
        cattle: root.dataset.cattle || "",
        start: root.dataset.start || "",
        canUpload: root.dataset.canUpload === "1"
    };

    const feed = document.getElementById("feed");
    const toastEl = document.getElementById("toast");
    const tabs = document.getElementById("tabs");
    const sheet = {
        root: document.getElementById("sheet"),
        title: document.getElementById("sheetTitle"),
        list: document.getElementById("sheetList"),
        more: document.getElementById("sheetMore"),
        form: document.getElementById("sheetForm"),
        input: document.getElementById("sheetInput"),
        login: document.getElementById("sheetLogin"),
        close: document.getElementById("sheetClose"),
        backdrop: document.getElementById("sheetBackdrop")
    };

    const state = { items: [], hasMore: true, loading: false, muted: true, active: null, mode: "all", token: 0 };
    const slides = new Map();
    const viewed = new Set();
    let viewTimer = null;
    let commentReel = null;
    let commentsHaveMore = false;

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

    const countLabel = (value) => {
        const number = Number(value) || 0;

        if (number >= 1000000) return `${(number / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
        if (number >= 1000) return `${(number / 1000).toFixed(1).replace(/\.0$/, "")}K`;

        return String(number);
    };

    const cattleLine = (cattle) => {
        const parts = [];
        if (cattle.category) parts.push(cattle.category);
        if (cattle.gender) parts.push(cattle.gender);
        if (typeof cattle.age === "number") parts.push(`${cattle.age} mo`);
        return parts.join(" · ");
    };

    const loginUrl = (next) => `/login?next=${encodeURIComponent(next)}`;
    const reelUrl = (reel) => `/reels?start=${encodeURIComponent(reel.id)}`;

    const api = async (path, { method = "GET", body } = {}) => {
        const response = await fetch(path, {
            method,
            credentials: "same-origin",
            headers: {
                Accept: "application/json",
                ...(body ? { "Content-Type": "application/json" } : {})
            },
            body: body ? JSON.stringify(body) : undefined
        });

        if (response.status === 401) {
            location.href = loginUrl(location.pathname + location.search);
            throw new Error("Please sign in first.");
        }

        const json = await response.json().catch(() => ({}));

        if (!response.ok) throw new Error(json.message || "Something went wrong");

        return json.data;
    };

    const requireLogin = (reel) => {
        if (config.me) return true;

        location.href = loginUrl(reelUrl(reel));

        return false;
    };

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
        video.addEventListener("playing", () => frame.classList.remove("is-loading", "is-paused"));
        video.addEventListener("pause", () => frame.classList.add("is-paused"));
        video.addEventListener("canplay", () => frame.classList.remove("is-loading"));

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

        const entry = { section, frame, video, reel, refs: {} };

        frame.append(video, tap, mark, el("div", "loader"), buildSide(entry), buildInfo(entry));
        section.append(frame);

        return entry;
    };

    const actionButton = (className, label, iconName, text) => {
        const button = el("button", `act ${className}`);
        button.type = "button";
        button.setAttribute("aria-label", label);
        const glyph = icon(iconName);
        const caption = el("span", "", text || "");
        button.append(glyph, caption);

        return { button, glyph, caption };
    };

    const paintLike = (entry) => {
        const { reel, refs } = entry;
        refs.likeGlyph.className = `bi ${reel.liked ? "bi-heart-fill" : "bi-heart"}`;
        refs.likeCaption.textContent = countLabel(reel.likeCount);
        refs.like.setAttribute("aria-pressed", String(Boolean(reel.liked)));
    };

    const paintSave = (entry) => {
        const { reel, refs } = entry;
        refs.saveGlyph.className = `bi ${reel.saved ? "bi-bookmark-fill" : "bi-bookmark"}`;
        refs.save.setAttribute("aria-pressed", String(Boolean(reel.saved)));
    };

    const buildSide = (entry) => {
        const { reel, refs } = entry;
        const side = el("div", "side");

        const like = actionButton("like", "Like this reel", "bi-heart", countLabel(reel.likeCount));
        refs.like = like.button;
        refs.likeGlyph = like.glyph;
        refs.likeCaption = like.caption;
        like.button.addEventListener("click", () => toggleLike(entry));
        side.append(like.button);
        paintLike(entry);

        const comment = actionButton("comment", "Open comments", "bi-chat-left-text-fill", countLabel(reel.commentCount));
        refs.commentCaption = comment.caption;
        comment.button.addEventListener("click", () => openComments(reel));
        side.append(comment.button);

        if (!reel.mine) {
            const save = actionButton("save", "Save this cattle", "bi-bookmark");
            refs.save = save.button;
            refs.saveGlyph = save.glyph;
            save.button.addEventListener("click", () => toggleSave(entry));
            side.append(save.button);
            paintSave(entry);

            const chat = el("a", "act chat");
            chat.href = config.me
                ? `/chat?with=${encodeURIComponent(reel.farmer.id)}`
                : loginUrl(`/chat?with=${reel.farmer.id}`);
            chat.setAttribute("aria-label", `Message ${reel.farmer.fullName}`);
            chat.append(icon("bi-chat-dots-fill"), el("span", "", ""));
            side.append(chat);
        }

        const details = el("a", "act");
        details.href = `/cattle/${encodeURIComponent(reel.cattle.id)}`;
        details.setAttribute("aria-label", "See all details of this cattle");
        details.append(icon("bi-card-list"), el("span", "", ""));
        side.append(details);

        const share = actionButton("share", "Share this reel", "bi-share-fill");
        share.button.addEventListener("click", () => shareReel(reel));
        side.append(share.button);

        const sound = actionButton("sound", "Turn sound on or off", state.muted ? "bi-volume-mute-fill" : "bi-volume-up-fill");
        sound.button.dataset.role = "sound";
        sound.button.addEventListener("click", () => setMuted(!state.muted));
        side.append(sound.button);

        if (reel.mine) {
            const remove = actionButton("danger", "Delete this reel", "bi-trash3-fill");
            remove.button.addEventListener("click", () => removeReel(entry));
            side.append(remove.button);
        }

        return side;
    };

    const paintFollow = (entry) => {
        const { reel, refs } = entry;
        if (!refs.follow) return;

        refs.follow.textContent = reel.farmer.following ? "Following" : "Follow";
        refs.follow.classList.toggle("on", Boolean(reel.farmer.following));
        refs.follow.setAttribute("aria-pressed", String(Boolean(reel.farmer.following)));
    };

    const contactLink = (reel, kind) => {
        const phone = reel.farmer.phone;
        const link = el("a", `contact ${kind}`);

        if (!phone) {
            link.href = loginUrl(reelUrl(reel));
        } else if (kind === "call") {
            link.href = `tel:+91${phone}`;
        } else {
            const text = `Hi, I saw your reel for ${reel.cattle.title} on BoviNetra. Is it still available?`;
            link.href = `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
        }

        link.append(icon(kind === "call" ? "bi-telephone-fill" : "bi-whatsapp"), document.createTextNode(kind === "call" ? " Call" : " WhatsApp"));

        return link;
    };

    const buildInfo = (entry) => {
        const { reel, refs } = entry;
        const info = el("div", "info");

        const row = el("div", "farmer-row");
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
        const nameLine = el("strong", "", reel.farmer.fullName);

        if (reel.farmer.verified) {
            const badge = icon("bi-patch-check-fill");
            badge.classList.add("verified");
            badge.setAttribute("title", "Verified farmer");
            nameLine.append(badge);
        }

        who.append(nameLine, el("span", "", place || `@${reel.farmer.username}`));
        farmer.append(av, who);
        row.append(farmer);

        if (!reel.mine) {
            const follow = el("button", "follow");
            follow.type = "button";
            refs.follow = follow;
            follow.addEventListener("click", () => toggleFollow(entry));
            row.append(follow);
            paintFollow(entry);
        }

        info.append(row);

        if (!reel.mine && reel.farmer.canContact) {
            const contacts = el("div", "contacts");
            contacts.append(contactLink(reel, "call"), contactLink(reel, "whatsapp"));
            info.append(contacts);
        }

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

        const views = el("p", "views");
        refs.views = el("span", "", `${countLabel(reel.viewCount)} views`);
        views.append(icon("bi-eye-fill"), refs.views);
        info.append(views);

        return info;
    };

    const setMuted = (muted) => {
        state.muted = muted;

        for (const { video, section } of slides.values()) {
            video.muted = muted;

            const sound = section.querySelector('[data-role="sound"] i');
            if (sound) sound.className = `bi ${muted ? "bi-volume-mute-fill" : "bi-volume-up-fill"}`;
        }
    };

    const toggleLike = async (entry) => {
        const { reel, refs } = entry;
        if (!requireLogin(reel)) return;

        refs.like.disabled = true;

        try {
            const data = await api(`/reels/${encodeURIComponent(reel.id)}/like`, { method: "POST" });
            reel.liked = Boolean(data.liked);
            reel.likeCount = Number(data.likeCount) || 0;
            paintLike(entry);
        } catch (error) {
            toast(error.message);
        } finally {
            refs.like.disabled = false;
        }
    };

    const toggleSave = async (entry) => {
        const { reel, refs } = entry;
        if (!requireLogin(reel)) return;

        refs.save.disabled = true;

        try {
            const data = await api("/wishlist/toggle", {
                method: "POST",
                body: { cattleId: reel.cattle.id, reelId: reel.id }
            });

            reel.saved = Boolean(data.saved);
            paintSave(entry);
            toast(reel.saved ? "Saved to your list" : "Removed from saved");
        } catch (error) {
            toast(error.message);
        } finally {
            refs.save.disabled = false;
        }
    };

    const toggleFollow = async (entry) => {
        const { reel, refs } = entry;
        if (!requireLogin(reel)) return;

        const action = reel.farmer.following ? "unfollow" : "follow";
        refs.follow.disabled = true;

        try {
            const data = await api(`/farmers/${encodeURIComponent(reel.farmer.username)}/${action}`, { method: "POST" });

            for (const other of slides.values()) {
                if (other.reel.farmer.id === reel.farmer.id) {
                    other.reel.farmer.following = Boolean(data.following);
                    paintFollow(other);
                }
            }

            toast(data.following ? `Following ${reel.farmer.fullName}` : `Unfollowed ${reel.farmer.fullName}`);
        } catch (error) {
            toast(error.message);
        } finally {
            refs.follow.disabled = false;
        }
    };

    const shareReel = async (reel) => {
        const url = `${location.origin}${reelUrl(reel)}`;
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

    const removeReel = async (entry) => {
        const { reel, video } = entry;
        if (!confirm("Delete this reel? This cannot be undone.")) return;

        try {
            await api(`/reels/${encodeURIComponent(reel.id)}/delete`, { method: "POST" });

            video.pause();
            entry.section.remove();
            slides.delete(reel.id);
            state.items = state.items.filter((item) => item.id !== reel.id);
            if (!state.items.length) showEmpty();
            toast("Reel deleted");
        } catch (error) {
            toast(error.message);
        }
    };

    const commentItem = (comment) => {
        const item = el("li", "comment");
        item.dataset.id = comment.id;

        const av = el("span", "av");
        const avatar = safeUrl(comment.user.avatar);

        if (avatar) {
            const img = document.createElement("img");
            img.alt = "";
            img.src = avatar;
            img.loading = "lazy";
            av.append(img);
        } else {
            av.textContent = initials(comment.user.fullName);
        }

        const body = el("div", "body");
        const head = el("strong", "", comment.user.fullName);
        const time = el("time", "", new Date(comment.createdAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }));
        body.append(head, time, el("p", "", comment.text));
        item.append(av, body);

        if (comment.canDelete) {
            const remove = el("button", "remove");
            remove.type = "button";
            remove.setAttribute("aria-label", "Delete comment");
            remove.append(icon("bi-trash3"));
            remove.addEventListener("click", () => deleteComment(comment, item));
            item.append(remove);
        }

        return item;
    };

    const loadComments = async (append) => {
        if (!commentReel) return;

        const last = sheet.list.lastElementChild;
        const params = new URLSearchParams();
        if (append && last?.dataset.id) params.set("before", last.dataset.id);

        const reelId = commentReel.id;
        const data = await api(`/reels/${encodeURIComponent(reelId)}/comments?${params}`);

        if (!commentReel || commentReel.id !== reelId) return;

        if (!append) sheet.list.replaceChildren();

        if (!data.comments.length && !append) {
            sheet.list.append(el("li", "none", "No comments yet. Be the first to ask about this cattle."));
        }

        for (const comment of data.comments) sheet.list.append(commentItem(comment));

        commentsHaveMore = data.hasMore;
        sheet.more.hidden = !commentsHaveMore;
    };

    const syncCommentCount = (reel, delta) => {
        reel.commentCount = Math.max(0, (Number(reel.commentCount) || 0) + delta);
        const entry = slides.get(reel.id);
        if (entry) entry.refs.commentCaption.textContent = countLabel(reel.commentCount);
        sheet.title.textContent = `Comments (${reel.commentCount})`;
    };

    const openComments = async (reel) => {
        commentReel = reel;
        sheet.title.textContent = `Comments (${reel.commentCount})`;
        sheet.list.replaceChildren(el("li", "none", "Loading…"));
        sheet.more.hidden = true;
        sheet.root.hidden = false;
        sheet.form.hidden = !config.me;
        sheet.login.hidden = Boolean(config.me);
        sheet.login.href = loginUrl(reelUrl(reel));

        try {
            await loadComments(false);
        } catch (error) {
            sheet.list.replaceChildren(el("li", "none", error.message));
        }

        if (config.me) sheet.input.focus({ preventScroll: true });
    };

    const closeComments = () => {
        sheet.root.hidden = true;
        commentReel = null;
    };

    const deleteComment = async (comment, item) => {
        if (!commentReel) return;

        const reel = commentReel;

        try {
            await api(`/reels/${encodeURIComponent(reel.id)}/comments/${encodeURIComponent(comment.id)}/delete`, { method: "POST" });
            item.remove();
            syncCommentCount(reel, -1);
            if (!sheet.list.children.length) sheet.list.append(el("li", "none", "No comments yet. Be the first to ask about this cattle."));
        } catch (error) {
            toast(error.message);
        }
    };

    const submitComment = async (event) => {
        event.preventDefault();

        const text = sheet.input.value.trim();
        if (!text || !commentReel) return;

        const reel = commentReel;
        sheet.input.disabled = true;

        try {
            const data = await api(`/reels/${encodeURIComponent(reel.id)}/comments`, { method: "POST", body: { text } });

            sheet.list.querySelector(".none")?.remove();
            sheet.list.prepend(commentItem(data.comment));
            sheet.input.value = "";
            syncCommentCount(reel, 1);
        } catch (error) {
            toast(error.message);
        } finally {
            sheet.input.disabled = false;
            sheet.input.focus({ preventScroll: true });
        }
    };

    const countView = (reel) => {
        if (viewed.has(reel.id) || reel.mine) return;

        viewed.add(reel.id);

        fetch(`/reels/${encodeURIComponent(reel.id)}/view`, {
            method: "POST",
            credentials: "same-origin",
            headers: { Accept: "application/json" },
            keepalive: true
        })
            .then(() => {
                reel.viewCount = (Number(reel.viewCount) || 0) + 1;
                const entry = slides.get(reel.id);
                if (entry) entry.refs.views.textContent = `${countLabel(reel.viewCount)} views`;
            })
            .catch(() => viewed.delete(reel.id));
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

        clearTimeout(viewTimer);

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

        viewTimer = setTimeout(() => {
            if (state.active === id && !current.video.paused) countView(current.reel);
        }, 2000);

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
        box.append(icon(state.mode === "following" ? "bi-people" : "bi-camera-reels"));

        if (state.mode === "following") {
            box.append(el("p", "", "Nothing here yet. Follow farmers and their new reels will show up first."));
            const browse = el("button", "pill solid", "Browse all reels");
            browse.type = "button";
            browse.addEventListener("click", () => switchMode("all"));
            box.append(browse);
        } else {
            box.append(el("p", "", "No reels yet. When farmers upload videos of their cattle, they will show up here."));

            if (config.canUpload) {
                const link = el("a", "pill solid", "Upload the first reel");
                link.href = "/reels/new";
                box.append(link);
            }
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
        if (state.mode === "following") params.set("feed", "following");
        if (!before && config.start && state.mode === "all") params.set("start", config.start);

        return api(`/reels/api?${params}`);
    };

    async function loadMore() {
        if (state.loading || !state.hasMore) return;

        state.loading = true;
        const token = state.token;

        try {
            const last = state.items[state.items.length - 1];
            const data = await fetchPage(last ? last.id : undefined);

            if (token !== state.token) return;

            state.hasMore = data.hasMore;
            addReels(data.reels);
        } catch (error) {
            toast(error.message);
        } finally {
            state.loading = false;
        }
    }

    const paintTabs = () => {
        if (!tabs) return;

        tabs.querySelectorAll("button").forEach((button) => {
            const on = button.dataset.feed === state.mode;
            button.setAttribute("aria-pressed", String(on));
            button.classList.toggle("on", on);
        });
    };

    const loadFirst = async () => {
        state.token += 1;
        const token = state.token;

        for (const entry of slides.values()) entry.video.pause();

        slides.clear();
        state.items = [];
        state.hasMore = true;
        state.active = null;
        state.loading = true;
        clearTimeout(viewTimer);
        paintTabs();
        feed.replaceChildren(el("div", "state", "Loading reels…"));

        try {
            const data = await fetchPage();

            if (token !== state.token) return;

            state.hasMore = data.hasMore;

            if (!data.reels.length) {
                showEmpty();
            } else {
                feed.replaceChildren();
                addReels(data.reels);
                feed.scrollTop = 0;
            }
        } catch (error) {
            if (token !== state.token) return;

            const box = el("div", "state");
            box.append(icon("bi-wifi-off"), el("p", "", error.message));
            feed.replaceChildren(box);
        } finally {
            if (token === state.token) state.loading = false;
        }
    };

    function switchMode(mode) {
        if (mode === state.mode) return;

        if (mode === "following" && !config.me) {
            location.href = loginUrl("/reels");
            return;
        }

        state.mode = mode;
        loadFirst();
    }

    tabs?.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => switchMode(button.dataset.feed));
    });

    sheet.form?.addEventListener("submit", submitComment);
    sheet.close?.addEventListener("click", closeComments);
    sheet.backdrop?.addEventListener("click", closeComments);
    sheet.more?.addEventListener("click", () => loadComments(true).catch((error) => toast(error.message)));

    document.addEventListener("visibilitychange", () => {
        const current = slides.get(state.active);
        if (!current) return;

        if (document.hidden) current.video.pause();
        else current.video.play().catch(() => {});
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !sheet.root.hidden) {
            closeComments();
            return;
        }

        if (event.target.closest?.("input, textarea, select") || !sheet.root.hidden) return;

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

    loadFirst();
})();
