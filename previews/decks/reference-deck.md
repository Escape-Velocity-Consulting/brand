<!--
  Reference deck — canonical worked example for `render_slides` markdown mode.
  Demonstrates every slide type the system ships with, the title-once contract,
  and the `@type: html` canvas + recipe library (flow, spectrum, tiers,
  multiplier — replacing the inline-style spam from earlier hand-rolled decks).

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

<!-- @type: quote -->
<!-- @bg: black -->
<!-- @source: Ein Anwalt, LinkedIn, 2026 -->
> Ich ersetze mein ganzes Team durch KI.

===

<!-- @type: section -->
# Enablement

Drei Schritte vom Hype zur Hebelwirkung.

===

<!-- @type: content -->
## Das Enablement ist real

KI ist eine General-Purpose-Technologie — und sie macht Einzelpersonen messbar produktiver.

- Ein Geschäftsführer mit den richtigen Werkzeugen erledigt **in einem Tag**, wofür er früher eine Woche brauchte
- Das ist kein Hype — das ist messbar
- Soweit liegt der Anwalt richtig

===

<!-- @type: html -->
## Aber in Teil zwei verrennt er sich

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

<!-- @type: big-number -->
> Produktivitäts-Multiplier
# 10x

In einem Tag erledigen, wofür sonst eine Woche reicht.

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

<!-- @type: section -->
<!-- @bg: black -->
## Werkzeuge

7 Tipps · 1 Bonus · 75 Minuten

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

<!-- @type: image -->
<!-- @bg: cream -->
<!-- @chrome: none -->
# 🥋

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

<!-- @type: section -->
<!-- @bg: terracotta -->
# Danke!

tommi.enenkel@escapevelocity.consulting
