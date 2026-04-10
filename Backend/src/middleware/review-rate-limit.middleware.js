const WINDOW_MS = Number.parseInt(
  process.env.REVIEW_RATE_LIMIT_WINDOW_MS || "60000",
  10,
);
const MAX_REQUESTS = Number.parseInt(
  process.env.REVIEW_RATE_LIMIT_MAX_REQUESTS || "5",
  10,
);

const requestLog = new Map();

function cleanupOldEntries(clientKey, now) {
  const timestamps = requestLog.get(clientKey) || [];
  const validTimestamps = timestamps.filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );

  if (validTimestamps.length === 0) {
    requestLog.delete(clientKey);
    return [];
  }

  requestLog.set(clientKey, validTimestamps);
  return validTimestamps;
}

module.exports = function reviewRateLimit(req, res, next) {
  const now = Date.now();
  const clientKey = req.ip || req.headers["x-forwarded-for"] || "unknown";
  const recentRequests = cleanupOldEntries(clientKey, now);

  if (recentRequests.length >= MAX_REQUESTS) {
    const retryAfter = Math.max(
      1,
      Math.ceil((recentRequests[0] + WINDOW_MS - now) / 1000),
    );

    res.set("Retry-After", String(retryAfter));
    return res.status(429).send(
      `Too many review requests. Please wait ${retryAfter} seconds before trying again.`,
    );
  }

  recentRequests.push(now);
  requestLog.set(clientKey, recentRequests);
  next();
};
