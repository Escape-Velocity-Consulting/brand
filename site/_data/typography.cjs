const tokens = require("../../tokens.json");

// Demonstrative samples that prove each font loads and is wired correctly.
module.exports = [
  {
    key: "headline",
    label: "Space Grotesk — Headlines",
    cssVar: "--font-headline",
    sample: "Der Aha! Moment — Space Grotesk",
    style: "font-weight: 700; font-size: 22px;",
    family: tokens.fonts.headline
  },
  {
    key: "ui",
    label: "Manrope — UI & Labels",
    cssVar: "--font-ui",
    sample: "TRANSFORMATION & AUTOMATION — Manrope",
    style: "font-weight: 600; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;",
    family: tokens.fonts.ui
  },
  {
    key: "body",
    label: "Inter — Body Copy",
    cssVar: "--font-body",
    sample: "Klarheit schaffen, Engpässe lösen, Wachstum zünden. — Inter",
    style: "font-weight: 400; font-size: 15px; line-height: 1.7; color: var(--color-body);",
    family: tokens.fonts.body
  },
  {
    key: "mono",
    label: "JetBrains Mono — Code & Tokens",
    cssVar: "--font-mono",
    sample: "--color-terracotta: #D4784A;",
    style: "font-weight: 400; font-size: 14px; color: var(--color-body);",
    family: tokens.fonts.mono
  }
];
