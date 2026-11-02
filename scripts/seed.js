import "dotenv/config";
import mongoose from "mongoose";

import { DB_NAME } from "../src/constants.js";
import { User } from "../src/models/user.model.js";
import { Product } from "../src/models/product.model.js";
import { Cattle } from "../src/models/cattle.model.js";
import { Reel } from "../src/models/reel.model.js";
import { Offer } from "../src/models/offer.model.js";
import { Appointment } from "../src/models/appointment.model.js";
import { SellerReview } from "../src/models/sellerReview.model.js";
import { DairyEntry } from "../src/models/dairyEntry.model.js";
import { Reminder } from "../src/models/reminder.model.js";
import { Follow } from "../src/models/follow.model.js";
import { Wishlist } from "../src/models/wishlist.model.js";
import { Notification } from "../src/models/notification.model.js";

import { SEED_PASSWORD, SEED_DOMAIN, users as userData } from "./seed-users.js";
import { products as productData } from "./seed-products.js";
import { cattle as cattleData } from "./seed-cattle.js";

const reset = process.argv.includes("--reset");

const VIDEOS = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4"
];

const CAPTIONS = [
  "Morning milking, calm and easy to handle",
  "Walking in the open yard, full video of the animal",
  "Eating green fodder, healthy appetite",
  "Showing the udder and teats clearly",
  "Calf playing next to the mother",
  "Standing check from all sides",
  "Evening in the shed, relaxed and clean",
  "Drinking water, no signs of weakness",
  "Bull walking with good stride",
  "Milk yield today, 14 litres",
  "Resting after grazing",
  "Fresh bedding and clean stall",
  "Loading test, comfortable in the vehicle",
  "Just after bath, coat looks shiny",
  "Mother and calf together",
  "Full body view in daylight",
  "Teeth and hooves check",
  "Moving freely in the paddock",
  "Quick walk for the buyer to see gait",
  "Final video before the sale"
];

const REASONS = [
  "Cow is not eating properly since yesterday and has mild fever",
  "Need a vaccination schedule for two calves",
  "Buffalo has swelling in one quarter of the udder",
  "Heifer not showing heat for three months",
  "Limping on the right hind leg",
  "Milk yield dropped by four litres this week",
  "Diarrhoea in a 2 month old calf",
  "Pregnancy check for a cow bred 60 days ago",
  "Skin lumps on neck and back",
  "Want advice on feed plan for dry period",
  "Cow had difficult calving two days ago",
  "Repeat breeder, three failed inseminations",
  "Worms suspected, animal is losing weight",
  "Eye discharge and watering in two animals",
  "Bloat after eating wet fodder",
  "Annual health check before sale",
  "Retained placenta after calving",
  "Cough and nasal discharge",
  "Hoof trimming and foot rot advice",
  "Deworming schedule for the whole herd"
];

const OFFER_NOTES = [
  "Can pick up this weekend",
  "Ready to pay advance today",
  "Please keep it for me until Sunday",
  "Will bring my own vehicle",
  "Is the calf included in this price?",
  "I have seen the video, interested",
  "Final price from my side",
  "Please confirm the milk record",
  "Need transport help, can we discuss",
  "Buying for my new dairy unit"
];

const REVIEW_COMMENTS = [
  "Animal was exactly as shown in the video. Smooth deal.",
  "Honest seller, answered every question on chat.",
  "Good milk yield as promised. Will buy again.",
  "Delivery was a day late but the animal was healthy.",
  "Fair price and clean farm.",
  "Very cooperative, helped with loading.",
  "Documents were ready on time.",
  "Calm animal, my family likes her.",
  "Seller was polite and patient.",
  "Slightly less milk than claimed but overall okay.",
  "Great experience, recommended.",
  "Quick response and genuine photos."
];

const PRODUCT_REVIEWS = [
  "Good quality, my cows like it.",
  "Packing was neat and delivery was on time.",
  "Value for money.",
  "Worked well, will reorder.",
  "Product matches the description.",
  "A little pricey but good results.",
  "Fast delivery, thanks.",
  "Genuine product."
];

const istDay = (offset) => {
  const date = new Date(Date.now() + offset * 86400000);

  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
};

const istWeekday = (day) => new Date(`${day}T12:00:00+05:30`).getUTCDay();

const toMinutes = (value) => {
  const [hours, minutes] = value.split(":").map(Number);

  return hours * 60 + minutes;
};

const clock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const slotsFor = (details, direction) => {
  const perDay = Math.max(1, Math.floor((toMinutes(details.availableTo) - toMinutes(details.availableFrom)) / details.slotMinutes));
  const list = [];

  for (let offset = direction; list.length < 40 && Math.abs(offset) < 120; offset += direction) {
    const day = istDay(offset);

    if (!details.workDays.includes(istWeekday(day))) continue;

    for (let slot = 0; slot < perDay; slot++) {
      list.push({ day, minutes: toMinutes(details.availableFrom) + slot * details.slotMinutes });
    }
  }

  return list;
};

const pick = (list, index) => list[index % list.length];

const wipe = async () => {
  const existing = await User.find({ email: new RegExp(`@${SEED_DOMAIN.replace(/\./g, "\\.")}$`) }).select("_id");
  const ids = existing.map((user) => user._id);

  if (!ids.length) return 0;

  await Promise.all([
    Product.deleteMany({ owner: { $in: ids } }),
    Cattle.deleteMany({ farmer: { $in: ids } }, { includeDeleted: true }),
    Reel.deleteMany({ farmer: { $in: ids } }),
    Offer.deleteMany({ $or: [{ buyer: { $in: ids } }, { seller: { $in: ids } }] }),
    Appointment.deleteMany({ $or: [{ patient: { $in: ids } }, { doctor: { $in: ids } }] }),
    SellerReview.deleteMany({ $or: [{ buyer: { $in: ids } }, { seller: { $in: ids } }] }),
    DairyEntry.deleteMany({ user: { $in: ids } }),
    Reminder.deleteMany({ user: { $in: ids } }),
    Follow.deleteMany({ $or: [{ follower: { $in: ids } }, { farmer: { $in: ids } }] }),
    Wishlist.deleteMany({ user: { $in: ids } }),
    Notification.deleteMany({ user: { $in: ids } })
  ]);

  await User.deleteMany({ _id: { $in: ids } });

  return ids.length;
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: DB_NAME });

  if (reset) {
    const removed = await wipe();
    console.log(`Removed ${removed} seed users and their data`);
  } else if (await User.exists({ email: `ramesh.patel@${SEED_DOMAIN}` })) {
    console.log("Seed data already exists. Run with --reset to replace it.");
    return;
  }

  const byName = new Map();
  const now = new Date();

  for (const item of userData) {
    const verification = item.verification
      ? {
          ...item.verification,
          ...(item.verification.status !== "none" ? { submittedAt: new Date(now - 20 * 86400000) } : {}),
          ...(["verified", "rejected"].includes(item.verification.status) ? { reviewedAt: new Date(now - 15 * 86400000) } : {})
        }
      : undefined;

    const user = await User.create({
      ...item,
      verification,
      email: `${item.username}@${SEED_DOMAIN}`,
      password: SEED_PASSWORD,
      lastSeenAt: new Date(now - Math.floor(Math.random() * 3 * 86400000))
    });

    byName.set(item.username, user);
  }

  const all = [...byName.values()];
  const farmers = all.filter((user) => user.role === "farmer");
  const doctors = all.filter((user) => user.role === "doctor");
  const buyers = all.filter((user) => user.role === "user");
  const patients = [...buyers, ...farmers];

  const productDocs = [];

  for (const item of productData) {
    const owner = byName.get(item.owner);
    const { owner: ownerName, ...fields } = item;

    productDocs.push(
      await Product.create({
        ...fields,
        owner: owner._id,
        ownerRole: owner.role,
        seller: {
          name: owner.fullName,
          phone: owner.contactPhone || "9800000000",
          address: owner.buyerDetails?.address || owner.farmerDetails?.location || ""
        },
        approvedAt: item.approvalStatus === "Approved" ? now : undefined
      })
    );
  }

  let reviewIndex = 0;

  for (const [index, product] of productDocs.entries()) {
    if (product.approvalStatus !== "Approved" || index % 2 === 1) continue;

    const reviewers = [pick(buyers, index), pick(buyers, index + 3)];
    const rows = reviewers.map((reviewer, position) => ({
      user: reviewer._id,
      name: reviewer.fullName,
      rating: position === 0 ? 5 : 4,
      comment: pick(PRODUCT_REVIEWS, reviewIndex++)
    }));

    product.reviews = rows;
    product.numOfReviews = rows.length;
    product.ratings = rows.reduce((sum, row) => sum + row.rating, 0) / rows.length;
    await product.save();
  }

  const cattleDocs = [];

  for (const item of cattleData) {
    const farmer = byName.get(item.farmer);
    const { farmer: farmerName, ...fields } = item;

    cattleDocs.push(
      await Cattle.create({
        ...fields,
        farmer: farmer._id,
        ...(item.sold ? { buyer: pick(buyers, 0)._id } : {})
      })
    );
  }

  const forSale = cattleDocs.filter((doc) => !doc.sold);

  for (let index = 0; index < 20; index++) {
    const target = forSale[index % forSale.length];

    await Reel.create({
      cattle: target._id,
      farmer: target.farmer,
      videoUrl: pick(VIDEOS, index),
      publicId: `seed/reel-${index + 1}`,
      durationSec: 12 + ((index * 7) % 46),
      sizeBytes: 2000000 + index * 350000,
      caption: CAPTIONS[index],
      optimized: false,
      likeCount: 5 + ((index * 13) % 90),
      commentCount: (index * 3) % 14,
      viewCount: 80 + ((index * 57) % 900)
    });
  }

  const statuses = [
    "completed", "completed", "completed", "completed", "completed",
    "confirmed", "confirmed", "confirmed", "confirmed", "confirmed", "confirmed",
    "pending", "pending", "pending", "pending", "pending",
    "declined", "declined", "cancelled", "cancelled"
  ];
  const notes = {
    completed: "Advised rest, fluids and a follow up in one week.",
    declined: "Not available at this time, please pick another slot.",
    cancelled: "",
    confirmed: "",
    pending: ""
  };
  const used = new Map();

  for (let index = 0; index < 20; index++) {
    const doctor = doctors[index % doctors.length];
    const details = doctor.doctorDetails;
    const status = statuses[index];
    const direction = status === "completed" ? -1 : 1;
    const key = `${doctor.username}-${direction}`;
    const count = used.get(key) || 0;

    used.set(key, count + 1);

    const { day, minutes } = slotsFor(details, direction)[count];
    const patient = pick(patients, index + 1);

    await Appointment.create({
      patient: patient._id,
      doctor: doctor._id,
      startsAt: new Date(`${day}T${clock(minutes)}:00+05:30`),
      durationMin: details.slotMinutes,
      reason: REASONS[index],
      cattleLabel: pick(["Gauri (Sahiwal)", "Kali (Murrah)", "Tag 214", "Calf, 2 months", "Brown cow", "", "Lakshmi (Gir)"], index),
      status,
      doctorNote: notes[status],
      fee: details.consultationFee,
      reminderSent: status === "completed"
    });
  }

  const offerStatuses = ["pending", "pending", "pending", "pending", "pending", "pending", "accepted", "accepted", "accepted", "rejected", "rejected", "rejected", "withdrawn", "withdrawn", "expired", "pending", "pending", "accepted", "rejected", "pending"];
  const offerDocs = [];

  for (let index = 0; index < 20; index++) {
    const target = forSale[(index * 3) % forSale.length];
    const buyer = pick(buyers, index);
    const status = offerStatuses[index];
    const ratio = 0.72 + ((index * 5) % 22) / 100;
    const amount = Math.round((target.price * ratio) / 500) * 500;
    const decided = ["accepted", "rejected"].includes(status);

    offerDocs.push(
      await Offer.create({
        cattle: target._id,
        buyer: buyer._id,
        seller: target.farmer,
        amount,
        listedPrice: target.price,
        message: pick(OFFER_NOTES, index),
        status,
        responseNote: status === "accepted" ? "Okay, deal. Call me to fix the day." : status === "rejected" ? "Sorry, this is too low for this animal." : "",
        decidedAt: decided ? new Date(now - 2 * 86400000) : undefined,
        expiresAt: status === "expired" ? new Date(now - 86400000) : new Date(now.getTime() + 7 * 86400000)
      })
    );
  }

  const sums = new Map();

  for (let index = 0; index < 20; index++) {
    const farmer = pick(farmers.filter((item) => item.verification?.status !== "none"), index);
    const buyer = pick(buyers, index + 2);
    const rating = [5, 5, 4, 5, 4, 3, 5, 4, 5, 4, 2, 5, 4, 5, 3, 5, 4, 4, 5, 4][index];

    await SellerReview.create({
      seller: farmer._id,
      buyer: buyer._id,
      dealType: index % 3 === 0 ? "order" : "offer",
      dealId: new mongoose.Types.ObjectId(),
      rating,
      comment: pick(REVIEW_COMMENTS, index)
    });

    const entry = sums.get(String(farmer._id)) || { total: 0, count: 0 };
    entry.total += rating;
    entry.count += 1;
    sums.set(String(farmer._id), entry);
  }

  for (const [id, entry] of sums) {
    await User.updateOne({ _id: id }, { $set: { sellerRating: { avg: Math.round((entry.total / entry.count) * 10) / 10, count: entry.count } } });
  }

  const dairyOwners = farmers.slice(0, 3);
  const expenseRows = [
    ["expense", "feed", 5200, "Cotton seed cake and compound feed"],
    ["expense", "medicine", 1350, "Vaccines and dewormer"],
    ["expense", "labour", 6000, "Monthly helper wage"],
    ["expense", "electricity", 1800, "Chaff cutter and borewell"],
    ["expense", "transport", 900, "Milk can transport"],
    ["income", "manure", 2400, "Farmyard manure sold"],
    ["income", "cattle_sale", 45000, "Sold one male calf"],
    ["income", "subsidy", 8000, "Dairy scheme instalment"]
  ];

  for (const [ownerIndex, owner] of dairyOwners.entries()) {
    for (let day = 1; day <= 8; day++) {
      const morning = 14 + ((day * 3 + ownerIndex * 2) % 7);
      const evening = 11 + ((day * 5 + ownerIndex) % 6);

      await DairyEntry.create({
        user: owner._id,
        kind: "milk",
        day: istDay(-day),
        morningLitres: morning,
        eveningLitres: evening,
        ratePerLitre: 48 + ownerIndex * 2,
        amount: (morning + evening) * (48 + ownerIndex * 2),
        note: day % 4 === 0 ? "Slightly less due to heat" : ""
      });
    }

    for (const [rowIndex, row] of expenseRows.entries()) {
      if ((rowIndex + ownerIndex) % 3 === 2) continue;

      await DairyEntry.create({
        user: owner._id,
        kind: row[0],
        day: istDay(-(rowIndex * 2 + 1)),
        amount: row[2] + ownerIndex * 300,
        category: row[1],
        note: row[3]
      });
    }
  }

  const reminderRows = [
    ["vaccination", "FMD booster", "Lakshmi (Gir)", 12, 3, 180, "Use the vial bought from Dr. Anita"],
    ["vaccination", "HS and BQ vaccine", "Kali (Murrah)", 25, 5, 365, "Before monsoon starts"],
    ["deworming", "Deworming for calves", "Calves", 7, 2, 90, "Ivermectin as per weight"],
    ["pregnancy_check", "Pregnancy check", "Gauri (Sahiwal)", 18, 3, 0, "Bred 60 days ago"],
    ["calving", "Expected calving", "Rani (HF cross)", 33, 7, 0, "Move to maternity pen a week before"],
    ["heat", "Watch for heat signs", "Heifer, tag 17", 4, 1, 21, "Note time of standing heat"],
    ["checkup", "Annual health checkup", "Whole herd", 40, 7, 365, "Book Dr. Vikram"],
    ["vaccination", "Brucella S19", "Female calves", 55, 5, 0, "Only calves 4 to 8 months"],
    ["other", "Hoof trimming", "Bulls", 10, 2, 120, ""],
    ["deworming", "Deworming adults", "Milking herd", 22, 3, 120, "Respect milk withdrawal"]
  ];

  for (let index = 0; index < 20; index++) {
    const row = reminderRows[index % reminderRows.length];
    const owner = pick(farmers, index);
    const done = index % 7 === 0;

    await Reminder.create({
      user: owner._id,
      kind: row[0],
      title: row[1],
      cattleLabel: row[2],
      dueDay: istDay(done ? -(index + 2) : row[3] + index),
      leadDays: row[4],
      repeatDays: row[5],
      notes: row[6],
      done,
      doneAt: done ? new Date(now - 86400000) : null
    });
  }

  for (let index = 0; index < 20; index++) {
    const follower = pick(buyers, index);
    const farmer = pick(farmers, Math.floor(index / 2) + index);

    await Follow.updateOne({ follower: follower._id, farmer: farmer._id }, { $setOnInsert: { follower: follower._id, farmer: farmer._id } }, { upsert: true });
  }

  for (let index = 0; index < 20; index++) {
    const user = pick(buyers, index);
    const target = forSale[(index * 2) % forSale.length];

    await Wishlist.updateOne({ user: user._id, cattle: target._id }, { $setOnInsert: { user: user._id, cattle: target._id, priceAtSave: target.price } }, { upsert: true });
  }

  const noteRows = [
    ["offer_received", "New offer received", "A buyer offered a price for your cattle.", "/offers"],
    ["offer_accepted", "Your offer was accepted", "The seller accepted your offer. Contact them to finish the deal.", "/offers"],
    ["offer_rejected", "Offer declined", "The seller declined your offer.", "/offers"],
    ["price_drop", "Price drop on a saved animal", "An animal in your wishlist is now cheaper.", "/wishlist"],
    ["new_reel", "New reel from a farmer you follow", "Watch the latest video.", "/reels"],
    ["new_follower", "You have a new follower", "A buyer started following your farm.", "/farmers"],
    ["order_new", "New order received", "You have a new order to ship.", "/seller/orders"],
    ["order_update", "Your order was shipped", "Track the order from My orders.", "/orders"],
    ["reminder", "Reminder due soon", "FMD booster is due in 3 days.", "/farmer/reminders"],
    ["appointment", "Appointment confirmed", "Your video consultation is confirmed.", "/appointments"]
  ];

  for (let index = 0; index < 20; index++) {
    const row = noteRows[index % noteRows.length];
    const user = row[0] === "order_new" || row[0] === "reminder" || row[0] === "offer_received" || row[0] === "new_follower" ? pick(farmers, index) : pick(buyers, index);

    await Notification.create({
      user: user._id,
      type: row[0],
      title: row[1],
      body: row[2],
      link: row[3],
      readAt: index % 3 === 0 ? new Date() : null
    });
  }

  console.log("Seed complete");
  console.log(`Users ${all.length}, products ${productDocs.length}, cattle ${cattleDocs.length}, reels 20, appointments 20, offers ${offerDocs.length}, reviews 20`);
  console.log(`All seed accounts use the password ${SEED_PASSWORD} and emails like ramesh.patel@${SEED_DOMAIN}`);
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
