import { analyzeBookCorpus, corpusFromBook } from "./sentimentAnalysis.js";

/** ~40 pages per hour leisure reading; time → rough page budget */
const PAGES_PER_HOUR = 40;

export const TIME_PRESETS = {
  "1-evening": { label: "1 evening (~2h)", hours: 2 },
  "2-evenings": { label: "2 evenings (~4h)", hours: 4 },
  weekend: { label: "Weekend (~8h)", hours: 8 },
  custom: { label: "Custom (minutes)", hours: null },
};

function targetPagesFromPreset(timePreset, customMinutes) {
  if (timePreset === "custom") {
    const m = Number(customMinutes);
    if (!Number.isFinite(m) || m < 15 || m > 24 * 60) {
      return { error: "customMinutes must be between 15 and 1440" };
    }
    return Math.max(20, Math.round((m / 60) * PAGES_PER_HOUR));
  }
  const preset = TIME_PRESETS[timePreset];
  if (!preset || preset.hours == null) {
    return { error: "Invalid timePreset" };
  }
  return Math.max(20, Math.round(preset.hours * PAGES_PER_HOUR));
}

function moodComparative(book) {
  const text = corpusFromBook(book);
  const a = analyzeBookCorpus(text);
  return a ? a.comparative : 0;
}

function shelfBaselineMood(books) {
  const comps = [];
  for (const b of books) {
    if (b.notes && String(b.notes).trim()) {
      comps.push(moodComparative(b));
    }
  }
  if (comps.length === 0) return 0;
  return comps.reduce((s, x) => s + x, 0) / comps.length;
}

function moodFit(bookComp, preference, shelfAvg) {
  if (preference === "any") return 1;

  let target = shelfAvg;
  if (preference === "lighter") target = Math.min(1, shelfAvg + 0.15);
  if (preference === "heavier") target = Math.max(-1, shelfAvg - 0.15);
  if (preference === "match-shelf") target = shelfAvg;

  const dist = Math.abs(bookComp - target);
  return Math.max(0, 1 - dist / 1.5);
}

function pageFit(pages, targetPages) {
  if (pages == null || !Number.isFinite(pages) || pages <= 0) {
    return 0.5;
  }
  const ratio = Math.abs(pages - targetPages) / Math.max(targetPages, pages, 1);
  return Math.max(0, 1 - Math.min(1, ratio));
}

function ratingFit(rating) {
  if (rating == null || !Number.isFinite(rating)) return 0.55;
  return Math.max(0, Math.min(1, rating / 5));
}

/**
 * Constraint solver: time budget + mood preference + star rating + page length proxy.
 * Returns transparent scores; LLM only narrates later.
 */
export function solveWhatToReadNext(books, options) {
  const {
    timePreset = "2-evenings",
    customMinutes,
    moodPreference = "match-shelf",
  } = options ?? {};

  const targetPages = targetPagesFromPreset(timePreset, customMinutes);
  if (typeof targetPages === "object" && targetPages.error) {
    return { error: targetPages.error };
  }
  if (!Array.isArray(books) || books.length === 0) {
    return { error: "Add at least one book to your library first." };
  }

  const shelfAvg = shelfBaselineMood(books);

  const scored = books.map((book) => {
    const bookMood = moodComparative(book);
    const pf = pageFit(book.page_count, targetPages);
    const mf = moodFit(bookMood, moodPreference, shelfAvg);
    const rf = ratingFit(book.rating);
    const total = 0.38 * pf + 0.32 * mf + 0.3 * rf;

    return {
      book,
      scores: {
        pageFit: Math.round(pf * 1000) / 1000,
        moodFit: Math.round(mf * 1000) / 1000,
        ratingFit: Math.round(rf * 1000) / 1000,
        total: Math.round(total * 1000) / 1000,
      },
      meta: {
        moodComparative: Math.round(bookMood * 1000) / 1000,
        pageCount: book.page_count ?? null,
      },
    };
  });

  scored.sort((a, b) => b.scores.total - a.scores.total);
  const winner = scored[0];
  const runnersUp = scored.slice(1, 4);

  const reasoning = [
    `Time budget ≈ ${targetPages} pages (${PAGES_PER_HOUR} pg/h assumed).`,
    `Shelf mood baseline from notes ≈ ${shelfAvg.toFixed(2)} (lexicon comparative).`,
    `Mood mode: ${moodPreference}.`,
    winner.meta.pageCount == null
      ? `“${winner.book.title}” has no page count yet—link it from Open Library or scores assume length.`
      : `“${winner.book.title}” is ~${winner.meta.pageCount} pages.`,
  ];

  return {
    timePreset,
    customMinutes: timePreset === "custom" ? customMinutes : null,
    targetPages,
    moodPreference,
    shelfMoodBaseline: Math.round(shelfAvg * 1000) / 1000,
    pick: winner.book,
    breakdown: winner.scores,
    pickMeta: winner.meta,
    runnersUp: runnersUp.map((r) => ({
      book: r.book,
      scores: r.scores,
      meta: r.meta,
    })),
    reasoning,
  };
}
