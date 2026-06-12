const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const packageJson = require("../package.json");

test("default Windows build creates an NSIS installer with uninstall support", () => {
  assert.match(packageJson.scripts.build, /electron-builder --win nsis/);
  assert.match(packageJson.scripts["build:portable"], /electron-builder --win portable/);

  const targets = packageJson.build.win.target.map((target) => target.target);
  assert.deepEqual(targets, ["nsis"]);
  assert.equal(packageJson.build.nsis.oneClick, false);
  assert.equal(packageJson.build.nsis.allowToChangeInstallationDirectory, true);
  assert.match(packageJson.build.nsis.artifactName, /Setup/);
});

test("Windows build uses the bundled app icon", () => {
  assert.equal(packageJson.build.win.icon, "assets/icon.ico");
  assert.ok(packageJson.build.files.includes("assets/**/*"));

  const iconPath = path.join(__dirname, "..", packageJson.build.win.icon);
  const iconHeader = fs.readFileSync(iconPath).subarray(0, 6);
  assert.deepEqual([...iconHeader], [0, 0, 1, 0, 7, 0]);
});
