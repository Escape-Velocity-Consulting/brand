// Brand Site palette data — sourced from brand/tokens.json (generated from tokens.ts).
// Editing tokens.ts → npm run build:tokens → palette updates here automatically.
const tokens = require("../../tokens.json");

const labels = {
  cream:           { name: "Warm Cream",      role: "Default page/document background" },
  black:           { name: "Warm Black",      role: "Dark sections: nav, hero, footer" },
  terracotta:      { name: "Terracotta",      role: "Primary accent: CTAs, borders, tags" },
  terracottaHover: { name: "Terracotta Dark", role: "Hover state for terracotta" },
  accent:          { name: "Light Accent",    role: "Inline accent on dark backgrounds" },
  light:           { name: "Warm Light",      role: "Primary text on dark backgrounds" },
  muted:           { name: "Muted",           role: "Secondary text on dark backgrounds" },
  subtle:          { name: "Subtle",          role: "Tertiary text: descriptions, labels" },
  body:            { name: "Body Text",       role: "Default body copy on light backgrounds" },
  text:            { name: "Near Black",      role: "Headings, strong text on light backgrounds" }
};

// Curated subset shown on the Overview page as a quick snapshot.
const snapshotKeys = ["cream", "black", "terracotta", "accent", "light"];

const secondaryLabels = {
  blue:  { name: "Kommt (Blue)",  role: "Tag: upcoming (kommt)" },
  green: { name: "Tun (Green)",   role: "Tag: action (tun)" }
};

function kebab(key) {
  return key.replace(/([A-Z])/g, "-$1").toLowerCase();
}

const primary = Object.entries(tokens.colors).map(([key, hex]) => ({
  key,
  hex,
  varName: `--color-${kebab(key)}`,
  ...labels[key]
}));

const snapshot = snapshotKeys
  .map(k => primary.find(c => c.key === k))
  .filter(Boolean);

const secondary = Object.entries(tokens.secondaryColors).map(([key, hex]) => ({
  key,
  hex,
  varName: `--color-${key}`,
  ...secondaryLabels[key]
}));

module.exports = { primary, secondary, snapshot };
