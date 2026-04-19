import { Router } from "express";
import db from "../database.js";
import { fetchWorkPageCount } from "../openLibraryClient.js";
import { narrateReadingPick, isLlmConfigured } from "../llmCoach.js";
import { solveWhatToReadNext } from "../readingNextSolver.js";

const router = Router();

router.post("/next", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    let books = db.prepare("SELECT * FROM books ORDER BY id").all();

    for (const b of books) {
      if (
        b.open_library_key &&
        (b.page_count == null || b.page_count === "")
      ) {
        try {
          const pc = await fetchWorkPageCount(b.open_library_key);
          if (pc != null) {
            db.prepare("UPDATE books SET page_count = ? WHERE id = ?").run(
              pc,
              b.id
            );
            b.page_count = pc;
          }
        } catch {
          /* ignore OL failures for individual works */
        }
      }
    }

    const result = solveWhatToReadNext(books, body);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    let narration = null;
    let llmError = null;
    if (isLlmConfigured()) {
      try {
        narration = await narrateReadingPick({
          pick: {
            title: result.pick.title,
            author: result.pick.author,
            rating: result.pick.rating,
            notes: result.pick.notes
              ? String(result.pick.notes).slice(0, 500)
              : null,
            page_count: result.pick.page_count,
          },
          breakdown: result.breakdown,
          pickMeta: result.pickMeta,
          runnersUp: result.runnersUp.map((r) => ({
            title: r.book.title,
            author: r.book.author,
            scores: r.scores,
          })),
          targetPages: result.targetPages,
          moodPreference: result.moodPreference,
          shelfMoodBaseline: result.shelfMoodBaseline,
          reasoning: result.reasoning,
        });
      } catch (e) {
        llmError = e.message ?? String(e);
      }
    }

    res.json({
      ...result,
      narration,
      llmError,
      llmConfigured: isLlmConfigured(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
