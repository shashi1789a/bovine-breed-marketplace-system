import request from "supertest";
import { app } from "../src/app.js";

describe("Server Testing", () => {

    test("Home Route Should Work", async () => {

        const response = await request(app).get("/");

        expect(response.statusCode).toBe(200);

    });

});