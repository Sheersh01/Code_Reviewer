import { useEffect, useMemo, useRef, useState } from "react";
import "prismjs/themes/prism-tomorrow.css";
import Editor from "react-simple-code-editor";
import prism from "prismjs";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import axios from "axios";
import "./App.css";

const sampleSnippets = [
  {
    id: "async-fetch",
    label: "Async Fetch",
    code: `async function fetchUser(userId) {
  const response = fetch("/api/users/" + userId);
  const data = response.json();
  return data.name.toUpperCase();
}`,
  },
  {
    id: "express-auth",
    label: "Express Auth",
    code: `app.post("/login", async (req, res) => {
  const user = await db.users.findOne({ email: req.body.email });

  if (user.password === req.body.password) {
    res.send({ token: createToken(user) });
  } else {
    res.status(401).send("Invalid credentials");
  }
});`,
  },
  {
    id: "react-effect",
    label: "React Effect",
    code: `function Profile({ userId }) {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    fetch("/api/profile/" + userId)
      .then((res) => res.json())
      .then(setProfile);
  }, []);

  return <div>{profile.name}</div>;
}`,
  },
];

function getInitialTheme() {
  if (typeof window === "undefined") {
    return "light";
  }

  const savedTheme = window.localStorage.getItem("code-reviewer-theme");
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function App() {
  const [code, setCode] = useState(`function sum() {
  return 1 + 1;
}`);
  const [review, setReview] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState([]);
  const [copiedTarget, setCopiedTarget] = useState("");
  const reviewCacheRef = useRef(new Map());
  const lastSubmittedCodeRef = useRef("");
  const cooldownUntilRef = useRef(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [theme, setTheme] = useState(getInitialTheme);

  function normalizeCode(value) {
    return value.trim().replace(/\r\n/g, "\n");
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      const remainingMs = cooldownUntilRef.current - Date.now();
      setCooldownRemaining(remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0);
    }, 250);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!copiedTarget) {
      return undefined;
    }

    const timer = window.setTimeout(() => setCopiedTarget(""), 1800);
    return () => window.clearTimeout(timer);
  }, [copiedTarget]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("code-reviewer-theme", theme);
  }, [theme]);

  const normalizedCode = useMemo(() => normalizeCode(code), [code]);
  const codeLines = useMemo(
    () => (normalizedCode ? normalizedCode.split("\n").length : 0),
    [normalizedCode],
  );
  const codeChars = normalizedCode.length;
  const codeStatus =
    codeChars === 0
      ? "Empty"
      : codeChars > 12000
        ? "Too large"
        : codeChars > 9000
          ? "Near limit"
          : "Ready";

  function pushHistoryEntry(nextCode, nextReview) {
    setHistory((current) => {
      const entry = {
        id: `${Date.now()}-${current.length}`,
        title: nextCode.split("\n")[0].slice(0, 42) || "Untitled snippet",
        code: nextCode,
        review: nextReview,
        createdAt: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      return [entry, ...current].slice(0, 6);
    });
  }

  async function copyText(value, target) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedTarget(target);
      setNotice(target === "review" ? "Review copied to clipboard." : "Code copied to clipboard.");
    } catch {
      setError("Clipboard access failed.");
    }
  }

  function downloadReview() {
    if (!review) {
      setError("Generate a review before downloading it.");
      return;
    }

    const blob = new Blob([review], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "code-review.md";
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Review downloaded as markdown.");
  }

  function loadSample(sample) {
    setCode(sample.code);
    setReview("");
    setError("");
    setNotice(`Loaded sample: ${sample.label}.`);
  }

  function clearWorkspace() {
    setCode("");
    setReview("");
    setError("");
    setNotice("Workspace cleared.");
  }

  function restoreHistoryItem(item) {
    setCode(item.code);
    setReview(item.review);
    setError("");
    setNotice(`Loaded review from ${item.createdAt}.`);
  }

  function toggleTheme() {
    setTheme((currentTheme) => (currentTheme === "light" ? "dark" : "light"));
  }

  async function reviewCode() {
    if (!normalizedCode) {
      setError("Code is required");
      return;
    }

    const now = Date.now();
    if (cooldownUntilRef.current > now) {
      const retryAfter = Math.max(
        1,
        Math.ceil((cooldownUntilRef.current - now) / 1000),
      );
      setError(`Please wait ${retryAfter} seconds before sending another review.`);
      return;
    }

    if (reviewCacheRef.current.has(normalizedCode)) {
      const cachedReview = reviewCacheRef.current.get(normalizedCode);
      setReview(cachedReview);
      setError("");
      setNotice("Showing the saved review for this same code.");
      return;
    }

    if (lastSubmittedCodeRef.current === normalizedCode) {
      setNotice("This exact code is already being reviewed.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setNotice("");
      lastSubmittedCodeRef.current = normalizedCode;

      const response = await axios.post("http://localhost:3000/ai/get-review", {
        code: normalizedCode,
      });

      reviewCacheRef.current.set(normalizedCode, response.data);
      setReview(response.data);
      pushHistoryEntry(normalizedCode, response.data);
      setNotice("Review generated successfully.");
    } catch (err) {
      const retryAfterHeader = Number.parseInt(
        err?.response?.headers?.["retry-after"] || "0",
        10,
      );

      if (retryAfterHeader > 0) {
        cooldownUntilRef.current = Date.now() + retryAfterHeader * 1000;
      }

      setError(err?.response?.data || "Failed to generate review");
    } finally {
      lastSubmittedCodeRef.current = "";
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">AI Code Reviewer</p>
          <h1>Review code with fewer wasted requests and a cleaner workflow.</h1>
          <p className="hero-copy">
            Paste a snippet, run a review, save the best responses locally, and
            jump back to previous results without spending extra quota.
          </p>
        </div>
        <div className="hero-tools">
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
            <strong>{theme === "light" ? "Moon" : "Sun"}</strong>
          </button>
          <div className="hero-metrics">
          <div className="metric-card">
            <span>Lines</span>
            <strong>{codeLines}</strong>
          </div>
          <div className="metric-card">
            <span>Characters</span>
            <strong>{codeChars}</strong>
          </div>
          <div className={`metric-card status-card status-${codeStatus.toLowerCase().replace(" ", "-")}`}>
            <span>Status</span>
            <strong>{codeStatus}</strong>
          </div>
        </div>
        </div>
      </section>

      <section className="workspace">
        <div className="panel editor-panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">Editor</p>
              <h2>Snippet Playground</h2>
            </div>
            <div className="panel-actions">
              <button type="button" onClick={() => copyText(normalizedCode, "code")}>
                {copiedTarget === "code" ? "Copied" : "Copy code"}
              </button>
              <button type="button" onClick={clearWorkspace}>
                Clear
              </button>
            </div>
          </div>

          <div className="sample-row">
            {sampleSnippets.map((sample) => (
              <button
                key={sample.id}
                type="button"
                className="sample-chip"
                onClick={() => loadSample(sample)}
              >
                {sample.label}
              </button>
            ))}
          </div>

          <div className="editor-frame">
            <Editor
              value={code}
              onValueChange={setCode}
              highlight={(value) =>
                prism.highlight(value, prism.languages.javascript, "javascript")
              }
              padding={18}
              style={{
                fontFamily: '"Fira Code", "Fira Mono", monospace',
                fontSize: 15,
                minHeight: "100%",
              }}
            />
          </div>

          <div className="footer-bar">
            <div className="footer-notes">
              <span>{codeLines} lines</span>
              <span>{codeChars} chars</span>
              {cooldownRemaining > 0 ? (
                <span className="cooldown-pill">Cooldown: {cooldownRemaining}s</span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={reviewCode}
              className="primary-action"
              disabled={loading || codeStatus === "Too large"}
            >
              {loading ? "Reviewing..." : "Generate Review"}
            </button>
          </div>
        </div>

        <div className="panel review-panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">Results</p>
              <h2>Review Output</h2>
            </div>
            <div className="panel-actions">
              <button type="button" onClick={() => copyText(review, "review")} disabled={!review}>
                {copiedTarget === "review" ? "Copied" : "Copy review"}
              </button>
              <button type="button" onClick={downloadReview} disabled={!review}>
                Download
              </button>
            </div>
          </div>

          {error ? <p className="message error">{error}</p> : null}
          {notice ? <p className="message notice">{notice}</p> : null}

          {review ? (
            <div className="markdown-shell">
              <Markdown rehypePlugins={[rehypeHighlight]}>{review}</Markdown>
            </div>
          ) : (
            <div className="empty-state">
              <p className="empty-kicker">No review yet</p>
              <h3>Run your first review from the editor.</h3>
              <p>
                Cached results and recent history will appear here so you can
                revisit feedback without sending the same request again.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="history-panel">
        <div className="history-header">
          <div>
            <p className="panel-label">Recent Reviews</p>
            <h2>Local History</h2>
          </div>
          <span>{history.length} saved</span>
        </div>

        {history.length ? (
          <div className="history-grid">
            {history.map((item) => (
              <button
                type="button"
                key={item.id}
                className="history-card"
                onClick={() => restoreHistoryItem(item)}
              >
                <strong>{item.title}</strong>
                <span>{item.createdAt}</span>
                <p>{item.review.slice(0, 140)}...</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="history-empty">
            Generate a few reviews and they will show up here for quick reloads.
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
