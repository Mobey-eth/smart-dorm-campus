// Kept for compatibility with the original repository's validation command.
const { execFileSync } = require("node:child_process");
execFileSync(process.execPath, ["--check", "dist/app.js"], {
  stdio: "inherit",
});
execFileSync(process.execPath, ["--check", "server/app.js"], {
  stdio: "inherit",
});
execFileSync(process.execPath, ["--check", "dist/screen-renderers.js"], {
  stdio: "inherit",
});
console.log(
  "Syntax checks passed. Run npm test for backend integration checks.",
);
