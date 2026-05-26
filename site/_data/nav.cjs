// Brand Site navigation. Order matters — used in header nav and on overview page.
module.exports = [
  { slug: "",              label: "Overview",      description: "Brand front door — routing and system overview" },
  { slug: "identity",      label: "Identity",      description: "Colors, typography, logos, voice & press", children: [
    { slug: "identity-foundations", href: "identity/foundations", label: "Foundations" },
    { slug: "identity-voice",       href: "identity/voice",       label: "Voice & Press" },
    { slug: "components",                                          label: "Components" },
    { slug: "identity-system",      href: "identity/system",      label: "System" },
  ]},
  { slug: "templates",     label: "Templates",     description: "Everything the brand produces", children: [
    { slug: "graphics",        label: "Graphics" },
    { slug: "documents",       label: "Documents" },
    { slug: "presentations",   label: "Presentations" },
  ]},
  { slug: "tooling",       label: "Tooling",       description: "Claude skill, MCP server, build workflow", children: [
    { slug: "tooling-setup",      href: "tooling/setup",      label: "Setup" },
    { slug: "tooling-reference",  href: "tooling/reference",  label: "Reference" },
  ]},
  { slug: "publications",  label: "Publications",  description: "All published brand outputs", highlight: true },
];
