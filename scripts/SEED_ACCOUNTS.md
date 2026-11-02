# Seed accounts

Password for every account: `Demo@1234`

| Role | Name | Email |
|---|---|---|
| farmer | Ramesh Patel | ramesh.patel@seed.bovinetra.dev |
| farmer | Harpreet Singh | harpreet.singh@seed.bovinetra.dev |
| farmer | Sunita Devi | sunita.devi@seed.bovinetra.dev |
| farmer | Mohan Yadav | mohan.yadav@seed.bovinetra.dev |
| farmer | Lakshmi Naidu | lakshmi.naidu@seed.bovinetra.dev |
| farmer | Balwant Singh Rathore | balwant.rathore@seed.bovinetra.dev |
| farmer | Santosh Jadhav | santosh.jadhav@seed.bovinetra.dev |
| farmer | Kavitha Murugan | kavitha.murugan@seed.bovinetra.dev |
| seller | Agrovet Mart Pune | agrovet.mart@seed.bovinetra.dev |
| seller | Kisan Feeds Ludhiana | kisan.feeds@seed.bovinetra.dev |
| seller | Dairy Needs Anand | dairy.needs@seed.bovinetra.dev |
| seller | Pashu Care Store Jaipur | pashu.care.store@seed.bovinetra.dev |
| seller | Green Fodder Co Nashik | green.fodder.co@seed.bovinetra.dev |
| doctor | Dr. Anita Sharma | dr.anita.sharma@seed.bovinetra.dev |
| doctor | Dr. Vikram Rao | dr.vikram.rao@seed.bovinetra.dev |
| doctor | Dr. Meera Nair | dr.meera.nair@seed.bovinetra.dev |
| doctor | Dr. Imran Khan | dr.imran.khan@seed.bovinetra.dev |
| user | Aarav Mehta | aarav.mehta@seed.bovinetra.dev |
| user | Priya Verma | priya.verma@seed.bovinetra.dev |
| user | Rohit Kumar | rohit.kumar@seed.bovinetra.dev |
| user | Sneha Reddy | sneha.reddy@seed.bovinetra.dev |
| user | Imran Ansari | imran.ansari@seed.bovinetra.dev |
| user | Deepa Joshi | deepa.joshi@seed.bovinetra.dev |
| user | Vijay Chauhan | vijay.chauhan@seed.bovinetra.dev |

## Run

Add these two lines under `scripts` in `package.json`:

```
"seed": "node -r ./dns-fix.cjs -r dotenv/config scripts/seed.js",
"seed:reset": "node -r ./dns-fix.cjs -r dotenv/config scripts/seed.js --reset"
```

Then `npm run seed`. Use `npm run seed:reset` to delete the demo data and create it again.

## What it creates

- 24 users: 8 farmers, 5 sellers, 4 doctors, 7 buyers
- 25 products across 14 categories (3 pending approval, 1 rejected, 3 featured)
- 22 cattle listings (cows and buffaloes, 1 sold)
- 20 reels, 20 appointments, 20 offers, 20 seller reviews
- 24 milk records plus expense and income entries, 20 reminders
- 20 follows, 20 wishlist items, 20 notifications

Images come from picsum.photos and i.pravatar.cc, so they are random stock photos, not real cattle. Reels use public sample videos. Replace them with your own Cloudinary uploads for a real demo.
