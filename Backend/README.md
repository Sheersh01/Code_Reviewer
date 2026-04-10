# Backend

The backend is an Express server that sends code snippets to Gemini and returns markdown reviews.

## Features

- `POST /ai/get-review` endpoint for code review generation
- Gemini-powered review service
- Input validation for empty and oversized code
- In-memory caching for duplicate review requests
- In-flight request deduping
- Retry cooldown after Gemini `429` responses
- Per-client request throttling
- Friendly error messages for invalid API keys, missing models, and quota issues

## Run Locally

```bash
npm install
npm run dev
```

Production:

```bash
npm start
```

## Environment Variables

Required:

```env
GOOGLE_GEMINI_KEY=your_api_key_here
```

Optional:

```env
PORT=3000
GEMINI_MODEL=gemini-2.0-flash
GEMINI_MAX_OUTPUT_TOKENS=900
MAX_REVIEW_CODE_LENGTH=12000
REVIEW_CACHE_TTL_MS=300000
MAX_REVIEW_CACHE_ENTRIES=100
REVIEW_RATE_LIMIT_WINDOW_MS=60000
REVIEW_RATE_LIMIT_MAX_REQUESTS=5
```

## API

### `POST /ai/get-review`

Request body:

```json
{
  "code": "function sum() { return 1 + 1; }"
}
```

Response:

- `200`: markdown review text
- `400`: missing or invalid input
- `401`: invalid Gemini API key
- `404`: invalid or unavailable Gemini model
- `413`: code too large
- `429`: backend throttle or Gemini quota limit
- `500`: unexpected server error

## Main Files

- [server.js](/c:/Users/HP/Desktop/Programming/Projects/Backend/Code%20Reviewer/Backend/server.js)
- [app.js](/c:/Users/HP/Desktop/Programming/Projects/Backend/Code%20Reviewer/Backend/src/app.js)
- [ai.routes.js](/c:/Users/HP/Desktop/Programming/Projects/Backend/Code%20Reviewer/Backend/src/routes/ai.routes.js)
- [ai.controller.js](/c:/Users/HP/Desktop/Programming/Projects/Backend/Code%20Reviewer/Backend/src/controllers/ai.controller.js)
- [ai.service.js](/c:/Users/HP/Desktop/Programming/Projects/Backend/Code%20Reviewer/Backend/src/services/ai.service.js)
- [review-rate-limit.middleware.js](/c:/Users/HP/Desktop/Programming/Projects/Backend/Code%20Reviewer/Backend/src/middleware/review-rate-limit.middleware.js)
