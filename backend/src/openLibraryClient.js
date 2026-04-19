import { mapSearchDocToResult } from "./openLibrary.js";

const OL = "https://openlibrary.org";

export async function fetchWorkJson(workKey) {
  if (typeof workKey !== "string" || !workKey.startsWith("/works/")) {
    return null;
  }
  const r = await fetch(`${OL}${workKey}.json`);
  if (!r.ok) return null;
  return r.json();
}

/** Median pages for a work when Open Library has aggregated edition stats. */
export async function fetchWorkPageCount(workKey) {
  const w = await fetchWorkJson(workKey);
  if (!w) return null;
  if (typeof w.number_of_pages_median === "number") {
    return Math.round(w.number_of_pages_median);
  }
  if (typeof w.number_of_pages_max === "number") {
    return Math.round(w.number_of_pages_max);
  }
  return null;
}

export async function searchOpenLibraryDocs(q, limit = 12) {
  const url = new URL(`${OL}/search.json`);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));
  const r = await fetch(url);
  if (!r.ok) return [];
  const data = await r.json();
  return Array.isArray(data.docs) ? data.docs : [];
}

function normTitle(t) {
  return String(t ?? "")
    .trim()
    .toLowerCase();
}

/**
 * Hybrid similar titles: try subject from work record, else same author search.
 */
export async function getHybridSimilarCandidates(book) {
  const exclude = normTitle(book.title);
  const workSuffix = book.open_library_key?.replace(/^\/works\//, "") ?? "";

  if (book.open_library_key) {
    const w = await fetchWorkJson(book.open_library_key);
    const subjects = Array.isArray(w?.subjects) ? w.subjects : [];
    const subject = subjects
      .map((s) => String(s).trim())
      .find((s) => s.length > 2 && s.length < 100);

    if (subject) {
      const docs = await searchOpenLibraryDocs(`subject:"${subject.replace(/"/g, "")}"`, 16);
      const candidates = docs
        .map((doc, i) => mapSearchDocToResult(doc, i))
        .filter((x) => {
          if (normTitle(x.title) === exclude) return false;
          if (workSuffix && x.openLibraryKey?.includes(workSuffix)) return false;
          return true;
        });
      if (candidates.length >= 1) {
        return {
          strategy: "subject",
          label: subject,
          candidates: candidates.slice(0, 5),
        };
      }
    }
  }

  const firstAuthor = String(book.author).split(",")[0].trim().replace(/"/g, "");
  const docs = await searchOpenLibraryDocs(`author:"${firstAuthor}"`, 18);
  const candidates = docs
    .map((doc, i) => mapSearchDocToResult(doc, i))
    .filter((x) => normTitle(x.title) !== exclude);
  return {
    strategy: "author",
    label: firstAuthor,
    candidates: candidates.slice(0, 5),
  };
}
