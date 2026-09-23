import request from "supertest";
import { app } from "../src/app.js";

describe("Health Check API", () => {

    test("/api/v1/healthcheck", async () => {

        const res = await request(app)
            .get("/api/v1/healthcheck");

        expect(res.statusCode).toBe(200);
    });

});