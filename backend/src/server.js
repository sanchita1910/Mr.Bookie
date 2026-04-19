import "dotenv/config";
import cors from "cors";
import express from "express";
import booksRouter from "./routes/books.js";
import readingRouter from "./routes/reading.js";

const app = express();
const PORT = process.env.PORT ?? 3000;

const allowedOrigins = process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
  : null;

app.use(
  cors({
    origin: allowedOrigins?.length ? allowedOrigins : true,
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/books", booksRouter);
app.use("/api/reading", readingRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
