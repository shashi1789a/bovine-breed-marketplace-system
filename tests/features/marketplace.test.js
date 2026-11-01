import request from "supertest";
import mongoose from "mongoose";

import { createUser, startTestDb, stopTestDb } from "../chat/helpers/env.js";

let mongod;
let app;
let farmer;
let admin;

const makeCattle = (overrides) => ({
    name: "Test cow",
    breedName: "Gir",
    category: "Cow",
    price: 50000,
    isActive: true,
    sold: false,
    farmer: new mongoose.Types.ObjectId(),
    createdAt: new Date(),
    ...overrides
});

beforeAll(async () => {
    mongod = await startTestDb();
    ({ app } = await import("../../src/app.js"));

    const { Cattle } = await import("../../src/models/cattle.model.js");
    await Cattle.init();

    farmer = await createUser("farmer");
    admin = await createUser("admin");

    await Cattle.collection.insertMany([
        makeCattle({ name: "Punjab cow", locationState: "Punjab", locationDistrict: "Ludhiana", avgMilkPerDay: 18, price: 60000, geo: { type: "Point", coordinates: [75.85, 30.9] } }),
        makeCattle({ name: "Kerala cow", locationState: "Kerala", locationDistrict: "Thrissur", avgMilkPerDay: 6, price: 20000, geo: { type: "Point", coordinates: [76.2, 10.5] } }),
        makeCattle({ name: "Nowhere cow", avgMilkPerDay: 10, price: 30000 })
    ]);
});

afterAll(async () => {
    await stopTestDb(mongod);
});

const names = (res) => res.body.data.cattle.map((item) => item.name).sort();

describe("cattle filters", () => {
    it("filters by state", async () => {
        const res = await request(app).get("/cattle?state=Punjab").set("Accept", "application/json");

        expect(res.status).toBe(200);
        expect(names(res)).toEqual(["Punjab cow"]);
    });

    it("filters by district prefix, case-insensitively", async () => {
        const res = await request(app).get("/cattle?district=thris").set("Accept", "application/json");

        expect(names(res)).toEqual(["Kerala cow"]);
    });

    it("filters by price range and milk yield", async () => {
        const price = await request(app).get("/cattle?minPrice=25000&maxPrice=65000").set("Accept", "application/json");
        const milk = await request(app).get("/cattle?minMilk=8").set("Accept", "application/json");

        expect(names(price)).toEqual(["Nowhere cow", "Punjab cow"]);
        expect(names(milk)).toEqual(["Nowhere cow", "Punjab cow"]);
    });

    it("finds cattle near a point and ignores far ones", async () => {
        const res = await request(app).get("/cattle?lat=30.9&lng=75.8&radius=50").set("Accept", "application/json");

        expect(names(res)).toEqual(["Punjab cow"]);
    });

    it("ignores coordinates outside India", async () => {
        const res = await request(app).get("/cattle?lat=51.5&lng=-0.1&radius=10").set("Accept", "application/json");

        expect(res.body.data.totalCattle).toBe(3);
    });
});

describe("pages", () => {
    it("renders the marketplace with the cattle filters", async () => {
        const res = await request(app).get("/products?type=cattle&state=Punjab");

        expect(res.status).toBe(200);
        expect(res.text).toContain("filterState");
        expect(res.text).toContain("nearMeButton");
    });

    it("renders the map page and its data for cattle that have a location", async () => {
        const page = await request(app).get("/cattle/map");
        const data = await request(app).get("/cattle/map/data").set("Accept", "application/json");

        expect(page.status).toBe(200);
        expect(data.status).toBe(200);
        expect(data.body.data.points.map((point) => point.title).sort()).toEqual(["Kerala cow", "Punjab cow"]);
    });

    it("shows Hindi when asked", async () => {
        const res = await request(app).get("/products?type=cattle").set("Cookie", "lang=hi");

        expect(res.status).toBe(200);
        expect(res.headers["content-language"]).toBe("hi");
        expect(res.text).toContain("राज्य");
    });

    it("sets the language cookie and returns to the page", async () => {
        const res = await request(app).get("/lang/hi?next=/products");

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe("/products");
        expect(res.headers["set-cookie"].join(";")).toContain("lang=hi");
    });
});

describe("access control", () => {
    it("keeps analytics for admins only", async () => {
        const anonymous = await request(app).get("/admin/analytics");
        const asFarmer = await request(app).get("/admin/analytics").set("Cookie", farmer.cookie);
        const asAdmin = await request(app).get("/admin/analytics").set("Cookie", admin.cookie);

        expect(anonymous.status).toBe(302);
        expect(asFarmer.status).toBeGreaterThanOrEqual(401);
        expect(asAdmin.status).toBe(200);
        expect(asAdmin.text).toContain("Analytics");
    });

    it("keeps dairy and reminders for farmers", async () => {
        const buyer = await createUser("seller");

        expect((await request(app).get("/farmer/dairy")).status).toBe(302);
        expect((await request(app).get("/farmer/dairy").set("Cookie", buyer.cookie)).status).toBeGreaterThanOrEqual(401);
        expect((await request(app).get("/farmer/dairy").set("Cookie", farmer.cookie)).status).toBe(200);
        expect((await request(app).get("/farmer/reminders").set("Cookie", farmer.cookie)).status).toBe(200);
    });
});

describe("seller and farmer products", () => {
    const form = (who, category) =>
        request(app)
            .post("/products/add")
            .set("Cookie", who.cookie)
            .set("Accept", "application/json")
            .send({ name: "Test item", description: "A test item for sale", price: 100, category, stock: 5 });

    it("rejects a farmer selling medicine and tells them why", async () => {
        const res = await form(farmer, "Medicine");

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/Farmers can sell only/);
    });

    it("lets a farmer sell dung cake but not a seller-only category", async () => {
        const allowed = await form(farmer, "Dung Cake (Goitha)");
        const blocked = await form(farmer, "Pet Food");

        expect(allowed.body.message || "").not.toMatch(/Farmers can sell only|Invalid category/);
        expect(blocked.status).toBe(400);
        expect(blocked.body.message).toMatch(/Farmers can sell only/);
    });

    it("lets a seller sell pet food and open the seller pages", async () => {
        const seller = await createUser("seller");

        expect((await form(seller, "Pet Food")).body.message || "").not.toMatch(/cannot sell|Invalid category/);
        expect((await request(app).get("/seller/dashboard").set("Cookie", seller.cookie)).status).toBe(200);
        expect((await request(app).get("/seller/products").set("Cookie", seller.cookie)).status).toBe(200);
        expect((await request(app).get("/seller/cattle").set("Cookie", seller.cookie)).status).toBeGreaterThanOrEqual(401);
    });
});
