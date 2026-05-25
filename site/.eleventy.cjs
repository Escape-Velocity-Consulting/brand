const path = require("node:path");

module.exports = function(eleventyConfig) {
  // Site-level CSS (lives in site/)
  eleventyConfig.addPassthroughCopy("site.css");
  eleventyConfig.addPassthroughCopy("print.css");

  // Force-escape filter. Nunjucks's built-in `escape`/`e` filter is a no-op
  // on values already marked SafeString (which {% call %} / caller() returns),
  // which would render literal HTML inside <pre><code>. This unwraps to a
  // plain string and escapes the four HTML entities.
  eleventyConfig.addFilter("escapeHtml", (input) => {
    return String(input).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  });

  // tokens.css, assets/, fonts/, previews/ live outside site/ and are copied into
  // dist/site/ by scripts/build-dist.sh. 11ty disallows passthrough from parent dirs.

  return {
    dir: {
      input: ".",
      output: path.resolve(__dirname, "..", "dist", "site"),
      includes: "_includes",
      data: "_data"
    },
    templateFormats: ["njk", "md"],
    htmlTemplateEngine: "njk",
    pathPrefix: "/brand/"
  };
};
