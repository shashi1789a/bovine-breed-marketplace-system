# BoviNetra

BoviNetra is a marketplace and farm toolkit for people who work with cattle and buffalo. A farmer can list an animal, show it off in a short video, record daily milk, and talk to buyers. A buyer can browse animals and products, make an offer, and pay. A vet can open slots for video consultations. One Node.js server runs the website, and the same server also powers a React Native mobile app.

I started it because buying and selling cattle in India still happens mostly over phone calls and word of mouth. Prices are unclear, photos are poor, and it is hard to know whether a seller can be trusted. BoviNetra tries to put the useful parts in one place: good listings, a way to check the seller, and tools a farmer would use every day anyway.

## What you can do with it

**Buy and sell cattle**
- Post a listing with up to six photos, breed, age, weight, milk yield, price, location and health details.
- Search and filter by breed, state, district, price and more, or look at animals on a map.
- Send an offer on an animal. The seller can accept, reject or you can withdraw it.
- Save animals to a wishlist and follow farmers you like.

**Marketplace for products**
- Sellers list feed, medicine and equipment. Buyers add to cart, buy now, or save for later.
- Checkout supports cash on delivery and online payment through Razorpay. A cart with items from several sellers is split into one order per seller.
- Sellers see their own orders and can mark them shipped, delivered or cancelled.

**Trust**
- Farmers can send a phone number and a farm photo to get a verified badge. An admin reviews each request.
- Buyers can leave ratings and reviews on a farmer's profile.

**Farm tools**
- Dairy records for daily milk and money in and out.
- Reminders for vaccination, breeding and routine jobs.
- A dashboard for each role: farmer, doctor, seller, buyer and admin.

**Vets**
- Doctors set their working days, hours and slot length.
- Anyone can book a video consultation. The doctor confirms, declines or completes it.

**Social**
- Short reels, so a farmer can show an animal moving and eating before a buyer visits.
- One-to-one chat with live messages, read receipts, image and file sharing, and in-browser calls.
- Notifications for orders, offers and messages.

**AI breed detection**
- Upload a photo and get the likely breed back from a small Python service. Past results are kept in a history list.

**Admin**
- Approve, feature or remove listings, change user roles, block accounts, review verification requests, and see sales and growth charts.

## Tech stack

| Part | What is used |
|---|---|
| Server | Node.js, Express 5 |
| Database | MongoDB with Mongoose 9 |
| Website | EJS templates, Bootstrap, plain CSS and JavaScript |
| Realtime | Socket.IO |
| Auth | JWT in cookies for the website, Bearer tokens for the app, Google sign-in |
| Files | Multer for uploads, Cloudinary for storage |
| Payments | Razorpay |
| Email | Nodemailer over SMTP |
| Web push | VAPID keys |
| Error tracking | Sentry (optional) |
| Breed detection | A separate Python service in `ml-service/` |
| Mobile app | Expo, React Native, React Navigation |
| Hosting | Render |

## Project layout

```
backend/
  src/
    controllers/     request handlers
    routes/          website routes and the /api/v1 routes
    models/          Mongoose models
    middlewares/     auth, uploads, role checks
    services/        chat and other business logic
    sockets/         Socket.IO setup, auth and calls
    views/           EJS pages
    i18n/            English and Hindi strings
    utils/           mailer, Cloudinary, limiter, helpers
  public/            CSS, JS, images
  ml-service/        breed detection service
  scripts/           create-admin script
  tests/             unit, chat and end to end tests

bovinetra-app/
  App.js
  src/
    api/             token storage and fetch client
    context/         login state
    components/      shared UI
    render/          renders the converted website pages
    kit/             generic screen, list and form builders
    screens/         one folder per area (auth, shop, seller, cattle, ...)
    navigation/      tabs and stack
```

## Running the backend

You need Node.js 20 or newer and a MongoDB database. Atlas works fine.

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Then fill in `.env`. These are the names the code reads. Keep the values private and never commit the file.

- **Core:** `PORT`, `NODE_ENV`, `APP_URL`, `CORS_ORIGIN`, `APP_TIMEZONE`, `MONGODB_URI`
- **Login tokens:** `ACCESS_TOKEN_SECRET`, `ACCESS_TOKEN_EXPIRY`, `REFRESH_TOKEN_SECRET`, `REFRESH_TOKEN_EXPIRY`
- **Google sign-in:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- **Images and video:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- **Payments:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- **Email:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_TO`
- **Web push:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- **Breed detection:** `ML_SERVICE_URL`, `ML_API_KEY`, `ML_SERVICE_TIMEOUT_MS`
- **Calls:** `TURN_URLS` and related TURN settings if you need calls to work behind strict networks
- **Monitoring (optional):** `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`

To create the first admin account, set `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env` and run:

```bash
npm run create-admin
```

Other scripts:

```bash
npm start          # production start
npm test           # all tests
npm run test:unit  # unit tests only
npm run test:chat  # chat tests
```

## Running the mobile app

The app talks to the same server as the website, so you do not need a second backend.

```bash
cd bovinetra-app
npm install --legacy-peer-deps
npx expo install expo-video socket.io-client @expo-google-fonts/plus-jakarta-sans
```

Create a `.env` file with the address of your server:

```
EXPO_PUBLIC_API_URL=https://your-app.onrender.com
```

Start it and scan the QR code with Expo Go. Use `npx expo start -c` after changing native packages or the `.env` file.

Make sure the Expo Go version on your phone matches the SDK in `package.json`. A mismatch is the most common reason the app refuses to open.

### How the app is built

The public pages (home, about, pricing and so on) were converted from the website's EJS and CSS into JSON blocks, so they keep the same colours, fonts and animations. The logged-in screens are native. Shopping, login and the profile screens are written by hand. The rest are generated from the website's own forms and from the JSON the server sends back, which keeps the two in step when a field is added.

### How the API is organised

- `/api/v1/auth/*` – register, login, refresh, logout, change password, avatar and cover updates
- `/api/v1/me` – read and update the signed-in user
- `/api/v1/products`, `/cart`, `/orders`, `/wishlist` – shop
- `/api/v1/contact` – contact form
- `/api/v1/web/*` – every other website route, returned as JSON instead of HTML

The app keeps an access token and a refresh token in secure storage, and renews the access token by itself when it expires.

## Deploying to Render

1. Push the backend to GitHub and create a Web Service from the repo.
2. Build command `npm install`, start command `npm start`.
3. Add every environment variable from the list above in the Render dashboard.
4. Set `APP_URL` and `CORS_ORIGIN` to your public address, and update `GOOGLE_CALLBACK_URL` in the Google console to match.
5. Point a health check at `/healthz`.

`RENDER_CHECKLIST.md` and `CHAT_SETUP.md` in the backend folder have the longer notes.

## Known gaps

- The app pays by cash on delivery only. Razorpay checkout works on the website.
- Push notifications and in-app calls are not in the mobile app yet.
- The cattle map in the app is a list with an "Open in Maps" button, not an embedded map.
- The language switch exists on the website but not yet in the app.
- The mobile app has been syntax-checked but needs more testing on real devices.

## Contributing

Open an issue before starting anything large. For small fixes, make a branch, keep the change focused, run `npm test`, and open a pull request.

## License

All rights reserved unless the owner states otherwise.
