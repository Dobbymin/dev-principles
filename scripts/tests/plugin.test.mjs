import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { gardenRepo } from "../garden.mjs";
import { MANIFEST_PATHS, REPO_ROOT, validateRepo } from "../validate.mjs";

test("validateRepo and gardenRepo pass on live repository", () => {
  const validation = validateRepo(REPO_ROOT);
  assert.equal(validation.version, "0.1.0");
  assert.equal(validation.manifests, MANIFEST_PATHS.length);

  const garden = gardenRepo(REPO_ROOT);
  assert.equal(garden.ok, true, garden.issues.join("\n"));
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
