const aiService = require("../services/ai.service");

module.exports.getReview = async (req, res) => {
  try {
    const code = req.body.code;

    if (!code || !code.trim()) {
      return res.status(400).send("Code is required");
    }

    const response = await aiService(code);

    res.send(response);
  } catch (error) {
    console.error("Review generation failed:", error);

    if (error?.retryAfter) {
      res.set("Retry-After", String(error.retryAfter));
    }

    res
      .status(error?.statusCode || 500)
      .send(error?.message || "Failed to generate review");
  }
};
