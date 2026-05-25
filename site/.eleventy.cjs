const path = require("node:path");

module.exports = function(eleventyConfig) {
  // Site-level CSS (lives in site/)
  eleventyConfig.addPassthroughCopy("site.css");
  eleventyConfig.addPassthroughCopy("print.css");

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
