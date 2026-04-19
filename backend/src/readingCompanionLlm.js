import { chatWithOpenAI } from "./llmCoach.js";

const MODES = ["discussion", "readalikes", "if_you_liked"];

function bookPayload(book) {
  return {
    title: book.title,
    author: book.author,
    rating: book.rating ?? null,
    notes: book.notes ? String(book.notes).slice(0, 4000) : null,
    published_year: book.published_year ?? null,
  };
}

export function isCompanionMode(mode) {
  return MODES.includes(mode);
}

export async function generateReadingCompanion(book, mode) {
  const ctx = bookPayload(book);

  if (mode === "discussion") {
    return chatWithOpenAI(
      `You run a friendly book club. Given the reader's library entry (title, author, optional rating and notes), output 6–8 numbered discussion questions. Mix plot, theme, character, and personal reflection. If notes are empty, still use title and author to infer likely themes—stay humble and avoid claiming facts not in the notes. No preamble—start at "1."`,
      ctx,
      { maxTokens: 700, temperature: 0.7 }
    );
  }

  if (mode === "readalikes") {
    return chatWithOpenAI(
      `The reader wants ONE sentence of read-alike directions (not a bullet list). Mention kinds of books, moods, or authors to explore next—avoid inventing specific book titles or ISBNs. Use title, author, rating, and notes.`,
      ctx,
      { maxTokens: 200, temperature: 0.65 }
    );
  }

  if (mode === "if_you_liked") {
    return chatWithOpenAI(
      `Write 2–4 sentences in the voice of a bookseller: start with "If you liked [title] by [author]…" and suggest what to read or pay attention to next, grounded in their notes and rating when present. Warm, specific, no fake citations.`,
      ctx,
      { maxTokens: 350, temperature: 0.7 }
    );
  }

  return null;
}
