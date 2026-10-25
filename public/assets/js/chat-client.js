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
        hangupBtn: $("hangupBtn")
    };

    const state = { me: null, conversations: [], activeId: null, ice: null };
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
                ...(body ? { "Content-Type": "application/json" } : {})
            },
            body: body ? JSON.stringify(body) : undefined
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
        return message.text;
    };

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

        const bubble = el("div", `msg${mine ? " mine" : ""}${message.pending ? " pending" : ""}${message.failed ? " failed" : ""}`);
        bubble.append(el("p", "", message.text));
        bubble.append(el("time", "", message.failed ? "Not sent" : timeLabel(message.createdAt)));
        return bubble;
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

        for (const message of thread.items) frag.append(renderMessage(message));

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

    /* ----------------------------------------------------------- sending */

    const autosize = () => {
        els.messageInput.style.height = "auto";
        els.messageInput.style.height = `${Math.min(els.messageInput.scrollHeight, 120)}px`;
    };

    const newClientId = () =>
        (window.crypto?.randomUUID && crypto.randomUUID()) || `c-${Date.now()}-${Math.random()}`;

    const sendMessage = () => {
        const text = els.messageInput.value.trim();
        const conv = activeConversation();

        if (!text || !conv) return;

        const clientId = newClientId();
        const thread = ensureThread(conv.id);
        const local = {
            id: `local-${clientId}`,
            clientId,
            conversationId: conv.id,
            senderId: state.me.id,
            type: "text",
            text,
            createdAt: new Date().toISOString(),
            pending: true
        };

        thread.items.push(local);
        els.messageInput.value = "";
        autosize();
        renderMessages(true);

        socket.timeout(8000).emit("chat:send", { conversationId: conv.id, text, clientId }, (err, res) => {
            const index = thread.items.findIndex((item) => item.clientId === clientId);

            if (err || !res?.ok) {
                if (index >= 0) Object.assign(thread.items[index], { pending: false, failed: true });
                toast(res?.error || "Message not sent. Check your connection.");
            } else {
                if (index >= 0) thread.items[index] = res.message;
                conv.lastMessage = {
                    text: previewOf(res.message),
                    type: "text",
                    senderId: state.me.id,
                    at: res.message.createdAt
                };
                sortConversations();
                renderConversations();
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

    /* ------------------------------------------------------- incoming chat */

    const countsAsUnread = (message) =>
        message.type === "text" || message.call?.outcome === "missed";

    const onIncomingMessage = (message) => {
        const conv = findConversation(message.conversationId);

        if (!conv) {
            loadConversations().catch(() => {});
            return;
        }

        const thread = ensureThread(conv.id);

        if (thread.loaded && !thread.items.some((item) => item.id === message.id)) {
            thread.items.push(message);
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