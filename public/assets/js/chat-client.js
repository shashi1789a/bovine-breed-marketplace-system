(() => {
    "use strict";

    const $ = (id) => document.getElementById(id);

    const els = {
        app: $("app"),
        conversationList: $("conversationList"),
        listEmpty: $("listEmpty"),
        searchResults: $("searchResults"),
        userSearch: $("userSearch"),
        roleFilter: $("roleFilter"),
        threadEmpty: $("threadEmpty"),
        thread: $("thread"),
        threadAvatar: $("threadAvatar"),
        threadName: $("threadName"),
        threadStatus: $("threadStatus"),
        messages: $("messages"),
        composer: $("composer"),
        messageInput: $("messageInput"),
        callBtn: $("callBtn"),
        backBtn: $("backBtn"),
        connBanner: $("connBanner"),
        toast: $("toast"),
        incoming: $("incomingCall"),
        incomingName: $("incomingName"),
        incomingAvatar: $("incomingAvatar"),
        incomingAccept: $("incomingAccept"),
        incomingDecline: $("incomingDecline"),
        overlay: $("callOverlay"),
        callPeer: $("callPeer"),
        callStatus: $("callStatus"),
        remoteVideo: $("remoteVideo"),
        localVideo: $("localVideo"),
        micBtn: $("micBtn"),
        camBtn: $("camBtn"),
        hangupBtn: $("hangupBtn"),
        flipBtn: $("flipBtn"),
        fileInput: $("fileInput"),
        attachBtn: $("attachBtn"),
        attachBar: $("attachBar"),
        attachThumb: $("attachThumb"),
        attachName: $("attachName"),
        attachSize: $("attachSize"),
        attachCancel: $("attachCancel"),
        replyBar: $("replyBar"),
        replyName: $("replyName"),
        replyText: $("replyText"),
        replyCancel: $("replyCancel"),
        msgMenu: $("msgMenu"),
        menuReply: $("menuReply"),
        menuForward: $("menuForward"),
        menuCopy: $("menuCopy"),
        forwardDialog: $("forwardDialog"),
        forwardClose: $("forwardClose"),
        forwardPreview: $("forwardPreview"),
        forwardSearch: $("forwardSearch"),
        forwardList: $("forwardList"),
        forwardCount: $("forwardCount"),
        forwardConfirm: $("forwardConfirm")
    };

    const state = {
        me: null,
        conversations: [],
        activeId: null,
        ice: null,
        reply: null, // the message the next send will answer
        file: null // a file chosen but not sent yet
    };

    const MAX_FILE_BYTES = 10 * 1024 * 1024;
    const MAX_FORWARD_TARGETS = 5;
    const ALLOWED_FILE_TYPES = new Set([
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
        "text/csv"
    ]);
    const threads = new Map(); // conversationId -> { items, hasMore, loaded }

    let socket = null;
    let authRetries = 0;
    let hasConnectedBefore = false;
    let call = null; // the call this tab is part of
    let incoming = null; // a call that is ringing here

    /* ------------------------------------------------------------ helpers */

    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };

    let toastTimer;
    const toast = (message) => {
        els.toast.textContent = message;
        els.toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => (els.toast.hidden = true), 4500);
    };

    const api = async (path, { method = "GET", body } = {}) => {
        const response = await fetch(path, {
            method,
            credentials: "same-origin",
            headers: {
                Accept: "application/json",
                ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {})
            },
            body: !body ? undefined : body instanceof FormData ? body : JSON.stringify(body)
        });

        if (response.status === 401) {
            location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
            throw new Error("Please sign in again.");
        }

        const json = await response.json().catch(() => ({}));

        if (!response.ok) throw new Error(json.message || "Something went wrong");

        return json.data;
    };

    const timeLabel = (iso) =>
        new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const durationLabel = (seconds) => {
        const total = Math.max(0, Math.round(seconds || 0));
        const minutes = Math.floor(total / 60);
        return `${minutes}:${String(total % 60).padStart(2, "0")}`;
    };

    const initials = (name) =>
        String(name || "?")
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toUpperCase();

    const avatar = (person, wrap = el("span", "avatar")) => {
        if (person?.avatar) {
            const img = document.createElement("img");
            img.alt = "";
            img.src = person.avatar;
            img.addEventListener("error", () => wrap.replaceChildren(initials(person.fullName)));
            wrap.replaceChildren(img);
        } else {
            wrap.replaceChildren(initials(person?.fullName));
        }

        return wrap;
    };

    const fillAvatar = (target, person) => avatar(person, target);

    const findConversation = (id) => state.conversations.find((conv) => conv.id === id);
    const activeConversation = () => findConversation(state.activeId);

    const ensureThread = (id) => {
        if (!threads.has(id)) threads.set(id, { items: [], hasMore: false, loaded: false });
        return threads.get(id);
    };

    const previewOf = (message) => {
        if (message.type === "call") {
            return message.call?.outcome === "missed" ? "Missed video call" : "Video call";
        }

        if (message.type === "file") {
            const label = message.attachment?.kind === "image" ? "Photo" : message.attachment?.name || "File";
            return message.text ? `${label}: ${message.text}` : label;
        }

        return message.text;
    };

    /* Only web addresses and local previews may become links or image sources. */
    const safeUrl = (value) => (/^(https?:|blob:)/i.test(String(value || "")) ? value : "");

    const formatSize = (bytes) => {
        const size = Number(bytes) || 0;

        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;

        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    };

    const fileIcon = (name, mimeType) => {
        const lower = `${name || ""} ${mimeType || ""}`.toLowerCase();

        if (lower.includes("pdf")) return "bi-file-earmark-pdf-fill";
        if (/\.(docx?)\b|word/.test(lower)) return "bi-file-earmark-word-fill";
        if (/\.(xlsx?|csv)\b|excel|spreadsheet|csv/.test(lower)) return "bi-file-earmark-excel-fill";
        if (/\.(pptx?)\b|powerpoint|presentation/.test(lower)) return "bi-file-earmark-ppt-fill";
        if (/\.txt\b|text\/plain/.test(lower)) return "bi-file-earmark-text-fill";

        return "bi-file-earmark-fill";
    };

    const icon = (name) => {
        const node = el("i", `bi ${name}`);
        node.setAttribute("aria-hidden", "true");
        return node;
    };

    const whoLabel = (senderId) =>
        senderId === state.me.id ? "You" : activeConversation()?.other.fullName || "Them";

    /* One line describing a message, for quotes and the forward dialog. */
    const snippetOf = (message) => {
        if (message.type === "file") {
            const kind = message.attachment?.kind || message.attachmentKind;
            const name = message.attachment?.name || message.attachmentName;
            const label = kind === "image" ? "Photo" : name || "File";

            return message.text ? `${label} · ${message.text}` : label;
        }

        return message.text || "";
    };

    const replySnapshot = (message) => ({
        messageId: message.id,
        senderId: message.senderId,
        type: message.type === "file" ? "file" : "text",
        text: String(message.text || "").slice(0, 200),
        attachmentName: message.attachment?.name || "",
        attachmentKind: message.attachment?.kind || ""
    });

    /* ------------------------------------------------------ conversation list */

    const sortConversations = () =>
        state.conversations.sort(
            (a, b) =>
                new Date(b.lastMessage?.at || b.updatedAt || 0) -
                new Date(a.lastMessage?.at || a.updatedAt || 0)
        );

    const renderConversations = () => {
        const frag = document.createDocumentFragment();

        for (const conv of state.conversations) {
            const row = el("li");
            const button = el("button", "person");
            button.type = "button";
            button.setAttribute("aria-current", String(conv.id === state.activeId));

            const body = el("div", "person-body");
            const top = el("div", "person-name");
            top.append(el("span", "", conv.other.fullName));
            if (conv.lastMessage) top.append(el("time", "", timeLabel(conv.lastMessage.at)));

            const bottom = el("div", "person-sub");
            bottom.append(el("span", "", conv.lastMessage ? conv.lastMessage.text : "Say hello"));
            if (conv.unread > 0) bottom.append(el("span", "badge", String(conv.unread)));

            body.append(top, bottom);
            button.append(avatar(conv.other), body);
            button.addEventListener("click", () => openConversation(conv.id));
            row.append(button);
            frag.append(row);
        }

        els.conversationList.replaceChildren(frag);
        els.listEmpty.hidden = state.conversations.length > 0 || !els.searchResults.hidden;
    };

    const loadConversations = async () => {
        state.conversations = await api("/chat/api/conversations");
        sortConversations();
        renderConversations();
    };

    /* ------------------------------------------------------------- thread */

    const renderMessage = (message) => {
        const mine = message.senderId === state.me.id;

        if (message.type === "call") {
            const outcome = message.call?.outcome;
            const missed = outcome === "missed";
            let label = "Video call ended";

            if (outcome === "ended" && message.call.durationSec > 0) {
                label = `Video call · ${durationLabel(message.call.durationSec)}`;
            } else if (missed) {
                label = mine ? "No answer" : "Missed video call";
            } else if (outcome === "declined") {
                label = mine ? "Call declined" : "You declined a video call";
            }

            const row = el("div", `call-log${missed ? " missed" : ""}`);
            const icon = el("i", `bi ${missed ? "bi-camera-video-off-fill" : "bi-camera-video-fill"}`);
            icon.setAttribute("aria-hidden", "true");
            row.append(icon, el("span", "", `${label} · ${timeLabel(message.createdAt)}`));
            return row;
        }

        const settled = !message.pending && !message.failed;
        const bubble = el(
            "div",
            `msg${mine ? " mine" : ""}${message.pending ? " pending" : ""}${message.failed ? " failed" : ""}${settled ? " has-more" : ""}`
        );
        bubble.dataset.id = message.id;

        if (message.forwarded) {
            const tag = el("div", "fwd-tag");
            tag.append(icon("bi-arrow-90deg-right"), el("span", "", "Forwarded"));
            bubble.append(tag);
        }

        if (message.replyTo) bubble.append(renderQuote(message.replyTo));
        if (message.attachment) bubble.append(renderAttachment(message.attachment));
        if (message.text) bubble.append(el("p", "", message.text));

        bubble.append(
            el("time", "", message.failed ? "Not sent" : message.pending ? "Sending…" : timeLabel(message.createdAt))
        );

        if (settled) {
            const more = el("button", "msg-more");
            more.type = "button";
            more.setAttribute("aria-label", "Message options");
            more.setAttribute("aria-haspopup", "menu");
            more.append(icon("bi-chevron-down"));
            more.addEventListener("click", (event) => {
                event.stopPropagation();
                openMenu(message, more);
            });
            bubble.append(more);

            /* Right-click, or long-press on a phone. */
            bubble.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                openMenu(message, more);
            });

            enableSwipeReply(bubble, message);
        }

        return bubble;
    };

    const renderQuote = (reply) => {
        const quote = el("button", "quote");
        quote.type = "button";
        quote.title = "Go to the original message";

        const name = el("strong", "", whoLabel(reply.senderId));
        const line = el("span");

        if (reply.type === "file") {
            line.append(icon(reply.attachmentKind === "image" ? "bi-image" : "bi-file-earmark"), ` ${snippetOf(reply)}`);
        } else {
            line.textContent = reply.text;
        }

        quote.append(name, line);
        quote.addEventListener("click", () => scrollToMessage(reply.messageId));

        return quote;
    };

    const renderAttachment = (attachment) => {
        const url = safeUrl(attachment.url);

        if (attachment.kind === "image") {
            const holder = url ? el("a", "att-image") : el("div", "att-image");

            if (url) {
                holder.href = url;
                holder.target = "_blank";
                holder.rel = "noopener noreferrer";
                holder.setAttribute("aria-label", `Open photo ${attachment.name}`);
            }

            const img = document.createElement("img");
            img.alt = attachment.name;
            img.loading = "lazy";
            img.src = url;
            holder.append(img);

            return holder;
        }

        const card = url ? el("a", "att-file") : el("div", "att-file");

        if (url) {
            card.href = url;
            card.target = "_blank";
            card.rel = "noopener noreferrer";
            card.title = "Open or download";
        }

        const info = el("div", "att-file-info");
        info.append(el("strong", "", attachment.name), el("small", "", formatSize(attachment.size)));

        card.append(icon(fileIcon(attachment.name, attachment.mimeType)), info);
        if (url) card.append(icon("bi-download"));

        return card;
    };

    function scrollToMessage(messageId) {
        const target = els.messages.querySelector(`[data-id="${CSS.escape(messageId)}"]`);

        if (!target) {
            toast("That message is older. Scroll up and load earlier messages.");
            return;
        }

        target.scrollIntoView({ block: "center", behavior: "smooth" });
        target.classList.remove("flash");
        void target.offsetWidth;
        target.classList.add("flash");
    }

    /* Drag a message to the right to reply, like WhatsApp. */
    function enableSwipeReply(bubble, message) {
        let startX = 0;
        let startY = 0;
        let offset = 0;
        let tracking = false;

        bubble.addEventListener(
            "touchstart",
            (event) => {
                if (event.touches.length !== 1) return;

                startX = event.touches[0].clientX;
                startY = event.touches[0].clientY;
                offset = 0;
                tracking = true;
            },
            { passive: true }
        );

        bubble.addEventListener(
            "touchmove",
            (event) => {
                if (!tracking) return;

                const dx = event.touches[0].clientX - startX;
                const dy = event.touches[0].clientY - startY;

                if (Math.abs(dy) > Math.abs(dx) + 6) {
                    tracking = false;
                    bubble.style.transform = "";
                    return;
                }

                offset = Math.max(0, Math.min(dx, 72));
                bubble.style.transition = "none";
                bubble.style.transform = `translateX(${offset}px)`;
            },
            { passive: true }
        );

        const finish = () => {
            if (!tracking) return;

            tracking = false;
            bubble.style.transition = "";
            bubble.style.transform = "";

            if (offset >= 56) startReply(message);

            offset = 0;
        };

        bubble.addEventListener("touchend", finish);
        bubble.addEventListener("touchcancel", finish);
    }

    /* --------------------------------------------------- message menu / reply */

    let menuMessage = null;

    function openMenu(message, anchor) {
        menuMessage = message;
        els.menuCopy.hidden = !(message.text || message.attachment);
        els.msgMenu.hidden = false;

        const box = anchor.getBoundingClientRect();
        const menu = els.msgMenu.getBoundingClientRect();
        const left = Math.min(Math.max(8, box.right - menu.width), window.innerWidth - menu.width - 8);
        const top = box.bottom + menu.height + 8 > window.innerHeight ? box.top - menu.height - 4 : box.bottom + 4;

        els.msgMenu.style.left = `${left}px`;
        els.msgMenu.style.top = `${Math.max(8, top)}px`;
        els.menuReply.focus({ preventScroll: true });
    }

    const closeMenu = () => {
        els.msgMenu.hidden = true;
        menuMessage = null;
    };

    function startReply(message) {
        if (!activeConversation() || message.pending || message.failed) return;

        state.reply = replySnapshot(message);

        els.replyName.textContent = `Replying to ${whoLabel(message.senderId)}`;
        els.replyText.textContent = snippetOf(message) || "Message";
        els.replyBar.hidden = false;
        els.messageInput.focus({ preventScroll: true });
    }

    const clearReply = () => {
        state.reply = null;
        els.replyBar.hidden = true;
    };

    const copyMessage = async (message) => {
        const text = message.text || message.attachment?.url || "";

        try {
            await navigator.clipboard.writeText(text);
            toast("Copied");
        } catch {
            toast("Could not copy. Select the text and copy it by hand.");
        }
    };

    /*
     * Messages never change once they are sent, so keep the DOM node and reuse it.
     * Without this every new message rebuilt every bubble (and re-created every image).
     */
    const nodeCache = new Map();
    const NODE_CACHE_LIMIT = 400;

    const nodeFor = (message) => {
        const key = `${message.id}|${message.pending ? 1 : 0}|${message.failed ? 1 : 0}`;
        const cached = nodeCache.get(message.id);

        if (cached && cached.key === key) return cached.node;

        const node = renderMessage(message);

        if (nodeCache.size >= NODE_CACHE_LIMIT) nodeCache.delete(nodeCache.keys().next().value);
        nodeCache.set(message.id, { key, node });

        return node;
    };

    const renderMessages = (scrollToEnd) => {
        const thread = threads.get(state.activeId);
        if (!thread) return;

        const box = els.messages;
        const previousHeight = box.scrollHeight;
        const previousTop = box.scrollTop;
        const frag = document.createDocumentFragment();

        if (thread.hasMore) {
            const more = el("button", "load-older", "Load earlier messages");
            more.type = "button";
            more.addEventListener("click", loadOlder);
            frag.append(more);
        }

        for (const message of thread.items) frag.append(nodeFor(message));

        box.replaceChildren(frag);
        box.scrollTop = scrollToEnd ? box.scrollHeight : previousTop + (box.scrollHeight - previousHeight);
    };

    const setStatus = (text) => {
        const conv = activeConversation();
        els.threadStatus.textContent = text || (conv ? conv.other.role : "");
        els.threadStatus.style.textTransform = text ? "none" : "capitalize";
    };

    const fetchMessages = async (conversationId, before) => {
        const params = new URLSearchParams({ limit: "30" });
        if (before) params.set("before", before);

        return api(`/chat/api/conversations/${encodeURIComponent(conversationId)}/messages?${params}`);
    };

    async function loadOlder() {
        const thread = threads.get(state.activeId);
        if (!thread || !thread.items.length) return;

        const firstReal = thread.items.find((item) => !item.pending && !item.failed);

        try {
            const data = await fetchMessages(state.activeId, firstReal?.id);
            thread.items = [...data.messages, ...thread.items];
            thread.hasMore = data.hasMore;
            renderMessages(false);
        } catch (error) {
            toast(error.message);
        }
    }

    const markRead = (conversationId) => {
        const conv = findConversation(conversationId);
        if (!conv) return;

        const hadUnread = conv.unread > 0;
        conv.unread = 0;
        renderConversations();

        if (hadUnread && socket) socket.emit("chat:read", { conversationId });
    };

    async function openConversation(conversationId) {
        const conv = findConversation(conversationId);
        if (!conv) return;

        if (state.activeId !== conversationId) {
            clearReply();
            clearAttachment();
        }

        state.activeId = conversationId;
        els.app.dataset.view = "thread";
        els.threadEmpty.hidden = true;
        els.thread.hidden = false;
        els.threadName.textContent = conv.other.fullName;
        fillAvatar(els.threadAvatar, conv.other);
        setStatus("");
        renderConversations();

        const thread = ensureThread(conversationId);

        if (!thread.loaded) {
            els.messages.replaceChildren(el("p", "empty", "Loading messages…"));

            try {
                const data = await fetchMessages(conversationId);
                thread.items = data.messages;
                thread.hasMore = data.hasMore;
                thread.loaded = true;
            } catch (error) {
                toast(error.message);
                return;
            }
        }

        if (state.activeId !== conversationId) return;

        renderMessages(true);
        markRead(conversationId);

        if (window.matchMedia("(min-width: 769px)").matches) {
            els.messageInput.focus({ preventScroll: true });
        }
    }

    const closeThreadOnMobile = () => {
        els.app.dataset.view = "list";
    };

    /* ----------------------------------------------------------- attachments */

    const clearAttachment = () => {
        const preview = els.attachThumb.querySelector("img");
        if (preview?.src.startsWith("blob:")) URL.revokeObjectURL(preview.src);

        state.file = null;
        els.fileInput.value = "";
        els.attachBar.hidden = true;
        els.attachThumb.replaceChildren();
    };

    const chooseFile = (file) => {
        if (!file) return;

        if (!ALLOWED_FILE_TYPES.has(file.type)) {
            toast("That file type is not allowed. Send an image, PDF, Word, Excel, PowerPoint, TXT or CSV file.");
            els.fileInput.value = "";
            return;
        }

        if (file.size > MAX_FILE_BYTES) {
            toast("That file is too large. The limit is 10 MB.");
            els.fileInput.value = "";
            return;
        }

        clearAttachment();
        state.file = file;

        if (file.type.startsWith("image/")) {
            const img = document.createElement("img");
            img.alt = "";
            img.src = URL.createObjectURL(file);
            els.attachThumb.replaceChildren(img);
        } else {
            els.attachThumb.replaceChildren(icon(fileIcon(file.name, file.type)));
        }

        els.attachName.textContent = file.name;
        els.attachSize.textContent = formatSize(file.size);
        els.attachBar.hidden = false;
        els.messageInput.focus({ preventScroll: true });
    };

    /* ----------------------------------------------------------- sending */

    const updateLastMessage = (conv, message) => {
        conv.lastMessage = {
            text: previewOf(message),
            type: message.type,
            senderId: message.senderId,
            at: message.createdAt
        };

        sortConversations();
        renderConversations();
    };

    /* Swaps the "sending…" bubble for the real message (which may already have arrived by socket). */
    const settleLocal = (thread, clientId, message) => {
        const index = thread.items.findIndex((item) => item.clientId === clientId);
        const alreadyHere = thread.items.some((item) => item.id === message.id);

        if (index >= 0 && !alreadyHere) thread.items[index] = message;
        else if (index >= 0) thread.items.splice(index, 1);
        else if (!alreadyHere) thread.items.push(message);
    };

    const sendFileMessage = async (conv, file, caption, replyTarget) => {
        const clientId = newClientId();
        const thread = ensureThread(conv.id);
        const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : "";

        thread.items.push({
            id: `local-${clientId}`,
            clientId,
            conversationId: conv.id,
            senderId: state.me.id,
            type: "file",
            text: caption,
            attachment: {
                url: previewUrl,
                name: file.name,
                mimeType: file.type,
                size: file.size,
                kind: previewUrl ? "image" : "file"
            },
            replyTo: replyTarget || null,
            createdAt: new Date().toISOString(),
            pending: true
        });

        els.messageInput.value = "";
        autosize();
        clearReply();
        clearAttachment();
        renderMessages(true);

        const form = new FormData();
        form.append("file", file);
        form.append("clientId", clientId);
        if (caption) form.append("caption", caption);
        if (replyTarget) form.append("replyToId", replyTarget.messageId);

        try {
            const message = await api(`/chat/api/conversations/${encodeURIComponent(conv.id)}/attachments`, {
                method: "POST",
                body: form
            });

            settleLocal(thread, clientId, message);
            updateLastMessage(conv, message);
        } catch (error) {
            const local = thread.items.find((item) => item.clientId === clientId);
            if (local) Object.assign(local, { pending: false, failed: true });
            toast(error.message || "Could not send the file.");
        } finally {
            if (previewUrl) setTimeout(() => URL.revokeObjectURL(previewUrl), 60000);
            if (state.activeId === conv.id) renderMessages(true);
        }
    };

    const autosize = () => {
        els.messageInput.style.height = "auto";
        els.messageInput.style.height = `${Math.min(els.messageInput.scrollHeight, 120)}px`;
    };

    const newClientId = () =>
        (window.crypto?.randomUUID && crypto.randomUUID()) || `c-${Date.now()}-${Math.random()}`;

    const sendMessage = () => {
        const text = els.messageInput.value.trim();
        const conv = activeConversation();
        const file = state.file;
        const replyTarget = state.reply;

        if ((!text && !file) || !conv) return;

        if (file) {
            sendFileMessage(conv, file, text, replyTarget);
            return;
        }

        const clientId = newClientId();
        const thread = ensureThread(conv.id);
        const local = {
            id: `local-${clientId}`,
            clientId,
            conversationId: conv.id,
            senderId: state.me.id,
            type: "text",
            text,
            replyTo: replyTarget || null,
            createdAt: new Date().toISOString(),
            pending: true
        };

        thread.items.push(local);
        els.messageInput.value = "";
        autosize();
        clearReply();
        renderMessages(true);

        const payload = { conversationId: conv.id, text, clientId, replyToId: replyTarget?.messageId };

        socket.timeout(8000).emit("chat:send", payload, (err, res) => {
            const index = thread.items.findIndex((item) => item.clientId === clientId);

            if (err || !res?.ok) {
                if (index >= 0) Object.assign(thread.items[index], { pending: false, failed: true });
                toast(res?.error || "Message not sent. Check your connection.");
            } else {
                if (index >= 0) thread.items[index] = res.message;
                updateLastMessage(conv, res.message);
            }

            if (state.activeId === conv.id) renderMessages(true);
        });
    };

    let lastTypingSent = 0;
    let typingStopTimer;
    let typingClearTimer;

    const announceTyping = () => {
        if (!state.activeId || !socket?.connected) return;

        const now = Date.now();

        if (now - lastTypingSent > 2000) {
            lastTypingSent = now;
            socket.emit("chat:typing", { conversationId: state.activeId, isTyping: true });
        }

        clearTimeout(typingStopTimer);
        typingStopTimer = setTimeout(() => {
            lastTypingSent = 0;
            socket.emit("chat:typing", { conversationId: state.activeId, isTyping: false });
        }, 2500);
    };

    /* ------------------------------------------------------------ forwarding */

    let forwardSource = null;
    const forwardPicked = new Set();

    const renderForwardList = () => {
        const filter = els.forwardSearch.value.trim().toLowerCase();
        const frag = document.createDocumentFragment();
        const full = forwardPicked.size >= MAX_FORWARD_TARGETS;

        const matches = state.conversations.filter(
            (conv) => !filter || conv.other.fullName.toLowerCase().includes(filter)
        );

        for (const conv of matches) {
            const row = el("li");
            const label = el("label");
            const box = document.createElement("input");

            box.type = "checkbox";
            box.checked = forwardPicked.has(conv.id);
            box.disabled = full && !box.checked;
            box.addEventListener("change", () => {
                if (box.checked) forwardPicked.add(conv.id);
                else forwardPicked.delete(conv.id);

                renderForwardList();
            });

            const body = el("div", "person-body");
            body.append(el("div", "person-name", conv.other.fullName));
            body.append(el("div", "person-sub", conv.other.role));

            label.append(box, avatar(conv.other), body);
            row.append(label);
            frag.append(row);
        }

        if (!matches.length) {
            frag.append(el("li", "empty", state.conversations.length ? "No chats match." : "Start a chat with someone first."));
        }

        els.forwardList.replaceChildren(frag);
        els.forwardCount.textContent = forwardPicked.size
            ? `${forwardPicked.size} selected (max ${MAX_FORWARD_TARGETS})`
            : `Pick up to ${MAX_FORWARD_TARGETS} chats`;
        els.forwardConfirm.disabled = forwardPicked.size === 0;
    };

    function openForward(message) {
        forwardSource = message;
        forwardPicked.clear();
        els.forwardSearch.value = "";
        els.forwardPreview.textContent = snippetOf(message) || "Message";
        els.forwardConfirm.textContent = "Forward";
        renderForwardList();
        els.forwardDialog.hidden = false;
        els.forwardSearch.focus();
    }

    const closeForward = () => {
        els.forwardDialog.hidden = true;
        forwardSource = null;
        forwardPicked.clear();
    };

    const confirmForward = () => {
        if (!forwardSource || !forwardPicked.size || !socket?.connected) {
            toast("You are offline. Try again when you are back online.");
            return;
        }

        els.forwardConfirm.disabled = true;
        els.forwardConfirm.textContent = "Forwarding…";

        const payload = { messageId: forwardSource.id, conversationIds: [...forwardPicked] };

        socket.timeout(10000).emit("chat:forward", payload, (err, res) => {
            if (err || !res?.ok) {
                toast(res?.error || "Could not forward the message. Please try again.");
                els.forwardConfirm.disabled = false;
                els.forwardConfirm.textContent = "Forward";
                return;
            }

            res.messages.forEach(onIncomingMessage);
            toast(`Forwarded to ${res.messages.length} chat${res.messages.length === 1 ? "" : "s"}`);
            closeForward();
        });
    };

    /* ------------------------------------------------------- incoming chat */

    const countsAsUnread = (message) =>
        message.type === "text" || message.type === "file" || message.call?.outcome === "missed";

    const onIncomingMessage = (message) => {
        const conv = findConversation(message.conversationId);

        if (!conv) {
            loadConversations().catch(() => {});
            return;
        }

        const thread = ensureThread(conv.id);

        if (thread.loaded && !thread.items.some((item) => item.id === message.id)) {
            /* A file this tab is still sending comes back with its clientId: replace the local bubble. */
            const local = message.clientId
                ? thread.items.findIndex((item) => item.clientId === message.clientId && item.pending)
                : -1;

            if (local >= 0) thread.items[local] = message;
            else thread.items.push(message);
        }

        conv.lastMessage = {
            text: previewOf(message),
            type: message.type,
            senderId: message.senderId,
            at: message.createdAt
        };

        const viewing = state.activeId === conv.id && !document.hidden;

        if (state.activeId === conv.id && message.senderId !== state.me.id) setStatus("");

        if (message.senderId !== state.me.id && countsAsUnread(message)) {
            if (viewing) {
                socket.emit("chat:read", { conversationId: conv.id });
            } else {
                conv.unread += 1;
            }
        }

        sortConversations();
        renderConversations();

        if (state.activeId === conv.id) renderMessages(true);
    };

    /* -------------------------------------------------------------- search */

    let searchTimer;

    const runSearch = async () => {
        const q = els.userSearch.value.trim();

        if (q.length < 2) {
            els.searchResults.hidden = true;
            els.conversationList.hidden = false;
            renderConversations();
            return;
        }

        try {
            const params = new URLSearchParams({ q });
            if (els.roleFilter.value) params.set("role", els.roleFilter.value);

            const users = await api(`/chat/api/users?${params}`);
            const frag = document.createDocumentFragment();

            for (const person of users) {
                const row = el("li");
                const button = el("button", "person");
                button.type = "button";

                const body = el("div", "person-body");
                body.append(el("div", "person-name", person.fullName));

                const sub = el("div", "person-sub");
                sub.append(el("span", "", `@${person.username}`), el("span", "role", person.role));
                body.append(sub);

                button.append(avatar(person), body);
                button.addEventListener("click", () => startWith(person.id));
                row.append(button);
                frag.append(row);
            }

            if (!users.length) frag.append(el("li", "empty", "No one found. Try another name."));

            els.searchResults.replaceChildren(frag);
            els.searchResults.hidden = false;
            els.conversationList.hidden = true;
            els.listEmpty.hidden = true;
        } catch (error) {
            toast(error.message);
        }
    };

    async function startWith(userId) {
        try {
            const conv = await api("/chat/api/conversations", { method: "POST", body: { userId } });

            if (!findConversation(conv.id)) state.conversations.unshift(conv);

            els.userSearch.value = "";
            els.searchResults.hidden = true;
            els.conversationList.hidden = false;

            renderConversations();
            await openConversation(conv.id);
        } catch (error) {
            toast(error.message);
        }
    }

    /* --------------------------------------------------------------- calls */

    const mediaErrorMessage = (error) => {
        switch (error?.name) {
            case "NotAllowedError":
                return "Allow camera and microphone access to make calls.";
            case "NotFoundError":
                return "No camera or microphone was found. Connect one (or check Windows privacy settings) and try again.";
            case "NotReadableError":
                return "Your camera or microphone is being used by another app.";
            default:
                return "Could not start your camera and microphone.";
        }
    };

    const getMedia = async () => {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("Video calls need a secure (https) connection and an up-to-date browser.");
        }

        const video = { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" };

        /* Best case both; if a device is missing, join with whatever exists. */
        const attempts = [{ audio: true, video }, { audio: true }, { video }];
        let lastError;

        for (const constraints of attempts) {
            try {
                return await navigator.mediaDevices.getUserMedia(constraints);
            } catch (error) {
                lastError = error;

                /* Permission denied or device busy: trying again would not help. */
                if (error?.name !== "NotFoundError" && error?.name !== "OverconstrainedError") break;
            }
        }

        throw new Error(mediaErrorMessage(lastError));
    };

    const noteMissingDevices = (stream) => {
        if (!stream.getVideoTracks().length) toast("No camera found. You will join with audio only.");
        else if (!stream.getAudioTracks().length) toast("No microphone found. They will see you but not hear you.");
    };

    const getIceServers = async () => {
        if (state.ice && Date.now() - state.ice.at < 10 * 60 * 1000) return state.ice.servers;

        const data = await api("/chat/api/ice-servers");
        state.ice = { servers: data.iceServers, at: Date.now() };

        return state.ice.servers;
    };

    const sendSignal = (data) => {
        if (call?.id) socket.emit("call:signal", { callId: call.id, data });
    };

    const showOverlay = (person, status) => {
        els.callPeer.textContent = person.fullName;
        els.callStatus.textContent = status;
        const hasVideo = call.local.getVideoTracks().length > 0;
        const hasAudio = call.local.getAudioTracks().length > 0;

        els.localVideo.srcObject = call.local;
        els.localVideo.hidden = !hasVideo;
        els.micBtn.disabled = !hasAudio;
        els.camBtn.disabled = !hasVideo;
        els.flipBtn.hidden = true;
        els.flipBtn.disabled = false;
        showFacing(call.local.getVideoTracks()[0]);
        refreshFlipButton();
        els.micBtn.setAttribute("aria-pressed", "false");
        els.camBtn.setAttribute("aria-pressed", "false");
        els.overlay.hidden = false;
    };

    const cleanupCall = () => {
        if (!call) return;

        clearInterval(call.clock);
        call.pc?.close();
        call.local?.getTracks().forEach((track) => track.stop());

        els.remoteVideo.srcObject = null;
        els.localVideo.srcObject = null;
        els.localVideo.classList.remove("rear");
        els.flipBtn.hidden = true;
        els.overlay.hidden = true;
        call = null;
    };

    const hideIncoming = () => {
        incoming = null;
        els.incoming.hidden = true;
    };

    const markConnected = () => {
        if (!call || call.clock) return;

        const startedAt = Date.now();
        const tick = () => (els.callStatus.textContent = `Connected · ${durationLabel((Date.now() - startedAt) / 1000)}`);

        tick();
        call.clock = setInterval(tick, 1000);
    };

    const createPeer = async () => {
        const pc = new RTCPeerConnection({ iceServers: await getIceServers() });
        call.pc = pc;
        call.pendingCandidates = [];

        call.local.getTracks().forEach((track) => pc.addTrack(track, call.local));

        if (call.role === "caller") {
            for (const kind of ["audio", "video"]) {
                if (!call.local.getTracks().some((track) => track.kind === kind)) {
                    pc.addTransceiver(kind, { direction: "recvonly" });
                }
            }
        }

        pc.ontrack = (event) => {
            els.remoteVideo.srcObject = event.streams[0];
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) sendSignal({ type: "candidate", candidate: event.candidate.toJSON() });
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "connected") markConnected();

            if (pc.connectionState === "failed") {
                toast("The call lost its connection. Check your network and try again.");
                endCall();
            }
        };

        return pc;
    };

    const flushCandidates = async (pc) => {
        const queued = call.pendingCandidates.splice(0);

        for (const candidate of queued) await pc.addIceCandidate(candidate).catch(() => {});
    };

    async function startCall() {
        const conv = activeConversation();

        if (call || incoming || !conv || !socket?.connected) return;

        let local;

        try {
            local = await getMedia();
        } catch (error) {
            toast(error.message);
            return;
        }

        noteMissingDevices(local);
        call = { id: null, role: "caller", peer: conv.other, local, pc: null, pcPromise: null, pendingCandidates: [] };
        showOverlay(conv.other, `Calling ${conv.other.fullName}…`);

        socket.timeout(10000).emit("call:invite", { conversationId: conv.id }, (err, res) => {
            if (err || !res?.ok) {
                toast(res?.error || "Could not start the call. Please try again.");
                cleanupCall();
                return;
            }

            if (call) call.id = res.callId;
            else socket.emit("call:end", { callId: res.callId }); // hung up before the server answered
        });
    }

    async function acceptIncoming() {
        const ring = incoming;
        if (!ring) return;

        let local;

        try {
            local = await getMedia();
        } catch (error) {
            toast(error.message);
            socket.emit("call:end", { callId: ring.callId });
            hideIncoming();
            return;
        }

        hideIncoming();
        noteMissingDevices(local);

        call = { id: ring.callId, role: "callee", peer: ring.from, local, pc: null, pcPromise: null, pendingCandidates: [] };
        showOverlay(ring.from, "Connecting…");

        socket.timeout(8000).emit("call:accept", { callId: ring.callId }, async (err, res) => {
            if (err || !res?.ok) {
                toast(res?.error || "That call is no longer available.");
                cleanupCall();
                return;
            }

            try {
                call.pcPromise = createPeer();
                await call.pcPromise;
                sendSignal({ type: "ready" });
            } catch (error) {
                console.error(error);
                toast("Could not connect the call.");
                endCall();
            }
        });
    }

    function declineIncoming() {
        if (!incoming) return;

        socket.emit("call:end", { callId: incoming.callId });
        hideIncoming();
    }

    function endCall() {
        if (!call) return;

        if (call.id) socket.emit("call:end", { callId: call.id });
        cleanupCall();
    }

    /* ---------------------------------------------------- front / back camera */

    const listCameras = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.filter((device) => device.kind === "videoinput");
        } catch {
            return [];
        }
    };

    /* Selfie view is mirrored; the back camera is not. */
    const showFacing = (track) => {
        els.localVideo.classList.toggle("rear", track?.getSettings().facingMode === "environment");
    };

    const refreshFlipButton = async () => {
        const hasVideo = Boolean(call?.local?.getVideoTracks().length);
        const cameras = hasVideo ? await listCameras() : [];

        if (!call) return;

        /* Phones may report one device until a camera is open; show the button whenever a switch is plausible. */
        const canSwitch = hasVideo && (cameras.length > 1 || Boolean(call.local.getVideoTracks()[0].getSettings().facingMode));

        els.flipBtn.hidden = !canSwitch;
    };

    /* What to ask for next: the other side on a phone, the next camera on a laptop. */
    const nextCameraOptions = (track, cameras) => {
        const { facingMode, deviceId } = track.getSettings();

        if (facingMode === "user" || facingMode === "environment") {
            const next = facingMode === "user" ? "environment" : "user";
            return [{ facingMode: { exact: next } }, { facingMode: { ideal: next } }];
        }

        if (cameras.length < 2) return [];

        const index = cameras.findIndex((camera) => camera.deviceId === deviceId);
        const target = cameras[(index + 1) % cameras.length];

        return target ? [{ deviceId: { exact: target.deviceId } }] : [];
    };

    const openCamera = (options) =>
        navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, ...options }
        });

    async function switchCamera() {
        if (!call || call.switching) return;

        const oldTrack = call.local.getVideoTracks()[0];

        if (!oldTrack) return;

        call.switching = true;
        els.flipBtn.disabled = true;

        const wasEnabled = oldTrack.enabled;
        const before = oldTrack.getSettings();
        const attempts = nextCameraOptions(oldTrack, await listCameras());

        /* Many phones cannot open two cameras at once, so release the current one first. */
        oldTrack.stop();

        let stream = null;

        for (const options of attempts) {
            try {
                stream = await openCamera(options);
                break;
            } catch {
                /* try the next option */
            }
        }

        if (!stream) {
            /* Could not switch: get the old camera back so the call keeps working. */
            try {
                stream = await openCamera(
                    before.deviceId ? { deviceId: { exact: before.deviceId } } : { facingMode: before.facingMode || "user" }
                );
            } catch {
                /* nothing more to try */
            }

            toast(stream ? "Could not switch the camera." : "The camera stopped working. Turn it off and on again.");
        }

        if (stream && call) {
            const newTrack = stream.getVideoTracks()[0];
            newTrack.enabled = wasEnabled;

            const sender = call.pc?.getSenders().find((item) => item.track?.kind === "video");

            try {
                if (sender) await sender.replaceTrack(newTrack);
            } catch (error) {
                console.error("[call] could not switch the camera", error);
                newTrack.stop();
                toast("Could not switch the camera.");
                call.switching = false;
                els.flipBtn.disabled = false;
                return;
            }

            call.local.removeTrack(oldTrack);
            call.local.addTrack(newTrack);
            els.localVideo.srcObject = call.local;
            showFacing(newTrack);
        }

        if (call) {
            call.switching = false;
            els.flipBtn.disabled = false;
        }
    }

    const toggleTrack = (kind, button, onLabel, offLabel) => {
        if (!call) return;

        const tracks = kind === "audio" ? call.local.getAudioTracks() : call.local.getVideoTracks();
        const enable = !tracks.every((track) => track.enabled);

        tracks.forEach((track) => (track.enabled = enable));
        button.setAttribute("aria-pressed", String(!enable));
        button.setAttribute("aria-label", enable ? onLabel : offLabel);
    };

    const onSignal = async ({ callId, data }) => {
        if (!call || call.id !== callId || !data) return;

        try {
            const pc = await call.pcPromise;

            if (!pc) return;

            if (data.type === "ready" && call.role === "caller") {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                sendSignal({ type: "offer", sdp: pc.localDescription.sdp });
            } else if (data.type === "offer" && call.role === "callee") {
                await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
                await flushCandidates(pc);

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendSignal({ type: "answer", sdp: pc.localDescription.sdp });
            } else if (data.type === "answer" && call.role === "caller") {
                await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
                await flushCandidates(pc);
            } else if (data.type === "candidate" && data.candidate) {
                if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
                else call.pendingCandidates.push(data.candidate);
            }
        } catch (error) {
            console.error("[call] signalling failed", error);
            toast("The call could not be set up.");
            endCall();
        }
    };

    const endedMessage = (outcome, role) => {
        if (outcome === "declined") return role === "caller" ? "Call declined." : "";
        if (outcome === "missed") return role === "caller" ? "No answer." : "Call cancelled.";
        return "Call ended.";
    };

    /* -------------------------------------------------------------- socket */

    const connectSocket = () => {
        socket = io({ transports: ["websocket", "polling"] });

        socket.on("connect", () => {
            authRetries = 0;
            els.connBanner.hidden = true;

            if (hasConnectedBefore) {
                loadConversations().catch(() => {});

                const thread = threads.get(state.activeId);
                if (thread) {
                    fetchMessages(state.activeId)
                        .then((data) => {
                            thread.items = data.messages;
                            thread.hasMore = data.hasMore;
                            renderMessages(true);
                        })
                        .catch(() => {});
                }
            }

            hasConnectedBefore = true;
        });

        socket.on("disconnect", () => {
            els.connBanner.hidden = false;
        });

        socket.on("connect_error", async (error) => {
            els.connBanner.hidden = false;

            /* Access token expired: any authenticated request rotates the cookies, then retry. */
            if (error.message === "unauthorized" && authRetries++ < 2) {
                try {
                    await api("/chat/api/me");
                    socket.connect();
                } catch {
                    /* api() already redirects to /login on 401 */
                }
            }
        });

        socket.on("chat:message", onIncomingMessage);

        socket.on("chat:typing", ({ conversationId, isTyping }) => {
            if (conversationId !== state.activeId) return;

            setStatus(isTyping ? "typing…" : "");
            clearTimeout(typingClearTimer);
            if (isTyping) typingClearTimer = setTimeout(() => setStatus(""), 4000);
        });

        socket.on("call:incoming", (ring) => {
            if (call || incoming) return;

            incoming = ring;
            els.incomingName.textContent = ring.from.fullName;
            fillAvatar(els.incomingAvatar, ring.from);
            els.incoming.hidden = false;
            els.incomingAccept.focus();
        });

        socket.on("call:accepted", ({ callId }) => {
            if (!call || call.id !== callId) return;

            els.callStatus.textContent = "Connecting…";
            call.pcPromise = createPeer();
            call.pcPromise.catch(() => {
                toast("Could not connect the call.");
                endCall();
            });
        });

        socket.on("call:signal", onSignal);

        socket.on("call:taken", ({ callId }) => {
            if (incoming?.callId === callId) hideIncoming();
        });

        socket.on("call:ended", ({ callId, outcome }) => {
            if (incoming?.callId === callId) hideIncoming();

            if (call && call.id === callId) {
                const message = endedMessage(outcome, call.role);
                cleanupCall();
                if (message) toast(message);
            }
        });
    };

    /* ---------------------------------------------------------------- wiring */

    els.composer.addEventListener("submit", (event) => {
        event.preventDefault();
        sendMessage();
    });

    els.messageInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            sendMessage();
        }
    });

    els.messageInput.addEventListener("input", () => {
        autosize();
        announceTyping();
    });

    els.userSearch.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(runSearch, 300);
    });

    els.roleFilter.addEventListener("change", runSearch);
    els.backBtn.addEventListener("click", closeThreadOnMobile);
    els.callBtn.addEventListener("click", startCall);
    els.incomingAccept.addEventListener("click", acceptIncoming);
    els.incomingDecline.addEventListener("click", declineIncoming);
    els.hangupBtn.addEventListener("click", endCall);
    els.micBtn.addEventListener("click", () =>
        toggleTrack("audio", els.micBtn, "Mute microphone", "Unmute microphone")
    );
    els.camBtn.addEventListener("click", () =>
        toggleTrack("video", els.camBtn, "Turn camera off", "Turn camera on")
    );

    els.flipBtn.addEventListener("click", switchCamera);

    els.attachBtn.addEventListener("click", () => els.fileInput.click());
    els.fileInput.addEventListener("change", () => chooseFile(els.fileInput.files[0]));
    els.attachCancel.addEventListener("click", clearAttachment);
    els.replyCancel.addEventListener("click", clearReply);

    /* Paste a screenshot straight into the message box. */
    els.messageInput.addEventListener("paste", (event) => {
        const file = [...(event.clipboardData?.files || [])].find((item) => item.type.startsWith("image/"));

        if (file) {
            event.preventDefault();
            chooseFile(file);
        }
    });

    els.menuReply.addEventListener("click", () => {
        const message = menuMessage;
        closeMenu();
        if (message) startReply(message);
    });
    els.menuForward.addEventListener("click", () => {
        const message = menuMessage;
        closeMenu();
        if (message) openForward(message);
    });
    els.menuCopy.addEventListener("click", () => {
        const message = menuMessage;
        closeMenu();
        if (message) copyMessage(message);
    });

    document.addEventListener("click", (event) => {
        if (!els.msgMenu.hidden && !els.msgMenu.contains(event.target)) closeMenu();
    });

    els.messages.addEventListener("scroll", closeMenu, { passive: true });

    els.forwardClose.addEventListener("click", closeForward);
    els.forwardConfirm.addEventListener("click", confirmForward);
    els.forwardSearch.addEventListener("input", renderForwardList);
    els.forwardDialog.addEventListener("click", (event) => {
        if (event.target === els.forwardDialog) closeForward();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;

        if (!els.forwardDialog.hidden) closeForward();
        else if (!els.msgMenu.hidden) closeMenu();
        else if (state.reply) clearReply();
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && state.activeId) markRead(state.activeId);
    });

    (async () => {
        try {
            state.me = await api("/chat/api/me");
            connectSocket();
            await loadConversations();

            const withId = new URLSearchParams(location.search).get("with");

            if (withId) {
                history.replaceState(null, "", "/chat");
                await startWith(withId);
            }
        } catch (error) {
            toast(error.message);
        }
    })();
})();