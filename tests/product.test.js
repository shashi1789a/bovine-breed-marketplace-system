import request from "supertest";
import { app } from "../src/app.js";

describe("Product API", () => {

    test("GET Products", async () => {

        const res = await request(app)
            .get("/api/v1/products");

        expect([200, 401, 403]).toContain(res.statusCode);

    });

});