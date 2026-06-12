const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const styles = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "styles.css"), "utf8");

test("auto refresh select options use an opaque readable menu style", () => {
  const optionRule = styles.match(/\.refresh-control select option\s*\{[^}]+\}/);

  assert.ok(optionRule, "missing .refresh-control select option rule");
  assert.match(optionRule[0], /background:\s*#[0-9a-fA-F]{3,6}\s*;/);
  assert.match(optionRule[0], /color:\s*#[0-9a-fA-F]{3,6}\s*;/);
});
