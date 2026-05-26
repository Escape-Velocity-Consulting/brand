<!--
  Reference deck — canonical type catalog for `render_slides` markdown mode.
  Sorted by slide type (not story). Every type appears in all relevant bg
  variants so rendering errors and contrast failures are immediately visible.
  HTML slides are last; multiple HTML slides demonstrate each recipe.

  Slide inventory (21 slides):
     1  @type: title     — cream                (slide-1-only chrome: logo, QR, author)
     2  @type: section   — cream, > eyebrow     (section-num above headline)
     3  @type: section   — black                (dark chapter break, no chrome)
     4  @type: statement — cream                (centered sentence, logo + page-num visible)
     5  @type: statement — black                (dark variant, single bold word)
     6  @type: content   — cream, bullets       (standard text layout)
     7  @type: content   — cream, ### H3        (terracotta uppercase section eyebrows)
     8  @type: cards     — cream                (auto-grid from bullet list)
     9  @type: two-col   — cream                (symmetric two-column)
    10  @type: comparison— cream                (muted left / accent right)
    11  @type: quote     — black                (attribution in --color-cream)
    12  @type: quote     — cream                (attribution in --color-text — contrast fix)
    13  @type: big-number— black                (clamped number + eyebrow + caption)
    14  @type: image     — cream, chrome on     (logo + page-num visible)
    15  @type: image     — cream, chrome off    (@chrome: none — full-bleed)
    16  @type: html      — .ev-mult-row         (multiplier recipe)
    17  @type: html      — .ev-spectrum         (axis + marker recipe)
    18  @type: html      — .ev-flow             (process flow recipe)
    19  @type: html      — .ev-tiers            (offer ladder recipe)
    20  @type: html      — .ev-lead / .ev-foot  (basic canvas utilities)
    21  @type: closing   — terracotta           (end-card: same chrome as title, QR baked)

  Render locally:    npm run pres -- previews/decks/reference-deck.md --output previews/decks/reference-deck
  Bake (with QR):    npm run build:reference-deck
  Publish via MCP:   render_slides → publish_artifact → /published/<id>
-->

<!-- @type: title -->
<!-- @bg: cream -->
<!-- @date: 28. Mai 2026 -->
# **KI Masterclass** für Geschäftsführer

KI als 10x Hebel in Deinem Unternehmen einsetzen.

===

<!-- @type: section -->
<!-- @bg: cream -->
> Schritt 1
# Enablement

Vom Hype zur messbaren Hebelwirkung.

===

<!-- @type: section -->
<!-- @bg: black -->
## Werkzeuge

7 Tipps · 1 Bonus · 75 Minuten

===

<!-- @type: statement -->
<!-- @bg: cream -->
# Die meisten Firmen haben nicht zu wenig KI.

Sie haben zu wenig Klarheit über ihre Prozesse.

===

<!-- @type: statement -->
<!-- @bg: black -->
# Fokus.

===

<!-- @type: content -->
## Das Enablement ist real

KI ist eine General-Purpose-Technologie — und sie macht Einzelpersonen messbar produktiver.

- Ein Geschäftsführer erledigt **in einem Tag**, wofür er früher eine Woche brauchte
- Das ist kein Hype — das ist messbar
- Soweit liegt der Anwalt richtig

===

<!-- @type: content -->
## Drei Hebel im Überblick

### Automatisierung

Repetitive Aufgaben — E-Mail-Drafts, Reports, Datenrecherche.

### Augmentierung

Bessere Entscheidungen durch KI-gestützte Analyse.

### Transformation

Neue Geschäftsmodelle, die ohne KI schlicht nicht möglich wären.

===

<!-- @type: cards -->
## Operationalisierung: Werkzeuge

- **Claude Chat** — Text, schnelles Denken und Schreiben
- **Claude Cowork** — langlaufende, mehrstufige Arbeit
- **Claude Code** — Software entwickeln im Terminal
- **Claude Design** — Websites, Layouts, visuelle Drafts
- **ChatGPT** — Bildgenerierung
- **NotebookLM** — Audio aus Quellenmaterial

===

<!-- @type: two-col -->
## Warum jetzt?

Kosten sinken exponentiell — Qualität steigt.

- GPT-3 (2020): **$100** pro 1M Token
- GPT-4 (2023): **$30** pro 1M Token
- Claude 3.5 (2024): **$3** pro 1M Token

:::

Die Fähigkeiten wachsen schneller als die Adoption.

- Reasoning: PhD-Niveau in Fachdomänen
- Code: Senior-Engineer-Niveau
- Übersetzung: muttersprachlich

===

<!-- @type: comparison -->
## Orientierung

### Optimierung

"Was kostet mich jeden Tag Zeit?"

- Löst interne Probleme
- Erhöht Effizienz und Kapazität
- Verbessert bestehende Prozesse

:::

### Wachstum

"Was könnten wir tun, was wir nie konnten?"

- Schafft Innovation und neue Angebote
- Erschließt neue Märkte
- Baut neue Infrastrukturen

===

<!-- @type: quote -->
<!-- @bg: black -->
<!-- @source: Ein Anwalt, LinkedIn, 2026 -->
> Ich ersetze mein ganzes Team durch KI.

===

<!-- @type: quote -->
<!-- @bg: cream -->
<!-- @source: Tommi Enenkel, Escape Velocity Consulting -->
> Die meisten Firmen haben nicht zu wenig KI. Sie haben zu wenig Klarheit über ihre Prozesse.

===

<!-- @type: big-number -->
<!-- @bg: black -->
> Produktivitäts-Multiplier
# 10x

In einem Tag erledigen, wofür sonst eine Woche reicht.

===

<!-- @type: image -->
<!-- @bg: cream -->
# 🥋

===

<!-- @type: image -->
<!-- @bg: cream -->
<!-- @chrome: none -->
# 🥋

===

<!-- @type: html -->
## Enablement-Multiplikator

<p class="ev-lead">Wenn KI dich zehnfach produktiv macht, macht sie auch jeden in deinem Team zehnfach produktiv. <strong>Falls du sie lässt.</strong></p>
<div class="ev-mult-row">
  <div class="ev-mult-col">
    <div class="ev-mult-num">1×</div>
    <div class="ev-mult-box ev-mult-box--sm">heute</div>
  </div>
  <div class="ev-mult-arrow">→</div>
  <div class="ev-mult-col">
    <div class="ev-mult-num ev-mult-num--lg ev-accent">10×</div>
    <div class="ev-mult-box ev-mult-box--md">mit KI</div>
  </div>
  <div class="ev-mult-arrow">→</div>
  <div class="ev-mult-col">
    <div class="ev-mult-num ev-mult-num--xl">100×</div>
    <div class="ev-mult-box ev-mult-box--lg">10 Leute, Kompounding</div>
  </div>
</div>
<p class="ev-foot"><strong>Mehr Output pro Kopf. Nicht null Köpfe.</strong></p>

===

<!-- @type: html -->
## Das Enablement-Spektrum

<div class="ev-spectrum" style="--from: 32%; --to: 68%; --at: 32%;">
  <div class="ev-spectrum-axis">
    <div class="ev-spectrum-marker"></div>
    <div class="ev-spectrum-shift"></div>
  </div>
  <div class="ev-spectrum-shift-label">KI verschiebt den Punkt</div>
  <div class="ev-spectrum-ends">
    <div>Alles auslagern<span>IT-Firmen, Agenturen</span></div>
    <div>Alles selber machen<span>eigenes Team, eigene Tools</span></div>
  </div>
</div>
<p class="ev-foot">Regular People können jetzt mehr selbst tun.</p>

===

<!-- @type: html -->
## Prozesse: Wie KI integrieren?

<div class="ev-flow">
  <div class="ev-flow-step">Input</div>
  <div class="ev-flow-line" data-label="KI-Andock" data-dock><span class="ev-flow-dock"></span></div>
  <div class="ev-flow-step">Verarbeitung</div>
  <div class="ev-flow-line" data-label="KI-Andock" data-dock><span class="ev-flow-dock"></span></div>
  <div class="ev-flow-step">Entscheidung</div>
  <div class="ev-flow-line"></div>
  <div class="ev-flow-step">Output</div>
</div>
<p class="ev-foot">KI ersetzt eure Prozesse nicht. Sie wird in sie integriert.</p>

===

<!-- @type: html -->
## Wie es weitergeht

<div class="ev-tiers">
  <div class="ev-tier">
    <div class="ev-tier-eyebrow">Hilf mir lernen</div>
    <div class="ev-tier-title">Richtung selber machen</div>
    <div class="ev-tier-offer">
      <div class="ev-tier-offer-title">Use Case Consultation</div>
      <div class="ev-tier-offer-meta">€250, oder kostenlos mit YouTube-Aufnahme</div>
    </div>
  </div>
  <div class="ev-tier ev-tier--emphasized">
    <div class="ev-tier-eyebrow">Lass uns gemeinsam bauen</div>
    <div class="ev-tier-title">Mein eigentlicher Modus</div>
    <div class="ev-tier-offer">
      <div class="ev-tier-offer-title">1:1 Coaching Setup</div>
      <div class="ev-tier-offer-meta">€500 pro Session</div>
    </div>
    <div class="ev-tier-offer">
      <div class="ev-tier-offer-title">Aha! Moment Workshop</div>
      <div class="ev-tier-offer-meta">€2.500</div>
    </div>
  </div>
  <div class="ev-tier">
    <div class="ev-tier-eyebrow">Übernimm das für mich</div>
    <div class="ev-tier-title">Richtung auslagern</div>
    <div class="ev-tier-offer">
      <div class="ev-tier-offer-title">Tech Upgrade</div>
      <div class="ev-tier-offer-meta">Projekt-basiert</div>
    </div>
    <div class="ev-tier-offer">
      <div class="ev-tier-offer-title">Fractional CTO</div>
      <div class="ev-tier-offer-meta">Laufende Begleitung, Retainer</div>
    </div>
  </div>
</div>

===

<!-- @type: html -->
## Grundlagen: Canvas-Utilities

<p class="ev-lead">Dieser Slide zeigt <strong>ev-lead</strong> — die breite Einleitung. Darunter normaler Fließtext als Absatz.</p>

<p>Mit <code>ev-canvas</code> als Wrapper bekommt jeder <code>@type: html</code> Slide automatisch das richtige Padding und die richtige Schrift. Kein Boilerplate nötig.</p>

<p class="ev-foot">ev-foot — zentrierte Fußzeile für kurze Aussagen oder Quellen.</p>

===

<!-- @type: closing -->
<!-- @bg: terracotta -->
# Danke!

tommi.enenkel@escapevelocity.consulting
