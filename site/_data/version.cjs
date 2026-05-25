// Build-time version stamp. Exposed as {{ version.sha }} / {{ version.date }} in templates.
const { execSync } = require("node:child_process");
const path = require("node:path");

function gitSha() {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: path.resolve(__dirname, "..", ".."),
    }).toString().trim();
  } catch {
    return "unknown";
  }
}

function isoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

module.exports = {
  sha: gitSha(),
  date: isoDate(),
};
