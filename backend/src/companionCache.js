import { createHash } from "crypto";
import db from "./database.js";

export function companionInputHash(book, mode) {
  const payload = JSON.stringify({
    mode,
    title: book.title,
    author: book.author,
    notes: book.notes ?? "",
    rating: book.rating ?? null,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export function getCompanionCache(bookId, mode) {
  return db
    .prepare(
      "SELECT input_hash, response, created_at FROM companion_cache WHERE book_id = ? AND mode = ?"
    )
    .get(bookId, mode);
}

export function saveCompanionCache(bookId, mode, inputHash, response) {
  db.prepare(
    `INSERT INTO companion_cache (book_id, mode, input_hash, response)
     VALUES (@book_id, @mode, @input_hash, @response)
     ON CONFLICT(book_id, mode) DO UPDATE SET
       input_hash = excluded.input_hash,
       response = excluded.response,
       created_at = datetime('now')`
  ).run({
    book_id: bookId,
    mode,
    input_hash: inputHash,
    response,
  });
}

export function deleteCompanionCacheForBook(bookId) {
  db.prepare("DELETE FROM companion_cache WHERE book_id = ?").run(bookId);
}
