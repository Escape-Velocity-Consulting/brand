// Filesystem discovery of slide decks under brand/previews/decks/*/.
// For each subdirectory containing an index.html, returns metadata for /brand/decks/.
// Title is parsed from the viewer <title> tag; falls back to slug if absent.
// Sorts newest first by directory mtime.

const fs = require("node:fs");
const path = require("node:path");

const DECKS_DIR = path.resolve(__dirname, "..", "..", "previews", "decks");

function parseTitle(html, fallback) {
  const m = html.match(/<title>([^<]+)<\/title>/);
  if (!m) return fallback;
  // The viewer title can include " — Escape Velocity" suffix from base.njk;
  // we set it from the deck's <title> directly so just trust it.
  return m[1].trim();
}

function listDecks() {
  if (!fs.existsSync(DECKS_DIR)) return [];

  const entries = fs.readdirSync(DECKS_DIR, { withFileTypes: true });
  const decks = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const deckDir = path.join(DECKS_DIR, slug);
    const indexHtmlPath = path.join(deckDir, "index.html");
    if (!fs.existsSync(indexHtmlPath)) continue;

    // Parse title
    let title = slug;
    try {
      const html = fs.readFileSync(indexHtmlPath, "utf8");
      title = parseTitle(html, slug);
    } catch (err) {
      console.warn(`[decks.cjs] could not read ${indexHtmlPath}: ${err.message}`);
    }

    // Slide count + thumbnails
    const slidesDir = path.join(deckDir, "slides");
    let slidesCount = 0;
    let slideThumbs = [];
    if (fs.existsSync(slidesDir)) {
      const pngs = fs.readdirSync(slidesDir)
        .filter((f) => /^slide-\d+\.png$/.test(f))
        .sort();
      slidesCount = pngs.length;
      slideThumbs = pngs.slice(0, 4).map((f) => `/previews/decks/${slug}/slides/${f}`);
    }

    // PDF detection — any .pdf in the deck folder (generator names it after the stem)
    let pdfUrl = null;
    const files = fs.readdirSync(deckDir);
    const pdf = files.find((f) => f.toLowerCase().endsWith(".pdf"));
    if (pdf) pdfUrl = `/previews/decks/${slug}/${pdf}`;

    const mtime = fs.statSync(deckDir).mtimeMs;

    decks.push({
      slug,
      title,
      slidesCount,
      slideThumbs,
      thumbnail: slideThumbs[0] || null,
      viewerUrl: `/previews/decks/${slug}/`,
      pdfUrl,
      mtime,
    });
  }

  // Newest first
  decks.sort((a, b) => b.mtime - a.mtime);
  return decks;
}

module.exports = listDecks();
