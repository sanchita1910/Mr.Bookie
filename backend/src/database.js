import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "books.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    published_year INTEGER,
    isbn TEXT UNIQUE,
    rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
    notes TEXT,
    open_library_key TEXT,
    page_count INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const columnNames = db.prepare("PRAGMA table_info(books)").all().map((c) => c.name);
if (!columnNames.includes("rating")) {
  db.exec("ALTER TABLE books ADD COLUMN rating INTEGER");
}
if (!columnNames.includes("notes")) {
  db.exec("ALTER TABLE books ADD COLUMN notes TEXT");
}
if (!columnNames.includes("open_library_key")) {
  db.exec("ALTER TABLE books ADD COLUMN open_library_key TEXT");
}
if (!columnNames.includes("page_count")) {
  db.exec("ALTER TABLE books ADD COLUMN page_count INTEGER");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS companion_cache (
    book_id INTEGER NOT NULL,
    mode TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    response TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (book_id, mode)
  );
`);

export default db;
