// Slide-type metadata for /brand/presentations/.
// One entry per slide in previews/showcase/slide-types.md (in order).
// slideIndex matches the slide number in the showcase viewer + the PNG filename
// (slides/slide-0N.png) — regenerated automatically by `npm run build:assets`.
//
// When adding a new slide type:
//   1. Add a slide to previews/showcase/slide-types.md (one example)
//   2. Add an entry here with matching slideIndex
//   3. Run `npm run build:assets` and reload the site

module.exports = [
  {
    type: 'title',
    label: 'Title slide',
    description: 'Deck opening or chapter intro. One large H1, optional eyebrow (blockquote line) and subtitle (body line).',
    syntax: `<!-- @type: title -->
> Eyebrow text
# Headline
Optional subtitle line.`,
    slideIndex: 1,
  },
  {
    type: 'section',
    label: 'Section divider',
    description: 'Full-bleed terracotta divider for chapter breaks inside a longer deck. Section number above, headline below.',
    syntax: `<!-- @type: section -->
> Teil 2
# Section name`,
    slideIndex: 2,
  },
  {
    type: 'content',
    label: 'Content',
    description: 'Standard slide for bulleted lists, paragraphs, tables, and inline subheadings. The workhorse layout.',
    syntax: `<!-- @type: content -->
## Slide heading
- Bullet one
- Bullet two
- Bullet three

### Subheading
More body text.`,
    slideIndex: 3,
  },
  {
    type: 'two-col',
    label: 'Two-column',
    description: 'Side-by-side markdown columns. Split the body with ::: on its own line. Useful for comparisons, before/after, options A/B.',
    syntax: `<!-- @type: two-col -->
## Heading

### Left

- Column A markdown

:::

### Right

- Column B markdown`,
    slideIndex: 4,
  },
  {
    type: 'quote',
    label: 'Quote',
    description: 'Large pulled quote with attribution. Use for testimonials, customer voice, or pivotal statements that deserve a slide of their own.',
    syntax: `<!-- @type: quote -->
> "Short, weighty quote text."
— Source · Attribution`,
    slideIndex: 5,
  },
  {
    type: 'image',
    label: 'Image',
    description: 'Full-bleed image on a dark background with optional caption. Image paths are relative to the markdown source file.',
    syntax: `<!-- @type: image -->
![Caption text](./path/to/image.png)`,
    slideIndex: 6,
  },
  {
    type: 'html',
    label: 'HTML passthrough',
    description: 'Raw HTML escape hatch — embed components from brand/components/ (e.g. the radar chart) or any custom markup. Body is rendered as-is, no markdown processing.',
    syntax: `<!-- @type: html -->
<h2>Custom heading</h2>
<div id="my-chart"></div>
<script>
  document.getElementById('my-chart').innerHTML = renderRadarChart([4, 3, 5, 2, 4]);
</script>`,
    slideIndex: 7,
  },
];
