import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
    res.render("pages/index", {
        title: "BoviNetra"
    });
});

router.get("/about-us", (req, res) => {
    res.render("pages/about-us", {
        title: "BoviNetra about-us"
    });
});

router.get("/contact-us", (req, res) => {
    res.render("pages/contact-us", {
        title: "BoviNetra contact-us"
    });
});

router.get("/cattele-management-softeware", (req, res) => {
    res.render("pages/cattele-management-softeware", {
        title: "BoviNetra cattele-management-softeware"
    });
});


router.get("/cattle-sale-purchase-app", (req, res) => {
    res.render("pages/cattle-sale-purchase-app", {
        title: "BoviNetra cattle-sale-purchase-app"
    });
});


router.get("/milk-collection-farmer-app", (req, res) => {
    res.render("pages/milk-collection-farmer-app", {
        title: "BoviNetra milk-collection-farmer-app"
    });
});


router.get("/milk-collection-software-app", (req, res) => {
    res.render("pages/milk-collection-software-app", {
        title: "BoviNetra milk-collection-software-app"
    });
});


router.get("/milk-delivery-customer-app", (req, res) => {
    res.render("pages/milk-delivery-customer-app", {
        title: "BoviNetra milk-delivery-customer-app"
    });
});

router.get("/milk-delivery-partner-app", (req, res) => {
    res.render("pages/milk-delivery-partner-app", {
        title: "BoviNetra milk-delivery-partner-app"
    });
});

router.get("/platform", (req, res) => {
    res.render("pages/platform", {
        title: "BoviNetra platform"
    });
});

router.get("/portfolio", (req, res) => {
    res.render("pages/portfolio", {
        title: "BoviNetra portfolio"
    });
});

router.get("/pricing", (req, res) => {
    res.render("pages/pricing", {
        title: "BoviNetra pricing"
    });
});

export default router;