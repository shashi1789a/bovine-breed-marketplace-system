const photo = (seed) => `https://picsum.photos/seed/${seed}/1000/750`;
const gallery = (seed, count = 3) => Array.from({ length: count }, (_, index) => photo(`${seed}-${index + 1}`));

const daysAgo = (count) => {
  const date = new Date();
  date.setDate(date.getDate() - count);
  return date;
};

export const cattle = [
  {
    farmer: "ramesh.patel", breedName: "Gir", name: "Lakshmi", category: "Cow", gender: "Female", breedType: "Milch",
    age: 48, weight: 420, price: 85000, color: "Red", bodySize: "Medium", healthStatus: "Healthy, fully vaccinated",
    locationState: "Gujarat", locationDistrict: "Junagadh", latitude: 21.52, longitude: 70.46,
    scientificName: "Bos indicus", originCountry: "India", originState: "Gujarat",
    description: "Third lactation Gir cow, calm temperament, easy to milk by hand. Calf at foot can be included.",
    uniqueFeatures: "Long drooping ears, prominent forehead, curved horns",
    avgMilkPerDay: 12, peakLactationYield: 16, lactationPeriod: 300, fatPercentage: 4.6, snf: 8.7, milkQualityGrade: "A2",
    suitableClimate: "Hot", droughtResistance: "High", diseaseResistance: "Tick and heat tolerant",
    dailyFeedRequirement: "25 kg green fodder, 5 kg dry fodder, 3 kg concentrate",
    ageFirstCalving: 36, calvingInterval: 14, gestationPeriod: 285, artificialInsemination: true,
    commonDiseases: "Mastitis, foot and mouth disease", vaccinationSchedule: "FMD every six months, HS and BQ yearly",
    registeredBreedStatus: true, breedCertification: "Registered with Gir Gaushala Society", demandLevel: "High", lifespan: 20,
    images: gallery("gir-lakshmi", 4), imageUrl: photo("gir-lakshmi-1"),
    healthRecords: [
      { kind: "vaccination", title: "FMD vaccine", date: daysAgo(60), notes: "Booster due in four months" },
      { kind: "checkup", title: "Routine vet checkup", date: daysAgo(30), notes: "All parameters normal" }
    ]
  },
  {
    farmer: "ramesh.patel", breedName: "Gir", name: "Nandi", category: "Cow", gender: "Male", breedType: "Milch",
    age: 30, weight: 380, price: 60000, color: "Red", bodySize: "Medium", healthStatus: "Healthy",
    locationState: "Gujarat", locationDistrict: "Junagadh", latitude: 21.53, longitude: 70.45,
    description: "Gir bull for breeding. Pedigree records available. Calm and well handled.",
    registeredBreedStatus: true, demandLevel: "Medium",
    images: gallery("gir-nandi", 3), imageUrl: photo("gir-nandi-1")
  },
  {
    farmer: "harpreet.singh", breedName: "Sahiwal", name: "Gauri", category: "Cow", gender: "Female", breedType: "Milch",
    age: 54, weight: 450, price: 95000, color: "Brown", bodySize: "Large", healthStatus: "Healthy, tested for brucellosis",
    locationState: "Haryana", locationDistrict: "Karnal", latitude: 29.69, longitude: 76.98,
    scientificName: "Bos indicus", originCountry: "India", originState: "Punjab",
    description: "High yielding Sahiwal in second lactation. Milk record sheet available for the last 8 months.",
    uniqueFeatures: "Loose skin, short horns, reddish brown coat",
    avgMilkPerDay: 15, peakLactationYield: 20, lactationPeriod: 305, fatPercentage: 4.4, snf: 8.8, milkQualityGrade: "A",
    suitableClimate: "Hot", heatToleranceLevel: "Very high", diseaseResistance: "Good tick resistance",
    greenFodderQty: 30, dryFodderQty: 6, concentrateFeed: "3.5 kg compound feed", waterIntake: 80,
    ageFirstCalving: 32, calvingInterval: 13, gestationPeriod: 285, fertilityRate: "High", artificialInsemination: true,
    avgMarketPrice: 90000, maintenanceCost: 9000, ROI: 22, overallProductivityScore: 8.7,
    images: gallery("sahiwal-gauri", 5), imageUrl: photo("sahiwal-gauri-1"),
    healthRecords: [{ kind: "report", title: "Brucella test report", date: daysAgo(45), notes: "Negative", fileKind: "" }]
  },
  {
    farmer: "harpreet.singh", breedName: "Holstein Friesian Cross", name: "Rani", category: "Cow", gender: "Female", breedType: "Milch",
    age: 40, weight: 520, price: 78000, color: "Mixed", bodySize: "Large", healthStatus: "Healthy",
    locationState: "Haryana", locationDistrict: "Karnal", latitude: 29.7, longitude: 76.99,
    description: "HF cross giving high volume milk, suitable for commercial dairy.",
    avgMilkPerDay: 22, fatPercentage: 3.6, snf: 8.3,
    images: gallery("hf-rani", 3), imageUrl: photo("hf-rani-1")
  },
  {
    farmer: "sunita.devi", breedName: "Murrah", name: "Kali", category: "Buffalo", gender: "Female", breedType: "Milch",
    age: 60, weight: 560, price: 120000, color: "Black", bodySize: "Large", healthStatus: "Healthy, vaccinated",
    locationState: "Haryana", locationDistrict: "Rohtak", latitude: 28.89, longitude: 76.58,
    scientificName: "Bubalus bubalis", originCountry: "India", originState: "Haryana",
    description: "Pure Murrah buffalo with tightly curled horns. Third lactation, 14 litres a day at peak. Sold with calf if needed.",
    uniqueFeatures: "Jet black coat, short tightly curled horns, wedge shaped body",
    avgMilkPerDay: 14, peakLactationYield: 18, lactationPeriod: 310, fatPercentage: 7.2, snf: 9.2, milkQualityGrade: "A",
    lifetimeMilkProduction: 30000,
    suitableClimate: "Hot", humidityTolerance: "Medium", diseaseResistance: "Good",
    dailyFeedRequirement: "30 kg green fodder, 5 kg bhusa, 4 kg concentrate", mineralRequirement: "50 g mineral mix daily",
    specialDietLactation: "Add 250 g bypass fat during first 100 days",
    ageFirstCalving: 40, calvingInterval: 15, gestationPeriod: 310, heatCycleDuration: 21, bestBreedingSeason: "October to February",
    artificialInsemination: true,
    commonDiseases: "Mastitis, haemorrhagic septicaemia", vaccinationSchedule: "HS before monsoon, FMD every six months",
    preventiveCareTips: "Wallowing or shower in summer, keep udder clean",
    lifespan: 18, avgMarketPrice: 115000, demandLevel: "High", maintenanceCost: 11000, ROI: 25,
    milkEfficiencyScore: 9, overallProductivityScore: 9,
    statePopularity: "Haryana, Punjab, Uttar Pradesh", registeredBreedStatus: true, breedCertification: "Murrah Breeders Association",
    governmentSchemes: "Rashtriya Gokul Mission", NABARDSubsidyInfo: "Up to 25 percent back ended subsidy on dairy units",
    images: gallery("murrah-kali", 6), imageUrl: photo("murrah-kali-1"),
    healthRecords: [
      { kind: "vaccination", title: "HS vaccine", date: daysAgo(90), notes: "Given before monsoon" },
      { kind: "treatment", title: "Mastitis treatment", date: daysAgo(150), notes: "Recovered in 5 days" }
    ]
  },
  {
    farmer: "sunita.devi", breedName: "Murrah", name: "Bholu", category: "Buffalo", gender: "Male", breedType: "Milch",
    age: 36, weight: 610, price: 140000, color: "Black", bodySize: "Large", healthStatus: "Healthy",
    locationState: "Haryana", locationDistrict: "Rohtak", latitude: 28.9, longitude: 76.6,
    description: "Breeding bull from a 2400 litre per lactation dam line.",
    registeredBreedStatus: true, demandLevel: "High",
    images: gallery("murrah-bholu", 3), imageUrl: photo("murrah-bholu-1")
  },
  {
    farmer: "mohan.yadav", breedName: "Murrah", name: "Gulabo", category: "Buffalo", gender: "Female", breedType: "Milch",
    age: 52, weight: 540, price: 105000, color: "Black", healthStatus: "Healthy",
    locationState: "Uttar Pradesh", locationDistrict: "Mathura", latitude: 27.49, longitude: 77.67,
    description: "Good milker, easy to handle, sold only because we are shifting.",
    avgMilkPerDay: 12, fatPercentage: 7,
    images: gallery("murrah-gulabo", 2), imageUrl: photo("murrah-gulabo-1")
  },
  {
    farmer: "mohan.yadav", breedName: "Hariana", name: "Shyama", category: "Cow", gender: "Female", breedType: "Dual-purpose",
    age: 46, weight: 380, price: 55000, color: "White", bodySize: "Medium", healthStatus: "Healthy",
    locationState: "Uttar Pradesh", locationDistrict: "Mathura", latitude: 27.5, longitude: 77.68,
    description: "Hariana cow, white coat, useful both for milk and light farm work.",
    avgMilkPerDay: 7, suitableClimate: "Hot",
    images: gallery("hariana-shyama", 3), imageUrl: photo("hariana-shyama-1")
  },
  {
    farmer: "lakshmi.naidu", breedName: "Ongole", name: "Bheema", category: "Cow", gender: "Male", breedType: "Draught",
    age: 42, weight: 640, price: 150000, color: "White", bodySize: "Large", healthStatus: "Healthy, strong",
    locationState: "Andhra Pradesh", locationDistrict: "Guntur", latitude: 16.31, longitude: 80.44,
    scientificName: "Bos indicus", originCountry: "India", originState: "Andhra Pradesh",
    description: "Pure Ongole bull, muscular hump and excellent pulling power. Suitable for breeding and cart work.",
    uniqueFeatures: "Large hump, short horns, white coat with dark neck",
    avgWeightMale: 600, avgWeightFemale: 430, heightCm: 150, hornShape: "Short and stumpy", earType: "Medium drooping", skinType: "Loose",
    suitableClimate: "Hot", heatToleranceLevel: "Very high", droughtResistance: "High", diseaseResistance: "Good",
    lifespan: 22, demandLevel: "High", registeredBreedStatus: true, breedCertification: "Ongole Cattle Breeders Association",
    images: gallery("ongole-bheema", 4), imageUrl: photo("ongole-bheema-1")
  },
  {
    farmer: "lakshmi.naidu", breedName: "Ongole", name: "Seetha", category: "Cow", gender: "Female", breedType: "Dual-purpose",
    age: 50, weight: 430, price: 70000, color: "White", healthStatus: "Healthy",
    locationState: "Andhra Pradesh", locationDistrict: "Guntur", latitude: 16.32, longitude: 80.45,
    avgMilkPerDay: 6, description: "Calm Ongole cow with a healthy calf.",
    images: gallery("ongole-seetha", 3), imageUrl: photo("ongole-seetha-1")
  },
  {
    farmer: "balwant.rathore", breedName: "Rathi", name: "Roopa", category: "Cow", gender: "Female", breedType: "Milch",
    age: 44, weight: 350, price: 62000, color: "Brown", bodySize: "Medium", healthStatus: "Healthy",
    locationState: "Rajasthan", locationDistrict: "Bikaner", latitude: 28.02, longitude: 73.31,
    originState: "Rajasthan", description: "Rathi is called the Kamdhenu of Rajasthan. Handles heat and scarce fodder well.",
    avgMilkPerDay: 9, suitableClimate: "Hot", droughtResistance: "Very high",
    images: gallery("rathi-roopa", 3), imageUrl: photo("rathi-roopa-1")
  },
  {
    farmer: "balwant.rathore", breedName: "Tharparkar", name: "Dhanno", category: "Cow", gender: "Female", breedType: "Dual-purpose",
    age: 58, weight: 400, price: 72000, color: "White", healthStatus: "Healthy",
    locationState: "Rajasthan", locationDistrict: "Bikaner", latitude: 28.01, longitude: 73.3,
    description: "Tharparkar cow, grey white coat, good in desert conditions.",
    avgMilkPerDay: 8, droughtResistance: "Very high",
    images: gallery("tharparkar-dhanno", 2), imageUrl: photo("tharparkar-dhanno-1")
  },
  {
    farmer: "santosh.jadhav", breedName: "Khillar", name: "Raja", category: "Cow", gender: "Male", breedType: "Draught",
    age: 48, weight: 450, price: 180000, color: "Grey", bodySize: "Medium", healthStatus: "Healthy, show quality",
    locationState: "Maharashtra", locationDistrict: "Satara", latitude: 17.69, longitude: 74.0,
    description: "Khillar bull known for speed and stamina, ideal for bullock cart racing and farm work.",
    uniqueFeatures: "Upright horns, compact body, white grey coat",
    demandLevel: "High", registeredBreedStatus: true,
    images: gallery("khillar-raja", 4), imageUrl: photo("khillar-raja-1")
  },
  {
    farmer: "santosh.jadhav", breedName: "Deoni", name: "Chandni", category: "Cow", gender: "Female", breedType: "Dual-purpose",
    age: 45, weight: 390, price: 58000, color: "Mixed", healthStatus: "Healthy",
    locationState: "Maharashtra", locationDistrict: "Satara", latitude: 17.7, longitude: 74.01,
    avgMilkPerDay: 8, description: "Deoni cow with spotted coat, good both for milk and bullocks.",
    images: gallery("deoni-chandni", 3), imageUrl: photo("deoni-chandni-1")
  },
  {
    farmer: "kavitha.murugan", breedName: "Kangayam", name: "Murugan", category: "Cow", gender: "Male", breedType: "Draught",
    age: 36, weight: 480, price: 90000, color: "Grey", bodySize: "Medium", healthStatus: "Healthy",
    locationState: "Tamil Nadu", locationDistrict: "Erode", latitude: 11.34, longitude: 77.72,
    scientificName: "Bos indicus", originCountry: "India", originState: "Tamil Nadu",
    description: "Kangayam bull from our own herd, used in jallikattu training and farm work.",
    uniqueFeatures: "Grey body with dark neck and hump, crescent horns",
    suitableClimate: "Hot", droughtResistance: "High", demandLevel: "Medium",
    images: gallery("kangayam-murugan", 3), imageUrl: photo("kangayam-murugan-1")
  },
  {
    farmer: "kavitha.murugan", breedName: "Jersey Cross", name: "Mallika", category: "Cow", gender: "Female", breedType: "Milch",
    age: 38, weight: 400, price: 65000, color: "Fawn", bodySize: "Medium", healthStatus: "Healthy, vaccinated",
    locationState: "Tamil Nadu", locationDistrict: "Erode", latitude: 11.35, longitude: 77.73,
    avgMilkPerDay: 16, fatPercentage: 4.8, description: "Jersey cross, second calf, 16 litres at peak.",
    images: gallery("jersey-mallika", 3), imageUrl: photo("jersey-mallika-1"),
    healthRecords: [{ kind: "vaccination", title: "FMD vaccine", date: daysAgo(20), notes: "Next due in five months" }]
  },
  {
    farmer: "ramesh.patel", breedName: "Kankrej", name: "Nanda", category: "Cow", gender: "Female", breedType: "Dual-purpose",
    age: 52, weight: 430, price: 68000, color: "Grey", bodySize: "Large", healthStatus: "Healthy",
    locationState: "Gujarat", locationDistrict: "Banaskantha", latitude: 24.17, longitude: 72.43,
    avgMilkPerDay: 9, description: "Kankrej cow with lyre shaped horns. Strong and good milker.",
    images: gallery("kankrej-nanda", 3), imageUrl: photo("kankrej-nanda-1")
  },
  {
    farmer: "harpreet.singh", breedName: "Nili Ravi", name: "Neeli", category: "Buffalo", gender: "Female", breedType: "Milch",
    age: 56, weight: 580, price: 110000, color: "Black", bodySize: "Large", healthStatus: "Healthy",
    locationState: "Punjab", locationDistrict: "Amritsar", latitude: 31.63, longitude: 74.87,
    avgMilkPerDay: 13, fatPercentage: 6.8, description: "Nili Ravi with white markings on face and legs, good milk yield.",
    uniqueFeatures: "Wall eyes, white patch on forehead",
    images: gallery("niliravi-neeli", 4), imageUrl: photo("niliravi-neeli-1")
  },
  {
    farmer: "sunita.devi", breedName: "Jaffarabadi", name: "Bhuri", category: "Buffalo", gender: "Female", breedType: "Milch",
    age: 62, weight: 650, price: 125000, color: "Black", bodySize: "Large", healthStatus: "Healthy",
    locationState: "Gujarat", locationDistrict: "Gir Somnath", latitude: 20.91, longitude: 70.37,
    avgMilkPerDay: 11, fatPercentage: 8, description: "Heavy Jaffarabadi buffalo with massive head and drooping horns.",
    images: gallery("jaffar-bhuri", 3), imageUrl: photo("jaffar-bhuri-1")
  },
  {
    farmer: "lakshmi.naidu", breedName: "Punganur", name: "Chinni", category: "Cow", gender: "Female", breedType: "Milch",
    age: 30, weight: 160, price: 250000, color: "White", bodySize: "Small", healthStatus: "Healthy",
    locationState: "Andhra Pradesh", locationDistrict: "Chittoor", latitude: 13.2, longitude: 79.1,
    description: "Miniature Punganur cow, a rare breed. Only about 100 cm tall, gives 3 litres of rich milk.",
    uniqueFeatures: "Small hump, short crescent horns, very low maintenance",
    avgMilkPerDay: 3, fatPercentage: 8, demandLevel: "High", registeredBreedStatus: true,
    images: gallery("punganur-chinni", 5), imageUrl: photo("punganur-chinni-1")
  },
  {
    farmer: "balwant.rathore", breedName: "Nagori", name: "Sher", category: "Cow", gender: "Male", breedType: "Draught",
    age: 40, weight: 430, price: 76000, color: "White", healthStatus: "Healthy",
    locationState: "Rajasthan", locationDistrict: "Nagaur", latitude: 27.2, longitude: 73.73,
    description: "Nagori bull used for ploughing and carting. Fast walker.",
    images: gallery("nagori-sher", 2), imageUrl: photo("nagori-sher-1"),
    sold: true
  },
  {
    farmer: "kavitha.murugan", breedName: "Umblachery", name: "Kari", category: "Cow", gender: "Female", breedType: "Draught",
    age: 36, weight: 280, price: 38000, color: "Grey", bodySize: "Small", healthStatus: "Healthy",
    locationState: "Tamil Nadu", locationDistrict: "Thanjavur", latitude: 10.79, longitude: 79.14,
    description: "Hardy Umblachery cow suited to marshy delta fields.",
    images: gallery("umblachery-kari", 2), imageUrl: photo("umblachery-kari-1")
  }
];
