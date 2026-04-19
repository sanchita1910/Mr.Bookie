/**
 * Maps an Open Library search.json `docs[]` entry to fields we use in the UI and DB.
 * @see https://openlibrary.org/dev/docs/api/search
 */
export function mapSearchDocToResult(doc, index) {
  const titleRaw = doc.title;
  const title = Array.isArray(titleRaw)
    ? String(titleRaw[0] ?? "").trim() || "Untitled"
    : String(titleRaw ?? "").trim() || "Untitled";

  const author =
    Array.isArray(doc.author_name) && doc.author_name.length > 0
      ? doc.author_name.join(", ")
      : "Unknown";

  let published_year = null;
  if (typeof doc.first_publish_year === "number") {
    published_year = doc.first_publish_year;
  } else if (typeof doc.publish_year === "number") {
    published_year = doc.publish_year;
  }

  let isbn = null;
  if (Array.isArray(doc.isbn) && doc.isbn.length > 0) {
    isbn = String(doc.isbn[0]);
  }

  let thumbnail = null;
  if (typeof doc.cover_i === "number") {
    thumbnail = `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`;
  }

  const openLibraryKey =
    typeof doc.key === "string" && doc.key.length > 0
      ? doc.key
      : `anon-${index}`;

  return {
    openLibraryKey,
    title,
    author,
    published_year,
    isbn,
    thumbnail,
  };
}
