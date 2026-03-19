// brand/tokens.ts — Single source of truth for all brand values.
// All other implementations derive from this.

export const colors = {
  cream:           '#F9F7F4',
  black:           '#1E1C1A',
  terracotta:      '#D4784A',
  terracottaHover: '#C2653A',
  accent:          '#E8865A',
  light:           '#F5F3F0',
  muted:           '#C4BEB8',
  subtle:          '#807A74',
  body:            '#5C5650',
  text:            '#1A1816',
} as const

export const secondaryColors = {
  blue:  '#3B82F6',   // kommt tags
  green: '#16A34A',   // tun tags
} as const

export const fonts = {
  headline: "'Space Grotesk', sans-serif",
  ui:       "'Manrope', sans-serif",
  body:     "'Inter', sans-serif",
  mono:     "'JetBrains Mono', monospace",
} as const

export const fontFiles = {
  spaceGrotesk: ['space-grotesk.woff2', 'space-grotesk-ext.woff2'],
  manrope:      ['manrope.woff2', 'manrope-ext.woff2'],
  inter:        ['inter.woff2', 'inter-ext.woff2'],
} as const

export const spacing = {
  containerMax:    '1100px',
  containerNarrow: '620px',
  paddingDesktop:  '40px',
  paddingTablet:   '24px',
  paddingMobile:   '16px',
} as const

export const radii = {
  card:   '12px',
  button: '8px',
  badge:  '4px',
  code:   '6px',
} as const

export const print = {
  pageFormat:   'A4',
  marginTop:    '12mm',
  marginRight:  '25mm',
  marginBottom: '20mm',
  marginLeft:   '25mm',
} as const

/** Generate tokens.css content from the token objects */
export function generateCSS(): string {
  const lines = [':root {']
  for (const [key, value] of Object.entries(colors)) {
    const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase()
    lines.push(`  --color-${cssKey}: ${value};`)
  }
  for (const [key, value] of Object.entries(secondaryColors)) {
    lines.push(`  --color-${key}: ${value};`)
  }
  for (const [key, value] of Object.entries(fonts)) {
    lines.push(`  --font-${key}: ${value};`)
  }
  lines.push('}')
  return lines.join('\n') + '\n'
}
