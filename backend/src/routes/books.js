import { Router } from "express";
import db from "../database.js";
import { mapSearchDocToResult } from "../openLibrary.js";
import { getHybridSimilarCandidates } from "../openLibraryClient.js";
import { analyzeBookCorpus, corpusFromBook } from "../sentimentAnalysis.js";
import { isLlmConfigured, narrateSimilarHybrid } from "../llmCoach.js";
import {
  companionInputHash,
  deleteCompanionCacheForBook,
  getCompanionCache,
  saveCompanionCache,
} from "../companionCache.js";
import {
  generateReadingCompanion,
  isCompanionMode,
} from "../readingCompanionLlm.js";

const router = Router();

function parseRating(input) {
  if (input === undefined || input === null || input === "") return { ok: true, value: null };
  const n = Number(input);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    return { ok: false, error: "rating must be an integer from 1 to 5, or omitted" };
  }
  return { ok: true, value: n };
}

function parseNotes(input) {
  if (input === undefined || input === null) return null;
  const s = String(input).trim();
  return s.length ? s : null;
}

function parseOpenLibraryKey(input) {
  if (input === undefined || input === null || input === "") return null;
  const s = String(input).trim();
  if (!s.startsWith("/works/")) return null;
  return s;
}

function parsePageCount(input) {
  if (input === undefined || input === null || input === "") return null;
  const n = Number(input);
  if (!Number.isInteger(n) || n < 1 || n > 20000) return null;
  return n;
}

router.get("/", (_req, res) => {
  const books = db.prepare("SELECT * FROM books ORDER BY id").all();
  res.json(books);
});

router.get("/search", async (req, res, next) => {
  const q = req.query.q;
  if (typeof q !== "string" || !q.trim()) {
    return res.status(400).json({ error: "Query parameter q is required" });
  }
  try {
    const url = new URL("https://openlibrary.org/search.json");
    url.searchParams.set("q", q.trim());
    url.searchParams.set("limit", "20");

    const olRes = await fetch(url);
    if (!olRes.ok) {
      const detail = await olRes.text();
      return res.status(502).json({
        error: "Open Library request failed",
        detail: detail.slice(0, 300),
      });
    }
    const data = await olRes.json();
    const docs = Array.isArray(data.docs) ? data.docs : [];
    const results = docs.map((doc, i) => mapSearchDocToResult(doc, i));
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/sentiment", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Invalid book id" });
  }
  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(id);
  if (!book) {
    return res.status(404).json({ error: "Book not found" });
  }
  const corpus = corpusFromBook(book);
  const analysis = analyzeBookCorpus(corpus);
  if (!analysis) {
    return res.status(400).json({ error: "Nothing to analyze" });
  }
  res.json({ bookId: id, ...analysis });
});

router.get("/:id/similar", async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Invalid book id" });
  }
  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(id);
  if (!book) {
    return res.status(404).json({ error: "Book not found" });
  }
  try {
    const { strategy, label, candidates } = await getHybridSimilarCandidates(book);
    res.json({
      bookId: id,
      strategy,
      label,
      candidates,
      llmConfigured: isLlmConfigured(),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/similar/insights", async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Invalid book id" });
  }
  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(id);
  if (!book) {
    return res.status(404).json({ error: "Book not found" });
  }
  if (!isLlmConfigured()) {
    return res.status(503).json({
      error: "LLM not configured. Set OPENAI_API_KEY in the backend environment.",
    });
  }
  try {
    const { strategy, label, candidates } = await getHybridSimilarCandidates(book);
    if (!candidates?.length) {
      return res.status(400).json({
        error: "No similar titles returned from Open Library for this book.",
      });
    }
    const narration = await narrateSimilarHybrid({
      userBook: {
        title: book.title,
        author: book.author,
        rating: book.rating,
        notes: book.notes ? String(book.notes).slice(0, 600) : null,
      },
      discovery: { strategy, label },
      candidates: candidates.map((c) => ({
        title: c.title,
        author: c.author,
        year: c.published_year,
        openLibraryKey: c.openLibraryKey,
      })),
    });
    res.json({
      bookId: id,
      strategy,
      label,
      candidates,
      narration,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/companion", async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Invalid book id" });
  }
  const mode = req.body?.mode;
  if (!isCompanionMode(mode)) {
    return res.status(400).json({
      error: "mode must be discussion, readalikes, or if_you_liked",
    });
  }
  if (!isLlmConfigured()) {
    return res.status(503).json({
      error: "LLM not configured. Set OPENAI_API_KEY on the backend.",
    });
  }

  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(id);
  if (!book) {
    return res.status(404).json({ error: "Book not found" });
  }

  const inputHash = companionInputHash(book, mode);
  const cached = getCompanionCache(id, mode);
  if (cached && cached.input_hash === inputHash) {
    return res.json({
      bookId: id,
      mode,
      text: cached.response,
      cached: true,
      inputHash,
      createdAt: cached.created_at,
    });
  }

  try {
    const text = await generateReadingCompanion(book, mode);
    if (!text) {
      return res.status(502).json({ error: "Empty response from language model" });
    }
    saveCompanionCache(id, mode, inputHash, text);
    const row = getCompanionCache(id, mode);
    res.json({
      bookId: id,
      mode,
      text,
      cached: false,
      inputHash,
      createdAt: row?.created_at ?? null,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", (req, res) => {
  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(
    Number(req.params.id)
  );
  if (!book) {
    return res.status(404).json({ error: "Book not found" });
  }
  res.json(book);
});

router.post("/", (req, res) => {
  const {
    title,
    author,
    published_year,
    isbn,
    rating,
    notes,
    open_library_key,
    page_count,
  } = req.body ?? {};
  if (!title || !author) {
    return res
      .status(400)
      .json({ error: "Fields title and author are required" });
  }
  const r = parseRating(rating);
  if (!r.ok) return res.status(400).json({ error: r.error });
  const olKey = parseOpenLibraryKey(open_library_key);
  const pc = parsePageCount(page_count);
  try {
    const stmt = db.prepare(
      `INSERT INTO books (title, author, published_year, isbn, rating, notes, open_library_key, page_count)
       VALUES (@title, @author, @published_year, @isbn, @rating, @notes, @open_library_key, @page_count)`
    );
    const info = stmt.run({
      title,
      author,
      published_year: published_year ?? null,
      isbn: isbn ?? null,
      rating: r.value,
      notes: parseNotes(notes),
      open_library_key: olKey,
      page_count: pc,
    });
    const book = db
      .prepare("SELECT * FROM books WHERE id = ?")
      .get(info.lastInsertRowid);
    res.status(201).json(book);
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "ISBN already exists" });
    }
    throw err;
  }
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM books WHERE id = ?").get(id);
  if (!existing) {
    return res.status(404).json({ error: "Book not found" });
  }
  const {
    title,
    author,
    published_year,
    isbn,
    rating,
    notes,
    open_library_key,
    page_count,
  } = req.body ?? {};
  if (
    title === undefined &&
    author === undefined &&
    published_year === undefined &&
    isbn === undefined &&
    rating === undefined &&
    notes === undefined &&
    open_library_key === undefined &&
    page_count === undefined
  ) {
    return res.status(400).json({ error: "Provide at least one field to update" });
  }
  try {
    let nextRating = existing.rating;
    if (rating !== undefined) {
      const pr = parseRating(rating);
      if (!pr.ok) return res.status(400).json({ error: pr.error });
      nextRating = pr.value;
    }

    const updated = {
      title: title ?? existing.title,
      author: author ?? existing.author,
      published_year:
        published_year !== undefined ? published_year : existing.published_year,
      isbn: isbn !== undefined ? isbn : existing.isbn,
      rating: nextRating,
      notes: notes !== undefined ? parseNotes(notes) : existing.notes,
      open_library_key:
        open_library_key !== undefined
          ? parseOpenLibraryKey(open_library_key)
          : existing.open_library_key,
      page_count:
        page_count !== undefined ? parsePageCount(page_count) : existing.page_count,
    };
    db.prepare(
      `UPDATE books SET title = @title, author = @author,
       published_year = @published_year, isbn = @isbn, rating = @rating, notes = @notes,
       open_library_key = @open_library_key, page_count = @page_count WHERE id = @id`
    ).run({ ...updated, id });
    const book = db.prepare("SELECT * FROM books WHERE id = ?").get(id);
    res.json(book);
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "ISBN already exists" });
    }
    throw err;
  }
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const exists = db.prepare("SELECT id FROM books WHERE id = ?").get(id);
  if (!exists) {
    return res.status(404).json({ error: "Book not found" });
  }
  deleteCompanionCacheForBook(id);
  db.prepare("DELETE FROM books WHERE id = ?").run(id);
  res.status(204).send();
});

export default router;
