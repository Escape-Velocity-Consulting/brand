import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execSync } from 'node:child_process'
import sharp from 'sharp'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')
const LOGOS_DIR = resolve(BRAND_DIR, 'assets', 'logos')
const RASTER_DIR = resolve(BRAND_DIR, 'assets', 'raster')
const PREVIEWS_DIR = resolve(BRAND_DIR, 'previews')

mkdirSync(RASTER_DIR, { recursive: true })
mkdirSync(PREVIEWS_DIR, { recursive: true })

// --- SVG → PNG exports ---
// Emit each logo at multiple sizes so the Brand Kit can ship a range.
// File pattern: <stem>-<size>.png (e.g. logo-dark-300.png, logo-dark-1024.png).

const LOGO_SVGS = [
  'ev-wordmark.svg',
  'ev-wordmark-light.svg',
  'ev-wordmark-transparent.svg',
  'logo-dark.svg',
  'logo-dark-square.svg',
  'logo-light.svg',
  'logo-light-square.svg',
  'logo-transparent.svg',
]
const LOGO_SIZES = [300, 512, 1024, 2048] as const

for (const svg of LOGO_SVGS) {
  const stem = svg.replace(/\.svg$/, '')
  const inputPath = resolve(LOGOS_DIR, svg)
  for (const width of LOGO_SIZES) {
    const output = `${stem}-${width}.png`
    const outputPath = resolve(RASTER_DIR, output)
    // density scales with target width so SVG rasterises crisp at large sizes
    await sharp(inputPath, { density: Math.max(72, Math.round(width / 4)) })
      .resize(width)
      .png()
      .toFile(outputPath)
    console.log(`Exported: ${output}`)
  }
}

// --- LinkedIn banner ---

const imageGen = resolve(BRAND_DIR, 'generators', 'image.ts')
const bannerTemplate = resolve(BRAND_DIR, 'templates', 'social', 'linkedin-banner.html')
const bannerOutput = resolve(RASTER_DIR, 'linkedin-banner.png')

execSync(
  `npx tsx "${imageGen}" --input "${bannerTemplate}" --type html --preset linkedin-banner -o "${bannerOutput}"`,
  { stdio: 'inherit', cwd: BRAND_DIR },
)
console.log('Exported: linkedin-banner.png')

// --- Social template samples ---

const socialSamples = [
  {
    template: 'templates/social/quote-card.html',
    preset: 'linkedin-post',
    output: 'quote-card-sample.png',
    vars: { QUOTE: 'Prozesse sind Infrastruktur. Wer sie nicht kennt, optimiert ins Blaue.', AUTHOR: 'Tommi Enenkel' },
  },
  {
    template: 'templates/social/stats-card.html',
    preset: 'linkedin-post',
    output: 'stats-card-sample.png',
    vars: { STAT: '17+', UNIT: 'Jahre', LABEL: 'Erfahrung in Tech & Strategie' },
  },
  {
    template: 'templates/social/announcement.html',
    preset: 'og',
    output: 'announcement-sample.png',
    vars: { EYEBROW: 'NEUES ANGEBOT', HEADLINE: 'Prozess-Review für KMUs', BODY: '5 Tage. Klarheit über alle Geschäftsprozesse.' },
  },
  {
    template: 'templates/social/og.html',
    preset: 'og',
    output: 'og-sample.png',
    vars: { TITLE: 'Digitalisierung & Prozessoptimierung', SUBTITLE: 'Escape Velocity Advisory' },
  },
  {
    template: 'templates/social/twitter-banner.html',
    preset: 'twitter-banner',
    output: 'twitter-banner-sample.png',
    vars: {},
  },
  {
    template: 'templates/social/youtube-banner.html',
    preset: 'youtube-banner',
    output: 'youtube-banner-sample.png',
    vars: {},
  },
]

for (const { template, preset, output, vars } of socialSamples) {
  const templatePath = resolve(BRAND_DIR, template)
  const outputPath = resolve(RASTER_DIR, output)
  const varFlags = Object.entries(vars).map(([k, v]) => `--var "${k}=${v}"`).join(' ')
  execSync(
    `npx tsx "${imageGen}" --input "${templatePath}" --type html --preset ${preset} ${varFlags} -o "${outputPath}"`,
    { stdio: 'inherit', cwd: BRAND_DIR },
  )
  console.log(`Exported: ${output}`)
}

// --- Document preview screenshots ---
// Generate debug HTML via pdf.ts --debug, then screenshot the HTML
// (screenshotting the PDF directly shows browser PDF viewer UI)

const pdfGen = resolve(BRAND_DIR, 'generators', 'pdf.ts')
const sampleContent: Record<string, string> = {
  letter: `# Projektupdate — Digitalisierung Buchhaltung

Sehr geehrter Herr Muster,

vielen Dank für das produktive Gespräch letzte Woche. Wie besprochen fasse ich den aktuellen Stand zusammen.

## Status

Die Analyse Ihrer bestehenden Prozesse ist abgeschlossen. Wir haben drei zentrale Engpässe identifiziert:

1. **Manuelle Rechnungserfassung** — durchschnittlich 4,2 Minuten pro Beleg
2. **Medienbruch BMD ↔ Excel** — doppelte Datenhaltung, Fehlerquote 8%
3. **Fehlende Freigabeworkflows** — Rückfragen per E-Mail, keine Nachverfolgung

Im nächsten Schritt erarbeiten wir konkrete Lösungsvorschläge für jeden dieser Punkte.

Mit freundlichen Grüßen
Tommi Enenkel`,

  offer: `# Angebot: Prozess-Review & Optimierung

## Leistungsumfang

### Phase 1 — Analyse (2 Tage)
- Vor-Ort-Begehung und Prozessaufnahme
- Interviews mit Schlüsselpersonen (max. 6)
- Dokumentation der Ist-Prozesse

### Phase 2 — Auswertung (3 Tage)
- Engpass-Analyse und Priorisierung
- Benchmarking gegen Best Practices
- Erstellung Maßnahmenkatalog

## Investition

| Position | Umfang | Einzelpreis | Gesamt |
|----------|--------|-------------|--------|
| Analyse vor Ort | 2 Tage | 1.800 € | 3.600 € |
| Auswertung & Report | 3 Tage | 1.800 € | 5.400 € |
| Ergebnispräsentation | 0,5 Tage | 1.800 € | 900 € |
| | | **Gesamt netto** | **9.900 €** |

Alle Preise verstehen sich zzgl. gesetzlicher USt. sowie anfallender Reisekosten.`,

  invoice: `# Rechnung

## Leistungszeitraum: 01.02.2026 – 28.02.2026

| Pos. | Beschreibung | Menge | Einzelpreis | Gesamt |
|------|-------------|-------|-------------|--------|
| 1 | Prozess-Review: Analyse vor Ort | 2 Tage | 1.800,00 € | 3.600,00 € |
| 2 | Prozess-Review: Auswertung & Report | 3 Tage | 1.800,00 € | 5.400,00 € |
| 3 | Ergebnispräsentation | 0,5 Tage | 1.800,00 € | 900,00 € |
| 4 | Reisekosten (pauschal) | 1 | 280,00 € | 280,00 € |

| | |
|---|---|
| Zwischensumme | 10.180,00 € |
| USt. 20% | 2.036,00 € |
| **Gesamtbetrag** | **12.216,00 €** |

Zahlbar innerhalb von 14 Tagen nach Rechnungserhalt.`,

  tos: `# Allgemeine Geschäftsbedingungen

## §1 Geltungsbereich

1. Diese Allgemeinen Geschäftsbedingungen gelten für alle Verträge zwischen Escape Velocity GmbH (nachfolgend "Auftragnehmer") und dem jeweiligen Auftraggeber.
2. Abweichende Bedingungen des Auftraggebers werden nicht anerkannt, es sei denn, der Auftragnehmer stimmt ihrer Geltung ausdrücklich schriftlich zu.

## §2 Leistungsumfang

1. Art und Umfang der Leistungen ergeben sich aus dem jeweiligen Angebot bzw. der Leistungsbeschreibung.
2. Änderungen des Leistungsumfangs bedürfen der Schriftform.
3. Der Auftragnehmer erbringt seine Leistungen nach den Grundsätzen ordnungsgemäßer Berufsausübung.

## §3 Vergütung

1. Die Vergütung richtet sich nach dem vereinbarten Angebot.
2. Alle Preise verstehen sich zzgl. der gesetzlichen Umsatzsteuer.
3. Rechnungen sind innerhalb von 14 Tagen nach Zugang ohne Abzug zur Zahlung fällig.

## §4 Vertraulichkeit

1. Beide Parteien verpflichten sich, alle im Rahmen der Zusammenarbeit erhaltenen vertraulichen Informationen geheim zu halten.
2. Diese Verpflichtung besteht auch nach Beendigung des Vertragsverhältnisses fort.`,
}

const previewTypes = [
  { type: 'letter', output: 'letter-preview.png' },
  { type: 'offer', output: 'offer-preview.png' },
  { type: 'invoice', output: 'invoice-preview.png' },
  { type: 'tos', output: 'tos-preview.png' },
]

const browser = await chromium.launch()

for (const { type, output } of previewTypes) {
  const pdfPath = resolve(PREVIEWS_DIR, `${type}-sample.pdf`)
  const debugHtmlPath = pdfPath.replace(/\.pdf$/, '.debug.html')
  const previewPath = resolve(PREVIEWS_DIR, output)

  // Write sample markdown to temp file
  const sampleMdPath = resolve(PREVIEWS_DIR, `${type}-sample.md`)
  writeFileSync(sampleMdPath, sampleContent[type])

  // Generate PDF + debug HTML.
  // Invoice requires structured recipient flags; other types use the simple --to.
  const recipientFlags = type === 'invoice'
    ? `--to-name "Erika Musterfrau" --to-company "Muster GmbH" --to-address "Musterstraße 1\\n1010 Wien" --to-uid "ATU12345678"`
    : `--to "Muster GmbH"`
  execSync(
    `npx tsx "${pdfGen}" "${sampleMdPath}" --type ${type} ${recipientFlags} --ref "EV-2026-001" --subject "Beispieldokument" --lang de --debug -o "${pdfPath}"`,
    { stdio: 'inherit', cwd: BRAND_DIR },
  )

  // Screenshot the debug HTML (renders document content directly)
  const page = await browser.newPage()
  await page.setViewportSize({ width: 794, height: 1123 }) // A4 at 96dpi
  await page.goto(pathToFileURL(debugHtmlPath).href, { waitUntil: 'networkidle' })
  await page.screenshot({ path: previewPath, type: 'png' })
  await page.close()

  // Clean up temp files (keep PDF for download links)
  try { unlinkSync(debugHtmlPath) } catch {}
  try { unlinkSync(sampleMdPath) } catch {}

  console.log(`Exported: ${output}`)
}

await browser.close()

console.log('All assets exported.')
