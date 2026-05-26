// Brand Site navigation. Order matters — used in header nav and on overview page.
module.exports = [
  { slug: "",             label: "Overview",      description: "Brand front door — routing and system overview" },
  { slug: "identity",     label: "Identity",      description: "Colors, typography, logos, voice & press" },
  { slug: "products",     label: "Products",      description: "Everything the brand produces", children: [
    { slug: "graphics",       label: "Graphics" },
    { slug: "documents",      label: "Documents" },
    { slug: "presentations",  label: "Presentations" },
  ]},
  { slug: "publications", label: "Publications",  description: "All published brand outputs" },
  { slug: "tooling",      label: "Tooling",       description: "Claude skill, MCP server, build workflow" },
  { slug: "download",     label: "Download",      description: "Brand kit — logos, fonts, templates, press" },
];
