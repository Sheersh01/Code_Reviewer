const express = require("express");
const aiController = require("../controllers/ai.controller");
const reviewRateLimit = require("../middleware/review-rate-limit.middleware");

const router = express.Router();

router.post("/get-review", reviewRateLimit, aiController.getReview);

module.exports = router;
