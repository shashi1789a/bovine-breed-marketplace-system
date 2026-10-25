# BoviNetra: Live Chat + Video Call (setup guide)

Sabhi roles (user, farmer, doctor, buyer, admin) ek dusre ko 1-to-1 chat aur video call kar sakte hain.

## Ye kaise kaam karta hai

- **Chat**: Socket.IO (WebSocket). Message MongoDB me save hota hai, receiver ko turant milta hai. Typing indicator, unread count, "load earlier messages" bhi hai.
- **Video call**: WebRTC. Video/audio seedha dono browsers ke beech jata hai. Aapka server sirf "signalling" karta hai (kaun call kar raha hai, kaun utha raha hai, connection ka SDP/ICE data).
- **Login**: naya login nahi banaya. Socket aapki existing `accessToken` cookie se verify hota hai, aur wahi rules lagte hain (active account, password change check).
- **Call history** chat me dikhti hai: "Video call · 2:13", "Missed video call", "Call declined".

## Files

**Naye (copy karo):**

| File | Kaam |
|---|---|
| `src/models/conversation.model.js`, `message.model.js` | Database models |
| `src/services/chat.service.js` | Saare DB rules (search, conversation, messages, call log) |
| `src/sockets/index.js` | Socket server: chat + call events |
| `src/sockets/call.manager.js` | Call state machine (ringing / active / ended) |
| `src/sockets/socket.auth.js`, `socket.helpers.js` | Login check, origin check, rate limit, ICE servers |
| `src/controllers/chat.controller.js`, `src/routes/chat.routes.js` | REST API + `/chat` page |
| `src/views/chat/index.ejs` | Chat page |
| `public/assets/js/chat-client.js` | Browser code (chat + WebRTC) |
| `tests/chat/*`, `tests/e2e/*` | Tests |

**Badle huye (2 files, overwrite karo):**

- `src/index.js`: ab `http.createServer(app)` use hota hai taaki Socket.IO attach ho sake. Cron job aur graceful shutdown waise hi hain.
- `src/routes/app.routes.js`: sirf 2 line badhi: `import chatRoutes ...` aur `router.use("/chat", chatRoutes);`

> Agar in 2 files me aapne zip dene ke baad koi change kiya ho, to overwrite mat karo; bas upar wali 2 line / `index.js` ka server wala hissa manually add karo.

## Step by step

### 1. Packages install karo (PowerShell, project folder me)

```powershell
npm install socket.io
npm install -D socket.io-client supertest mongodb-memory-server
```

(`jest` aapke project me pehle se hona chahiye; agar nahi hai to `npm install -D jest`.)

### 2. Files copy karo

Zip ko project ke root me extract karo, taaki `src/`, `public/`, `tests/` apni jagah par merge ho jayein.

### 3. `.env` me add karo (sirf production ke liye zaroori)

```env
# Local testing me kuch add karna zaroori nahi. Ye sab optional hain.
# Agar frontend aur backend alag domain par hain to CORS_ORIGIN pehle se hona chahiye
# (comma se alag karke kai origins de sakte ho).

STUN_URLS=stun:stun.l.google.com:19302
TURN_URLS=turn:turn.yourdomain.com:3478,turns:turn.yourdomain.com:5349
TURN_SECRET=ek-lamba-random-secret
TURN_TTL_SECONDS=3600
```

TURN ke bina kuch calls fail honge (neeche "Production" dekho).

### 4. Chalao aur khud try karo

Apna server hamesha ki tarah chalao (jaise `npm run dev` ya `npm start`). Phir do alag users se login karo: ek normal Chrome window me, doosra **Incognito** me (same browser me dono tabs me ek hi login rahega). Dono me `http://localhost:8000/chat` kholo.

1. Ek user me upar search box me dusre ka naam likho, click karo, message bhejo.
2. Dusre window me message turant dikhna chahiye.
3. Video button dabao. Dusre window me incoming call card aayega, Accept karo. Browser camera/mic permission maangega.

`localhost` par HTTPS ki zaroorat nahi. Phone se test karne ke liye HTTPS chahiye (ngrok ya cloudflared tunnel use karo).

### 5. App me "Chat" ke links lagao

Dashboards ke navbar me:

```html
<a href="/chat">Messages</a>
```

Kisi product / seller / doctor profile par seedha chat shuru karne ke liye:

```html
<a href="/chat?with=<%= seller._id %>">Message seller</a>
```

(`seller._id` ki jagah us user ki id jisse baat karni hai.)

## Tests

### Setup

`jest.config.js` aisa hona chahiye (ESM project ke liye):

```js
export default {
    testEnvironment: "node",
    transform: {},
    testMatch: ["**/tests/**/*.test.js"],
    testTimeout: 30000
};
```

`package.json` ke `scripts` me add karo (Windows par bhi chalega):

```json
"test:chat": "node --experimental-vm-modules node_modules/jest/bin/jest.js tests/chat",
"test:e2e:call": "node tests/e2e/video-call.e2e.mjs"
```

### Kaunsa test kya check karta hai

| Type | File | Kya check hota hai |
|---|---|---|
| Unit | `call.manager.test.js` | Ring, accept, decline, timeout, busy, duration, disconnect, kaun signal bhej sakta hai |
| Unit | `socket.helpers.test.js` | Cookie parsing, cross-site origin block, rate limit, TURN credentials |
| Integration (REST) | `chat.api.test.js` | Login zaroori, search, conversation banna, pagination, privacy, ICE servers, `/chat` page render |
| Integration (Socket) | `chat.socket.test.js` | Real-time delivery, multi-tab, typing, read receipts, poora call flow, busy, offline, missed call |
| Role matrix | `chat.socket.test.js` | Sabhi 25 role combinations (user/farmer/doctor/buyer/admin -> kisi bhi) |
| Security | `chat.api.test.js`, `chat.socket.test.js` | Fake token, deactivated user, doosre site se socket, outsider ka message/call, NoSQL injection, regex injection, flood, oversized message, fake signal, XSS text |
| End-to-end | `video-call.e2e.mjs` | Do asli browsers, asli WebRTC connection, fake camera: chat, ring, accept, dono taraf video, mute, hang up |

Chalane ke commands:

```powershell
npm run test:chat

# E2E ke liye ek baar:
npm install -D playwright
npx playwright install chromium
npm run test:e2e:call
# Browser dekhna ho to: $env:HEADED=1; npm run test:e2e:call
```

`mongodb-memory-server` pehli baar run par MongoDB ka binary download karta hai (internet chahiye, ek baar).

### Manual checklist (release se pehle)

- [ ] Do alag devices (laptop + phone) par call: video aur awaaz dono taraf aa rahi hai
- [ ] Phone par mobile data (WiFi nahi) se call: TURN ke bina fail ho sakti hai, TURN ke saath chalni chahiye
- [ ] Camera permission "Block" karke call: saaf message dikhta hai, app hang nahi hoti
- [ ] Call ke beech me tab band karo: doosri taraf call turant khatam
- [ ] Call ke beech me internet band/chalu karo: banner "Reconnecting…" aur phir wapas
- [ ] Callee ke do tabs: dono me ring, ek me uthao to doosre ka card hat jata hai
- [ ] Login expire hone ke baad chat page: login par bhejta hai, crash nahi
- [ ] 1000 characters ka message, emoji, Hindi text: sahi dikhta hai
- [ ] Mobile screen par: list -> chat -> back kaam karta hai, keyboard se input chhipta nahi
- [ ] Screen reader / keyboard se: buttons ke naam aate hain, Tab se sab pahunch me hai

### Load test (optional)

Zyada users ka load dekhna ho to `artillery` ka `socketio` engine use karo. Ek server par kuch hazaar jude hue sockets normal hain; asli bottleneck TURN bandwidth hoti hai, chat nahi.

## Production

1. **HTTPS zaroori hai.** Browser bina HTTPS ke (localhost ko chhodkar) camera/mic nahi deta.
2. **Reverse proxy me WebSocket allow karo.** Nginx example:

```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;
}
```

3. **TURN server lagao.** India ke mobile networks (Jio/Airtel) me aksar strict NAT hota hai, jahan direct connection nahi ban pata, aur TURN relay chahiye. Options: apna `coturn` (neeche config), ya Metered / Twilio / Cloudflare jaise paid service (unke credentials `TURN_USERNAME` / `TURN_CREDENTIAL` me bhi chalte hain).

```
# /etc/turnserver.conf
listening-port=3478
fingerprint
use-auth-secret
static-auth-secret=<wahi jo .env ke TURN_SECRET me hai>
realm=turn.yourdomain.com
no-multicast-peers
```

   Firewall me 3478 (UDP+TCP) aur relay range 49152-65535 (UDP) kholo.

4. **Sirf ek server instance.** Abhi online users aur chal rahi calls memory me rehte hain. Ek se zyada instances chalane ho to `@socket.io/redis-adapter` aur call state Redis me le jana padega. Vercel/serverless par WebSocket nahi chalta; aapka app cron bhi chalata hai, isliye wo pehle se long-running server par hi hona chahiye.
5. **Admin kisi user ko disable kare** to uska already-khula socket tab tak chalta rahta hai jab tak wo disconnect na ho. Naye message uske liye ruk jate hain (service har message par active check karti hai), par chaho to `admin.controller.js` me status badalte waqt us user ka socket bhi kaat sakte ho.

## Abhi ke limits (jaan-bujhkar rakhe)

- Sirf **1-to-1** calls. Group video ke liye SFU (LiveKit / mediasoup) chahiye, WebRTC mesh 4+ logon par kaam nahi karta.
- **Koi bhi user kisi ko message kar sakta hai.** Spam rokne ke liye rate limit hai, par "block user" / "report" abhi nahi hai. Agar platform par strangers ka aana-jaana zyada hai to ye agla feature banana chahiye.
- Sirf text. Image/file bhejna nahi hai (multer + Cloudinary pehle se hain, to aasani se add ho sakta hai).
- Browser band hone par push notification nahi aati (Web Push alag feature hai).
- Screen share, call recording, aur ICE restart (network badalne par call bachana) nahi hain.
