// Filesystem discovery of document templates from previews/*-preview.png + sample.pdf pairs.
// Per-slug metadata (title/blurb/cmd) lives in DOCS_META — copy that isn't derivable
// from the filesystem stays colocated here, so adding a new doc type is one render +
// one metadata entry. Slugs without a meta entry render with slug-as-title.

const fs = require("node:fs");
const path = require("node:path");

const PREVIEWS_DIR = path.resolve(__dirname, "..", "..", "previews");

const DOCS_META = {
  letter: {
    title: "Letter — Correspondence",
    blurb: "Business correspondence, briefings, status updates. Optional meta strip (recipient, date, reference).",
    cmd: 'npx tsx generators/pdf.ts content.md --type letter --to "Muster GmbH" --ref "EV-2026-001" -o letter.pdf',
  },
  offer: {
    title: "Offer — Service Proposals",
    blurb: "Structured service offers with scope, timeline, and pricing table.",
    cmd: 'npx tsx generators/pdf.ts proposal.md --type offer --to "Muster GmbH" --ref "EV-2026-042" -o offer.pdf',
  },
  invoice: {
    title: "Invoice — Client Billing",
    blurb: "Client invoices with line items, totals, and payment terms. Required meta strip.",
    cmd: 'npx tsx generators/pdf.ts items.md --type invoice --to "Muster GmbH" --ref "RE-2026-001" -o invoice.pdf',
  },
  tos: {
    title: "Terms of Service — Legal",
    blurb: "Contracts, AGBs, legal documents. No meta strip — clean document layout.",
    cmd: "npx tsx generators/pdf.ts terms.md --type tos -o agb.pdf",
  },
  report: {
    title: "Report — Long-form",
    blurb: "Multi-section reports with cover, TOC, and structured body.",
    cmd: "npx tsx generators/pdf.ts report.md --type report -o report.pdf",
  },
};

function listDocuments() {
  if (!fs.existsSync(PREVIEWS_DIR)) return [];

  const files = fs.readdirSync(PREVIEWS_DIR);
  const previewSuffix = "-preview.png";

  const docs = [];
  for (const file of files) {
    if (!file.endsWith(previewSuffix)) continue;
    const slug = file.slice(0, -previewSuffix.length);

    const pdfFile = `${slug}-sample.pdf`;
    const pdfExists = files.includes(pdfFile);

    const meta = DOCS_META[slug] ?? { title: slug, blurb: "", cmd: "" };

    docs.push({
      slug,
      title: meta.title,
      blurb: meta.blurb,
      cmd: meta.cmd,
      previewUrl: `/previews/${slug}${previewSuffix}`,
      pdfUrl: pdfExists ? `/previews/${pdfFile}` : null,
    });
  }

  // Stable order: prefer meta order, then alphabetical for unknown slugs.
  const metaOrder = Object.keys(DOCS_META);
  docs.sort((a, b) => {
    const ai = metaOrder.indexOf(a.slug);
    const bi = metaOrder.indexOf(b.slug);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.slug.localeCompare(b.slug);
  });

  return docs;
}

module.exports = listDocuments();
