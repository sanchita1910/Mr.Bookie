# Mr.Bookie — personal library app

Full-stack app to track books, search **Open Library**, get **AI-assisted** suggestions and companion text, and run a **deterministic “what to read next”** scorer. The API is **Express + SQLite**; the UI is **Vite + React**.

---

## Architecture

```mermaid
flowchart TB
  subgraph browser [Browser]
    UI["Vite + React UI"]
  end

  subgraph express [Express API]
    B["Books routes: CRUD, OL search, mood, similar, companion"]
    R["Reading routes: next-read solver"]
    Mood["sentiment package (lexicon)"]
    Solver["readingNextSolver"]
    LLM["LLM modules + OpenAI client"]
  end

  subgraph data [(SQLite)]
    T1[(books)]
    T2[(companion_cache)]
  end

  subgraph external [External HTTP]
    OL["Open Library"]
    OAI["OpenAI optional"]
  end

  UI -->|"VITE_API_URL or dev proxy"| B
  UI --> R
  B --> T1
  B --> T2
  B --> OL
  B --> Mood
  R --> T1
  R --> Solver
  B --> LLM
  R --> LLM
  LLM --> OAI
```

- **Browser never holds** Open Library or OpenAI keys; only the server calls them.
- **SQLite** stores library rows and **companion** cache entries; optional **`OPENAI_API_KEY`** unlocks coach, similar blurbs, and Yap companion text.

### Original build plan (reference)

The greenfield spec **Book Finder Full-Stack** (Google Books + `client/` / `server/` + `saved_books`) is kept for history and comparison:

- **File in this repo:** [`docs/book_finder_full-stack_019fc4c4.plan.md`](docs/book_finder_full-stack_019fc4c4.plan.md)

**How this app differs from that plan**

| Plan (v1 spec)                          | Current Mr.Bookie                                                      |
| --------------------------------------- | ---------------------------------------------------------------------- |
| Google Books search + API key           | **Open Library** (no key for basic search)                             |
| `client/` + `server/`, TypeScript       | `frontend/` + `backend/`, **JavaScript**                               |
| `saved_books` keyed by Google volume id | **`books`** table with ratings, notes, OL work key, page cache         |
| `/api/saved`                            | **REST on `/api/books`** (full CRUD)                                   |
| —                                       | **Mood**, **what to read next**, **similar + AI**, **companion (Yap)** |

---

## Features

### Library (CRUD)

- Add, list, edit, and delete books in a **SQLite** database.
- Fields: **title**, **author**, **published year**, **ISBN** (unique), **rating (1–5)**, **notes**.
- Optional **Open Library work key** and cached **page count** when books are saved from search (used for length-aware recommendations).

### Open Library search

- Search **openlibrary.org** from the UI; results show cover (when available), title, author, year, ISBN.
- **Save to library** maps results into your database (including `open_library_key` when present).

### Mood (lexicon sentiment)

- **“Mood”** per row: server-side **AFINN-style** sentiment (`sentiment` package) on **notes + title/author**—no external API.
- Expandable panel with scores and word highlights.

### What to read next

- **Constraint solver** (no LLM required): combines **time budget** (presets or custom minutes), **mood goal** (match shelf / lighter / heavier / any), **star rating**, and **page length** (from Open Library median when cached).
- Transparent **reasoning** and **score breakdown** in the API response.
- Optional **OpenAI** narration of the pick (coach copy only; the solver chooses the book).

### Similar titles (hybrid)

- **Grounded in Open Library**: prefers **subject** from the work record when `open_library_key` exists; otherwise **author** search.
- Returns up to **five** real candidates.
- Optional **AI paragraph** (“why these”) via OpenAI, using **only** those candidates (reduces hallucinated titles).

### Reading companion (per book)

- **POST** `/api/books/:id/companion` with `mode`:
  - **`discussion`** — book-club-style questions from your entry.
  - **`readalikes`** — one sentence of directions (themes/authors to explore; avoids inventing fake titles).
  - **`if_you_liked`** — short “If you liked …” blurb.
- Responses are **cached in SQLite** keyed by **book id + mode + hash** of title, author, notes, and rating (safe for repeat clicks and cost).
- UI: **“Yap”** on each row; optional nudge after saving a new book.

### Production-ready wiring

- **CORS** on the API (`FRONTEND_ORIGIN` for comma-separated allowlist; permissive default if unset).
- Frontend **`VITE_API_URL`**: set to your deployed API origin in production; omit locally to use the Vite dev proxy (`/api` → `localhost:3000`).

---

## Tech stack

| Layer    | Technologies                                                         |
| -------- | -------------------------------------------------------------------- |
| API      | Node.js, Express, better-sqlite3, dotenv, cors, sentiment            |
| Data     | SQLite (`backend/data/books.db`), migrations for schema bumps        |
| LLM      | OpenAI Chat Completions (optional; `OPENAI_API_KEY`, `OPENAI_MODEL`) |
| Frontend | React 19, Vite 8                                                     |
| External | Open Library HTTP API (search + work JSON for pages/subjects)        |

---

## Project layout

```
docs/
  book_finder_full-stack_019fc4c4.plan.md   # original greenfield plan (archived)
backend/
  src/
    server.js           # Express app, CORS, routes
    database.js         # SQLite + migrations
    routes/books.js     # CRUD, search, sentiment, similar, companion
    routes/reading.js   # POST /api/reading/next
    openLibrary.js      # Map search hits
    openLibraryClient.js# Work pages, hybrid similar
    sentimentAnalysis.js
    readingNextSolver.js
    llmCoach.js         # OpenAI chat helper + coach/similar prompts
    readingCompanionLlm.js
    companionCache.js   # SHA-256 cache for companion text
  data/                 # books.db (gitignored)
frontend/
  src/App.jsx           # Main UI
  vite.config.js        # Dev proxy to API
```

---

## Local development

### Prerequisites

- Node.js 18+ (includes `fetch`)

### Backend

```bash
cd backend
cp .env.example .env   # optional: OPENAI_API_KEY, PORT, FRONTEND_ORIGIN
npm install
npm start                # http://localhost:3000
```

- Health check: `GET /health`
- API base: `/api/books`, `/api/reading`

### Frontend

```bash
cd frontend
npm install
npm run dev              # Vite dev server, proxies /api → localhost:3000
```

### Environment (backend)

See `backend/.env.example`. Common variables:

- **`OPENAI_API_KEY`** / **`OPENAI_MODEL`** — LLM features (coach, similar paragraph, companion).
- **`FRONTEND_ORIGIN`** — production site URL(s) for CORS.
- **`PORT`** — listen port (default 3000).

### Environment (frontend, production build)

- **`VITE_API_URL`** — full origin of the API (no trailing slash), e.g. `https://your-api.example.com`. Leave unset during local `npm run dev`.

---

## API overview (short)

| Method | Path                              | Purpose                                                           |
| ------ | --------------------------------- | ----------------------------------------------------------------- |
| GET    | `/health`                         | Liveness                                                          |
| GET    | `/api/books`                      | List books                                                        |
| POST   | `/api/books`                      | Create book                                                       |
| GET    | `/api/books/:id`                  | Get one                                                           |
| PUT    | `/api/books/:id`                  | Update                                                            |
| DELETE | `/api/books/:id`                  | Delete (+ companion cache rows)                                   |
| GET    | `/api/books/search?q=`            | Open Library search                                               |
| GET    | `/api/books/:id/sentiment`        | Lexicon mood                                                      |
| GET    | `/api/books/:id/similar`          | Hybrid similar titles                                             |
| POST   | `/api/books/:id/similar/insights` | AI paragraph for similar list                                     |
| POST   | `/api/books/:id/companion`        | Body `{ "mode": "discussion" \| "readalikes" \| "if_you_liked" }` |
| POST   | `/api/reading/next`               | Body: time preset, mood preference, optional `customMinutes`      |

---

## Deployment notes

- **Vercel** (or similar) is a good fit for the **static/Vite** frontend. Point **`VITE_API_URL`** at your real API.
- The **Express + SQLite** API is better hosted on a **long-running Node** service (Render, Railway, Fly.io, etc.) with a **persistent disk** if you rely on SQLite in production.
- Ensure **`FRONTEND_ORIGIN`** matches your deployed frontend URL to avoid CORS issues.

---

## License

Private / personal project unless you add a license file.
