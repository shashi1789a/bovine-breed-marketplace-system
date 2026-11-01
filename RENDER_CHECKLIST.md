# Render checklist (chat / video / files)

1. Open https://<your-app>.onrender.com/healthz  -> JSON must show
   chatFeatures: ["reply","forward","attachments","camera-switch"].
   If chatFeatures is missing, Render is still running an OLD deploy
   (commit all files, push, then Render > Manual Deploy > "Clear build cache & deploy").
2. In the same JSON: cloudinary must be true, corsOriginSet true, turnConfigured true (needed for video on mobile data), production true.
3. Render > Environment: CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET, CORS_ORIGIN (https://<your-app>.onrender.com), ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET, NODE_ENV=production, TURN_URLS (+ TURN_USERNAME/TURN_PASSWORD or TURN_SECRET).
4. Cloudinary > Settings > Security > tick "Allow delivery of PDF and ZIP files" (else PDFs show but won't open).
5. Run once locally:  npm install compression   (commit package.json AND package-lock.json) -> gzip makes pages much faster.
6. Free Render plans sleep after ~15 min: the first request takes 30-60 s. Use a paid instance or an uptime pinger on /healthz.
7. Phone: camera needs HTTPS (Render gives it). Hard-refresh once after deploy.

## Reels (video)
- Needs the same CLOUDINARY_* variables. Videos are stored in Cloudinary under bovinetra/reels.
- Free Cloudinary accounts accept videos up to 100 MB; the app allows 80 MB and 60 seconds.
- Uploading a big video through Render can take a while on mobile data; the upload page shows a progress bar.
- New links: /reels (watch), /reels/new (farmers upload), /farmers/<username> (public farmer page).

## Reels engagement, notifications, push
- Like, comments, views, Follow and the Following tab need no extra setup.
- Compression: new reels are delivered as q_auto, 720px wide. Default is an async derived video in Cloudinary. Set REEL_COMPRESS=stored to compress at upload instead (slower upload, smaller storage).
- Email alerts: set SMTP variables (the same ones used for login mails) and APP_URL=https://<your-app>.onrender.com so links in mails work.
- Web push: run `npx web-push generate-vapid-keys`, then in Render add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT=mailto:you@example.com. Redeploy. Users turn it on at /account/preferences ("Turn on for this device"). Push needs HTTPS; on iPhone the site must be added to the Home Screen first.
- Call/WhatsApp on reels: a farmer adds a mobile number and turns the option on at /account/preferences. Only logged in buyers see the buttons.
- Online / last seen and read ticks work in chat automatically. Users can hide their status in /account/preferences.
- Run `npm install` after copying files (adds web-push and compression); commit package-lock.json.

## Farmer tools and doctor appointments
- Dairy record: /farmer/dairy (milk per day, expenses, income, monthly chart). Reminders: /farmer/reminders. No setup needed.
- Reminders are sent every day at 8:00 AM India time by the server job (in-app, email, push). On a free Render plan the server sleeps, so the 8 AM job only runs if the app is awake. Use a paid instance or an uptime pinger on /healthz.
- Breed autofill: uses the same ML_SERVICE_URL / ML_API_KEY as /breed/detect. If the ML service is asleep the form just says to type the breed.
- Doctors: open /doctor/availability, turn on "Accept new bookings", set hours and fee. Farmers book at /doctors. Video uses the existing chat call (Join video call opens /chat and starts the call; TURN must be configured for mobile data).
- Appointment reminder (15 minutes before) also runs from the server job, so keep the instance awake.

## Language, search, map
- Hindi / English: the "हि / EN" button in the header switches language (cookie "lang"; first visit follows the browser language). Translations live in src/i18n/hi.js. To translate more text, wrap it as <%= t("English text") %> in the .ejs file and add "English text": "हिन्दी" to hi.js. The test tests/unit/i18n.test.js fails if a key is missing.
- Marketplace (cattle tab): filters for state, district, price, milk per day and "Near me" (with distance). "View on map" opens /cattle/map.
- Farmers must add State, District and (button "Use my current location") coordinates when listing cattle, otherwise the animal does not show on the map or in Near me. Old listings need an edit once.
- The map uses OpenStreetMap tiles (free, for light traffic). If traffic grows, switch to a paid tile provider.

## Admin analytics
- /admin/analytics (admins only): users, listings, orders and revenue per day for 7, 30 or 90 days, plus breakdowns.

## Error monitoring (Sentry)
1. Create a free account at sentry.io, make a Node.js project, copy the DSN.
2. Render > Environment: SENTRY_DSN=<your dsn>. Optional: SENTRY_TRACES_RATE=0 (default), SENTRY_ENVIRONMENT=production.
3. Run `npm install` (adds @sentry/node) and push. /healthz shows "monitoring": true when it is on.
Only server errors (500) and crashes are reported; no personal data is attached.

## GitHub Actions (tests, backup, keep-alive)
Files are in .github/workflows. Push them to GitHub and open the Actions tab.
- ci.yml: runs on every push and pull request: syntax check + all tests. It uses `npm install`; after you run `npm install` locally and commit package-lock.json you can change it to `npm ci`.
- backup.yml: every night (about 3 AM India time) dumps the database. Add the secret MONGODB_URI (Settings > Secrets and variables > Actions > Secrets). The backup is saved as a workflow artifact for 14 days.
  IMPORTANT: artifacts of a PUBLIC repository can be downloaded by anyone who can see the repo. Use this only if the repository is private. Otherwise use MongoDB Atlas backups (paid clusters) or run `mongodump` yourself and keep the file private.
  To restore: `mongorestore --uri "<new uri>" --gzip --archive=bovinetra-YYYYMMDD.gz`.
- keepalive.yml: pings /healthz every 10 minutes so the free Render instance does not sleep. Add the repository VARIABLE APP_URL (Settings > Secrets and variables > Actions > Variables) = https://<your-app>.onrender.com. GitHub may delay scheduled runs and pauses them after 60 days without repository activity, so also set a free monitor at uptimerobot.com (HTTP monitor on /healthz, every 5 minutes). A paid Render instance never sleeps and is the reliable option.

## Seller role (replaces buyer)
- The role "buyer" is now "seller". When the server starts it changes every existing "buyer" account to "seller" automatically (one quick update, safe to repeat). Log line: "Changed N buyer account(s) to seller".
- Sellers sell every animal and pet product category (feed, fodder, medicine, vaccines, supplements, equipment, pet food, pet accessories, grooming, bedding and more). Their pages: /seller/dashboard, /seller/products, /seller/orders. They cannot list cattle.
- Farmers can list cattle plus these product categories only: Feed, Fodder & Straw (bhusa, pual, hay), Dung Cake (Goitha), Manure & Compost, Trough (Naad). To allow more, edit FARMER_CATEGORIES in src/models/product.model.js.
- Doctors and admins can still use every category. Existing farmer products in other categories stay visible and editable but the category cannot be changed to a new restricted one.
- Plain "user" accounts remain customers.
