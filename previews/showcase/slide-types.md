<!-- @type: title -->
> Slide type · 1 of 7
# Title slide
Deck opening or chapter intro — one large H1, optional eyebrow and subtitle.

===

<!-- @type: section -->
> Slide type · 2 of 7
# Section divider

===

<!-- @type: content -->
## Content slide
- Standard layout for bullets, paragraphs, and tables
- Markdown body rendered with brand styling
- Supports H3 subheadings and inline **emphasis**
- Use this layout when the slide is text-heavy

===

<!-- @type: two-col -->
## Two-column

### Left

- Two markdown columns side by side
- Useful for comparisons (before/after, options A/B)
- Each column accepts the same markdown as a content slide

:::

### Right

- Split the body with `:::` on its own line
- Each side renders independently
- Headings, lists, paragraphs all work

===

<!-- @type: quote -->
> "A short, weighty quote — for emphasis or testimonial. Markdown blockquote followed by an em-dash attribution line."
— Source · Attribution

===

<!-- @type: image -->
![Image slide — full-bleed visual with caption](../../assets/raster/ev-wordmark-1024.png)

===

<!-- @type: html -->
<h2>HTML passthrough</h2>
<div class="accent-rule" style="width:60px; height:3px; background:var(--color-terracotta); margin-bottom:32px;"></div>
<p style="font-size:28px; line-height:1.5; color:var(--color-body); margin-bottom:24px;">Raw HTML escape hatch — embed components or custom markup. Example: the radar chart from <code>brand/components/radar.js</code>.</p>
<div id="radar-showcase" style="max-width:600px; margin:0 auto;"></div>
<script>
  document.getElementById('radar-showcase').innerHTML = renderRadarChart([4, 3, 5, 2, 4]);
</script>
