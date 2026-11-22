import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { gardenRepo } from "../garden.mjs";
import { EXPECTED_RULE_IDS, MANIFEST_PATHS, REPO_ROOT, validateRepo } from "../validate.mjs";

test("validateRepo and gardenRepo pass on live repository", () => {
  const validation = validateRepo(REPO_ROOT);
  assert.equal(validation.version, "0.1.0");
  assert.equal(validation.manifests, MANIFEST_PATHS.length);
  assert.equal(validation.skills, 1);

  const garden = gardenRepo(REPO_ROOT);
  assert.equal(garden.ok, true, garden.issues.join("\n"));
});

test("SKILL.md stays within 150 lines and 8192 bytes and covers all 47 Rule IDs", () => {
  const skillPath = path.join(REPO_ROOT, "skills", "dev-principles", "SKILL.md");
  const content = fs.readFileSync(skillPath, "utf8");
  assert.ok(Buffer.byteLength(content, "utf8") <= 8192);
  assert.ok(content.split(/\r?\n/).length <= 150);
  assert.equal(EXPECTED_RULE_IDS.length, 47);
});

test("config.schema.json defines version 1 and supported presets", () => {
  const schemaPath = path.join(REPO_ROOT, "schemas", "config.schema.json");
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  assert.equal(schema.properties.version.const, 1);
  assert.deepEqual(schema.properties.architecture.properties.preset.enum, [
    "auto",
    "feature-based",
    "fsd",
    "next-app-router",
  ]);
});
