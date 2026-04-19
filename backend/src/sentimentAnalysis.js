import Sentiment from "sentiment";

const analyzer = new Sentiment();

/**
 * Builds text for analysis: notes carry the most signal; title/author add context.
 */
export function corpusFromBook(book) {
  const chunks = [];
  if (book.notes && String(book.notes).trim()) {
    chunks.push(String(book.notes).trim());
  }
  chunks.push(`${book.title}. ${book.author}.`);
  return chunks.join("\n\n");
}

/**
 * Lexicon-based sentiment (AFINN-style). Good for short notes; no external API.
 */
export function analyzeBookCorpus(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;

  const result = analyzer.analyze(trimmed);
  const comp = result.comparative;

  let label;
  let emoji;
  let headline;
  if (comp > 0.05) {
    label = "positive";
    emoji = "✨";
    headline = "Mostly positive";
  } else if (comp < -0.05) {
    label = "negative";
    emoji = "🌧️";
    headline = "Mostly critical or heavy";
  } else {
    label = "neutral";
    emoji = "⚖️";
    headline = "Balanced or neutral";
  }

  const pos = Array.isArray(result.positive) ? result.positive.slice(0, 8) : [];
  const neg = Array.isArray(result.negative) ? result.negative.slice(0, 8) : [];

  return {
    label,
    emoji,
    headline,
    blurb: `Lexicon sentiment on your notes and title. Comparative ${comp.toFixed(2)} (roughly −1 harsh to +1 warm).`,
    comparative: Math.round(comp * 1000) / 1000,
    rawScore: result.score,
    positiveWords: pos,
    negativeWords: neg,
  };
}
