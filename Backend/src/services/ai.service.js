const crypto = require("crypto");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const apiKey = process.env.GOOGLE_GEMINI_KEY || process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error(
    "Missing Google API key. Set GOOGLE_GEMINI_KEY or GEMINI_API_KEY in Backend/.env",
  );
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  generationConfig: {
    temperature: 0.2,
    maxOutputTokens: Number.parseInt(
      process.env.GEMINI_MAX_OUTPUT_TOKENS || "900",
      10,
    ),
  },
  systemInstruction: `
    You are a senior code reviewer.
    Focus on correctness, security, performance, readability, and edge cases.
    Keep feedback concise and actionable.
    Prefer short bullet points.
    Only include an improved code snippet when a concrete fix is necessary.
  `,
});

const MAX_CODE_LENGTH = Number.parseInt(
  process.env.MAX_REVIEW_CODE_LENGTH || "12000",
  10,
);
const REVIEW_CACHE_TTL_MS = Number.parseInt(
  process.env.REVIEW_CACHE_TTL_MS || "300000",
  10,
);
const MAX_CACHE_ENTRIES = Number.parseInt(
  process.env.MAX_REVIEW_CACHE_ENTRIES || "100",
  10,
);

const responseCache = new Map();
const inFlightRequests = new Map();
let quotaCooldownUntil = 0;

function createHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeCode(code) {
  return code.trim().replace(/\r\n/g, "\n");
}

function createFriendlyError(message, statusCode, extra = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  Object.assign(error, extra);
  return error;
}

function ensureCodeWithinLimit(code) {
  if (code.length > MAX_CODE_LENGTH) {
    throw createFriendlyError(
      `Code is too large to review in one request. Keep it under ${MAX_CODE_LENGTH} characters to avoid exhausting the API limit.`,
      413,
    );
  }
}

function getCachedResponse(cacheKey) {
  const entry = responseCache.get(cacheKey);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    responseCache.delete(cacheKey);
    return null;
  }

  return entry.value;
}

function setCachedResponse(cacheKey, value) {
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) {
      responseCache.delete(oldestKey);
    }
  }

  responseCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + REVIEW_CACHE_TTL_MS,
  });
}

function parseRetryDelaySeconds(errorDetails) {
  const retryInfo = errorDetails?.find(
    (detail) =>
      detail?.["@type"] === "type.googleapis.com/google.rpc.RetryInfo",
  );

  const retryDelayRaw = retryInfo?.retryDelay;
  if (!retryDelayRaw || typeof retryDelayRaw !== "string") {
    return null;
  }

  const parsed = Number.parseInt(retryDelayRaw.replace("s", ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function generateContent(prompt) {
  const normalizedPrompt = normalizeCode(prompt);
  ensureCodeWithinLimit(normalizedPrompt);

  const now = Date.now();
  if (quotaCooldownUntil > now) {
    const retryAfter = Math.max(
      1,
      Math.ceil((quotaCooldownUntil - now) / 1000),
    );
    throw createFriendlyError(
      `Gemini quota is cooling down. Try again in ${retryAfter} seconds.`,
      429,
      { retryAfter },
    );
  }

  const cacheKey = createHash(normalizedPrompt);
  const cachedResponse = getCachedResponse(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const reviewPrompt = `Review this code and return markdown with these sections:

1. Summary
2. Issues Found
3. Suggested Fixes
4. Improved Code Snippet if needed

Keep the review concise and only include the most important findings.

Code:
\`\`\`javascript
${normalizedPrompt}
\`\`\`
`;

  const reviewRequest = (async () => {
    try {
      const result = await model.generateContent(reviewPrompt);
      const responseText = result.response.text();
      setCachedResponse(cacheKey, responseText);
      return responseText;
    } catch (error) {
      if (
        error?.status === 400 ||
        error?.errorDetails?.some(
          (detail) => detail?.reason === "API_KEY_INVALID",
        )
      ) {
        throw createFriendlyError(
          "Invalid Google API key. Replace the value in Backend/.env with a valid Gemini API key.",
          401,
        );
      }

      if (error?.status === 404) {
        throw createFriendlyError(
          "Gemini model not found. Check GEMINI_MODEL in Backend/.env and use a model available for your API key.",
          404,
        );
      }

      if (error?.status === 429) {
        const retryAfter = parseRetryDelaySeconds(error?.errorDetails) || 30;
        quotaCooldownUntil = Date.now() + retryAfter * 1000;
        throw createFriendlyError(
          `Gemini quota exceeded. Try again in ${retryAfter} seconds, or upgrade your API quota/billing in Google AI Studio.`,
          429,
          { retryAfter },
        );
      }

      throw error;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, reviewRequest);
  return reviewRequest;
}

module.exports = generateContent;
