import { FARMER_CATEGORIES, PRODUCT_CATEGORIES, SELLER_CATEGORIES, SELLER_ROLES, categoriesForRole } from "../../src/models/product.model.js";
import { SELF_REGISTER_ROLES, USER_ROLES } from "../../src/models/user.model.js";

describe("roles", () => {
    it("has seller instead of buyer", () => {
        expect(USER_ROLES).toContain("seller");
        expect(USER_ROLES).not.toContain("buyer");
        expect(SELF_REGISTER_ROLES).toContain("seller");
        expect(SELLER_ROLES).toContain("seller");
    });
});

describe("what each role may sell", () => {
    it("limits farmers to farm produce and equipment", () => {
        expect(categoriesForRole("farmer")).toEqual(FARMER_CATEGORIES);
        expect(FARMER_CATEGORIES).toEqual(expect.arrayContaining(["Feed", "Fodder & Straw", "Dung Cake (Goitha)", "Trough (Naad)"]));
        expect(FARMER_CATEGORIES).not.toContain("Medicine");
        expect(FARMER_CATEGORIES).not.toContain("Pet Food");
        expect(FARMER_CATEGORIES).not.toContain("Other");
    });

    it("lets sellers sell every animal and pet product category", () => {
        expect(categoriesForRole("seller")).toEqual(SELLER_CATEGORIES);
        expect(SELLER_CATEGORIES).toEqual(expect.arrayContaining(["Medicine", "Pet Food", "Pet Accessories", "Feed", "Other"]));
    });

    it("keeps admins and doctors unrestricted", () => {
        expect(categoriesForRole("admin")).toEqual(PRODUCT_CATEGORIES);
        expect(categoriesForRole("doctor")).toEqual(PRODUCT_CATEGORIES);
    });

    it("every farmer category is a valid product category", () => {
        for (const category of FARMER_CATEGORIES) expect(PRODUCT_CATEGORIES).toContain(category);
    });
});
