// Read brand/press/boilerplate.md and expose it as rendered HTML for press.njk.
// Source of truth is the markdown file — never duplicate the copy here.
const fs = require("node:fs");
const path = require("node:path");
const MarkdownIt = require("markdown-it");

const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
const filePath = path.resolve(__dirname, "..", "..", "press", "boilerplate.md");

let html = "";
try {
  const raw = fs.readFileSync(filePath, "utf8");
  html = md.render(raw);
} catch (err) {
  html = `<p><em>press/boilerplate.md not found (${err.message}). Create it before publishing.</em></p>`;
}

module.exports = {
  html,
  photos: [
    { file: "tommi-portrait.jpg", alt: "Tommi Enenkel — portrait" },
    { file: "tommi-vortrag.jpg",  alt: "Tommi Enenkel — speaking on stage" },
  ],
};
