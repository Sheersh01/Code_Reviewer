# Frontend

The frontend is a React + Vite app for writing code, requesting reviews, and managing recent results.

## Features

- Code editor with syntax highlighting
- Review request button with loading state
- Sample snippet shortcuts
- Live code stats
- Local cache for repeated reviews of the same code
- Cooldown-aware UI after backend rate limit responses
- Recent review history
- Copy code, copy review, and download review actions
- Markdown rendering for AI output

## Stack

- React
- Vite
- Axios
- PrismJS
- React Markdown
- Rehype Highlight

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Important Notes

- The frontend sends requests to `http://localhost:3000/ai/get-review`
- If you change the backend port, update the request URL in `src/App.jsx`
- Cached reviews and recent history are UI-level conveniences and are not persisted to a database

## Main Files

- [App.jsx](/c:/Users/HP/Desktop/Programming/Projects/Backend/Code%20Reviewer/Frontend/src/App.jsx)
- [App.css](/c:/Users/HP/Desktop/Programming/Projects/Backend/Code%20Reviewer/Frontend/src/App.css)
- [main.jsx](/c:/Users/HP/Desktop/Programming/Projects/Backend/Code%20Reviewer/Frontend/src/main.jsx)
- [index.css](/c:/Users/HP/Desktop/Programming/Projects/Backend/Code%20Reviewer/Frontend/src/index.css)
