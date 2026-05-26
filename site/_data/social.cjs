// Filesystem discovery of social templates from templates/social/*.html.
// Per-slug metadata (title/size/cmd) lives in SOCIAL_META — copy that isn't derivable
// stays colocated. Raster filename is tolerant of "-sample" suffix to handle the
// current naming inconsistency (e.g. linkedin-banner.png vs quote-card-sample.png).

const fs = require("node:fs");
const path = require("node:path");

const TEMPLATES_DIR = path.resolve(__dirname, "..", "..", "templates", "social");
const RASTER_DIR    = path.resolve(__dirname, "..", "..", "assets", "raster");

const SOCIAL_META = {
  "linkedin-banner": {
    title: "LinkedIn Banner",
    size:  "1584×396",
    cmd:   "npx tsx generators/image.ts --input templates/social/linkedin-banner.html --type html --preset linkedin-banner -o linkedin-banner.png",
  },
  "quote-card": {
    title: "Quote Card",
    size:  "1200×1200",
    cmd:   'npm run image -- --input templates/social/quote-card.html --type html --preset linkedin-post --var "QUOTE=Your text" --var "AUTHOR=Name" -o quote.png',
  },
  "stats-card": {
    title: "Stats Card",
    size:  "1200×1200",
    cmd:   'npm run image -- --input templates/social/stats-card.html --type html --preset linkedin-post --var "STAT=17+" --var "UNIT=Jahre" --var "LABEL=Description" -o stats.png',
  },
  "linkedin-post-portrait": {
    title: "LinkedIn Post (Portrait)",
    size:  "1080×1350",
    cmd:   'npm run image -- --input templates/social/linkedin-post-portrait.html --type html --width 1080 --height 1350 --var "EYEBROW=PROZESS-REVIEW" --var "HEADLINE=Headline goes here" --var "BODY=Optional supporting body copy." -o linkedin-post.png',
  },
  "announcement": {
    title: "Announcement",
    size:  "1200×630",
    cmd:   'npm run image -- --input templates/social/announcement.html --type html --preset og --var "HEADLINE=Title" --var "EYEBROW=LABEL" -o announce.png',
  },
  "og": {
    title: "OG Image",
    size:  "1200×630",
    cmd:   'npm run image -- --input templates/social/og.html --type html --preset og --var "TITLE=Page Title" -o og.png',
  },
  "twitter-banner": {
    title: "Twitter/X Banner",
    size:  "1500×500",
    cmd:   "npm run image -- --input templates/social/twitter-banner.html --type html --preset twitter-banner -o twitter-banner.png",
  },
  "youtube-banner": {
    title: "YouTube Banner",
    size:  "2560×1440",
    cmd:   "npm run image -- --input templates/social/youtube-banner.html --type html --preset youtube-banner -o youtube-banner.png",
  },
};

function findRaster(slug) {
  // Try {slug}.png first, then {slug}-sample.png (current naming inconsistency).
  if (!fs.existsSync(RASTER_DIR)) return null;
  const candidates = [`${slug}.png`, `${slug}-sample.png`];
  for (const name of candidates) {
    if (fs.existsSync(path.join(RASTER_DIR, name))) {
      return { url: `/assets/raster/${name}`, basename: name.replace(/\.png$/, "") };
    }
  }
  return null;
}

function listSocial() {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];

  const slugs = fs.readdirSync(TEMPLATES_DIR)
    .filter((f) => f.endsWith(".html"))
    .map((f) => f.replace(/\.html$/, ""));

  const items = [];
  for (const slug of slugs) {
    const meta = SOCIAL_META[slug] ?? { title: slug, size: "", cmd: "" };
    const raster = findRaster(slug);

    items.push({
      slug,
      title: meta.title,
      size: meta.size,
      cmd: meta.cmd,
      rasterUrl: raster ? raster.url : null,
      templateUrl: `https://github.com/Escape-Velocity-Consulting/brand/blob/main/templates/social/${slug}.html`,
    });
  }

  // Stable order: meta order first, then alphabetical for unknowns.
  const metaOrder = Object.keys(SOCIAL_META);
  items.sort((a, b) => {
    const ai = metaOrder.indexOf(a.slug);
    const bi = metaOrder.indexOf(b.slug);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.slug.localeCompare(b.slug);
  });

  return items;
}

module.exports = listSocial();
