export const SEED_PASSWORD = "Demo@1234";
export const SEED_DOMAIN = "seed.bovinetra.dev";

const face = (number) => `https://i.pravatar.cc/300?img=${number}`;
const cover = (seed) => `https://picsum.photos/seed/${seed}/1200/400`;

export const users = [
  {
    username: "ramesh.patel",
    fullName: "Ramesh Patel",
    role: "farmer",
    avatar: face(12),
    coverImage: cover("patel-gaushala"),
    contactPhone: "9824011101",
    farmerDetails: { farmName: "Patel Gir Gaushala", location: "Junagadh, Gujarat" },
    verification: { status: "verified", phone: "9824011101", farmPhotoUrl: cover("patel-farm"), note: "Farm visited by field team" },
    privacy: { showPresence: true, showContact: true }
  },
  {
    username: "harpreet.singh",
    fullName: "Harpreet Singh",
    role: "farmer",
    avatar: face(15),
    coverImage: cover("singh-dairy"),
    contactPhone: "9812345602",
    farmerDetails: { farmName: "Singh Dairy Farm", location: "Karnal, Haryana" },
    verification: { status: "verified", phone: "9812345602", farmPhotoUrl: cover("singh-farm"), note: "Verified with farm photo" },
    privacy: { showPresence: true, showContact: true }
  },
  {
    username: "sunita.devi",
    fullName: "Sunita Devi",
    role: "farmer",
    avatar: face(47),
    coverImage: cover("devi-murrah"),
    contactPhone: "9896011103",
    farmerDetails: { farmName: "Devi Murrah Farm", location: "Rohtak, Haryana" },
    verification: { status: "verified", phone: "9896011103", farmPhotoUrl: cover("devi-farm"), note: "" },
    privacy: { showPresence: true, showContact: false }
  },
  {
    username: "mohan.yadav",
    fullName: "Mohan Yadav",
    role: "farmer",
    avatar: face(33),
    coverImage: cover("yadav-pashu"),
    contactPhone: "9411022204",
    farmerDetails: { farmName: "Yadav Pashu Palan", location: "Mathura, Uttar Pradesh" },
    verification: { status: "pending", phone: "9411022204", farmPhotoUrl: cover("yadav-farm"), note: "" },
    privacy: { showPresence: false, showContact: true }
  },
  {
    username: "lakshmi.naidu",
    fullName: "Lakshmi Naidu",
    role: "farmer",
    avatar: face(44),
    coverImage: cover("naidu-ongole"),
    contactPhone: "9848011105",
    farmerDetails: { farmName: "Naidu Ongole Ranch", location: "Guntur, Andhra Pradesh" },
    verification: { status: "verified", phone: "9848011105", farmPhotoUrl: cover("naidu-farm"), note: "Documents checked" },
    privacy: { showPresence: true, showContact: true }
  },
  {
    username: "balwant.rathore",
    fullName: "Balwant Singh Rathore",
    role: "farmer",
    avatar: face(52),
    coverImage: "",
    contactPhone: "9414011106",
    farmerDetails: { farmName: "Rathore Cattle Farm", location: "Bikaner, Rajasthan" },
    verification: { status: "none" },
    privacy: { showPresence: true, showContact: false }
  },
  {
    username: "santosh.jadhav",
    fullName: "Santosh Jadhav",
    role: "farmer",
    avatar: face(60),
    coverImage: cover("jadhav-khillar"),
    contactPhone: "9822011107",
    farmerDetails: { farmName: "Jadhav Khillar Farm", location: "Satara, Maharashtra" },
    verification: { status: "rejected", phone: "9822011107", farmPhotoUrl: cover("jadhav-farm"), note: "Photo was not clear, please upload again" },
    privacy: { showPresence: true, showContact: false }
  },
  {
    username: "kavitha.murugan",
    fullName: "Kavitha Murugan",
    role: "farmer",
    avatar: face(25),
    coverImage: cover("murugan-kangayam"),
    contactPhone: "9944011108",
    farmerDetails: { farmName: "Murugan Kangayam Farm", location: "Erode, Tamil Nadu" },
    verification: { status: "verified", phone: "9944011108", farmPhotoUrl: cover("murugan-farm"), note: "" },
    privacy: { showPresence: true, showContact: true }
  },

  {
    username: "agrovet.mart",
    fullName: "Agrovet Mart Pune",
    role: "seller",
    avatar: face(8),
    coverImage: cover("agrovet-store"),
    contactPhone: "9822100201",
    buyerDetails: { address: "Shop 4, Market Yard, Pune, Maharashtra 411037" },
    privacy: { showPresence: true, showContact: true }
  },
  {
    username: "kisan.feeds",
    fullName: "Kisan Feeds Ludhiana",
    role: "seller",
    avatar: face(14),
    coverImage: cover("kisan-feeds"),
    contactPhone: "9815100202",
    buyerDetails: { address: "Focal Point, Phase 5, Ludhiana, Punjab 141010" },
    privacy: { showPresence: true, showContact: true }
  },
  {
    username: "dairy.needs",
    fullName: "Dairy Needs Anand",
    role: "seller",
    avatar: face(18),
    coverImage: cover("dairy-needs"),
    contactPhone: "9825100203",
    buyerDetails: { address: "Amul Dairy Road, Anand, Gujarat 388001" },
    privacy: { showPresence: true, showContact: false }
  },
  {
    username: "pashu.care.store",
    fullName: "Pashu Care Store Jaipur",
    role: "seller",
    avatar: face(21),
    coverImage: "",
    contactPhone: "9414100204",
    buyerDetails: { address: "Sanganer Bazar, Jaipur, Rajasthan 302029" },
    privacy: { showPresence: false, showContact: true }
  },
  {
    username: "green.fodder.co",
    fullName: "Green Fodder Co Nashik",
    role: "seller",
    avatar: face(30),
    coverImage: cover("green-fodder"),
    contactPhone: "9922100205",
    buyerDetails: { address: "Gangapur Road, Nashik, Maharashtra 422013" },
    privacy: { showPresence: true, showContact: true }
  },

  {
    username: "dr.anita.sharma",
    fullName: "Dr. Anita Sharma",
    role: "doctor",
    avatar: face(5),
    coverImage: cover("dr-anita"),
    contactPhone: "9810200301",
    doctorDetails: { specialization: "Cattle health and vaccination", experience: 12, consultationFee: 400, availableFrom: "10:00", availableTo: "17:00", slotMinutes: 20, workDays: [1, 2, 3, 4, 5, 6], acceptingBookings: true },
    privacy: { showPresence: true, showContact: true }
  },
  {
    username: "dr.vikram.rao",
    fullName: "Dr. Vikram Rao",
    role: "doctor",
    avatar: face(11),
    coverImage: cover("dr-vikram"),
    contactPhone: "9848200302",
    doctorDetails: { specialization: "Reproduction and breeding", experience: 9, consultationFee: 500, availableFrom: "09:00", availableTo: "15:00", slotMinutes: 30, workDays: [1, 2, 3, 4, 5], acceptingBookings: true },
    privacy: { showPresence: true, showContact: false }
  },
  {
    username: "dr.meera.nair",
    fullName: "Dr. Meera Nair",
    role: "doctor",
    avatar: face(23),
    coverImage: "",
    contactPhone: "9847200303",
    doctorDetails: { specialization: "Nutrition and feed planning", experience: 7, consultationFee: 350, availableFrom: "11:00", availableTo: "18:00", slotMinutes: 20, workDays: [2, 3, 4, 5, 6], acceptingBookings: true },
    privacy: { showPresence: true, showContact: true }
  },
  {
    username: "dr.imran.khan",
    fullName: "Dr. Imran Khan",
    role: "doctor",
    avatar: face(57),
    coverImage: cover("dr-imran"),
    contactPhone: "9839200304",
    doctorDetails: { specialization: "Large animal surgery", experience: 15, consultationFee: 700, availableFrom: "10:00", availableTo: "16:00", slotMinutes: 40, workDays: [1, 3, 5], acceptingBookings: true },
    privacy: { showPresence: false, showContact: false }
  },

  { username: "aarav.mehta", fullName: "Aarav Mehta", role: "user", avatar: face(3), contactPhone: "9820300401", buyerDetails: { address: "12 Linking Road, Mumbai, Maharashtra 400050" }, privacy: { showPresence: true, showContact: false } },
  { username: "priya.verma", fullName: "Priya Verma", role: "user", avatar: face(9), contactPhone: "9810300402", buyerDetails: { address: "B-44 Sector 15, Noida, Uttar Pradesh 201301" }, privacy: { showPresence: true, showContact: false } },
  { username: "rohit.kumar", fullName: "Rohit Kumar", role: "user", avatar: face(13), buyerDetails: { address: "Ward 7, Hisar, Haryana 125001" }, privacy: { showPresence: true, showContact: false } },
  { username: "sneha.reddy", fullName: "Sneha Reddy", role: "user", avatar: face(26), contactPhone: "9848300404", buyerDetails: { address: "Plot 21, Banjara Hills, Hyderabad, Telangana 500034" }, privacy: { showPresence: false, showContact: false } },
  { username: "imran.ansari", fullName: "Imran Ansari", role: "user", avatar: face(35), contactPhone: "9935300405", buyerDetails: { address: "Civil Lines, Lucknow, Uttar Pradesh 226001" }, privacy: { showPresence: true, showContact: true } },
  { username: "deepa.joshi", fullName: "Deepa Joshi", role: "user", avatar: face(38), buyerDetails: { address: "Vastrapur, Ahmedabad, Gujarat 380015" }, privacy: { showPresence: true, showContact: false } },
  { username: "vijay.chauhan", fullName: "Vijay Chauhan", role: "user", avatar: face(65), contactPhone: "9425300407", buyerDetails: { address: "MG Road, Indore, Madhya Pradesh 452001" }, privacy: { showPresence: true, showContact: false } }
];
