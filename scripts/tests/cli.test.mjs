import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadMergedConfig, parseYamlConfig, validateConfig } from "../lib/config.mjs";
import { detectProject } from "../lib/detect.mjs";
import { loadRules, resolveEffectiveRules } from "../lib/rules.mjs";
import { REPO_ROOT } from "../validate.mjs";

const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "dp-cli-test-"));
const BIN_PATH = path.join(REPO_ROOT, "bin", "dev-principles.mjs");

test("loadRules parses all 47 Rule IDs from references", () => {
  const rules = loadRules(REPO_ROOT);
  assert.equal(rules.length, 47);

  const ids = new Set(rules.map((r) => r.id));
  for (const sample of ["AI-01", "CC-02", "TS-02", "SOC-07", "DQ-04", "FB-01", "FSD-06", "NEXT-01"]) {
    assert.ok(ids.has(sample), `Missing ${sample}`);
  }
});

test("parseYamlConfig, merge, and validateConfig handle overrides and invariants", () => {
  const dir = makeTempDir();
  const globalDir = makeTempDir();
  try {
    const globalPath = path.join(globalDir, "config.yaml");
    fs.writeFileSync(
      globalPath,
      `version: 1
architecture:
  preset: feature-based
context7:
  preferredLibraries:
    - react
rules:
  CC-04: off
`,
    );

    fs.writeFileSync(
      path.join(dir, ".dev-principles.yaml"),
      `version: 1
architecture:
  preset: fsd
context7:
  preferredLibraries:
    - next.js
    - "@tanstack/react-query"
rules:
  DQ-04: off
extraKey: true
`,
    );

    const loaded = loadMergedConfig({ cwd: dir, globalPath });
    assert.equal(loaded.parseErrors.length, 0);
    assert.equal(loaded.config.architecture.preset, "fsd");
    assert.deepEqual(loaded.config.context7.preferredLibraries, [
      "next.js",
      "@tanstack/react-query",
    ]);
    assert.equal(loaded.config.rules["CC-04"], "off");
    assert.equal(loaded.config.rules["DQ-04"], "off");

    const knownIds = new Set(loadRules(REPO_ROOT).map((r) => r.id));
    const validation = validateConfig(loaded.config, knownIds);
    assert.equal(validation.errors.length, 0);
    assert.ok(validation.warnings.some((w) => w.includes("extraKey")));
    assert.ok(validation.warnings.some((w) => w.includes("DQ-04")));

    // Invalid rule ID and severity produce errors
    const bad = parseYamlConfig("version: 2\nrules:\n  NOPE-99: invalid\n");
    const badResult = validateConfig(bad, knownIds);
    assert.ok(badResult.errors.length >= 3);

    // Security invariant DQ-04 stays must even when YAML sets off
    const effective = resolveEffectiveRules(loadRules(REPO_ROOT), loaded.config);
    const dq04 = effective.find((r) => r.id === "DQ-04");
    assert.equal(dq04.effectiveSeverity, "must");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(globalDir, { recursive: true, force: true });
  }
});

test("detectProject identifies fsd, next-app-router, feature-based, and auto", () => {
  const fsdDir = makeTempDir();
  const nextDir = makeTempDir();
  const fbDir = makeTempDir();
  const emptyDir = makeTempDir();
  try {
    fs.mkdirSync(path.join(fsdDir, "src", "entities"), { recursive: true });
    fs.mkdirSync(path.join(fsdDir, "src", "features"), { recursive: true });
    assert.equal(detectProject(fsdDir).detectedPreset, "fsd");

    fs.mkdirSync(path.join(nextDir, "src", "app"), { recursive: true });
    fs.writeFileSync(path.join(nextDir, "package.json"), '{"dependencies":{"next":"16.0.0"}}');
    assert.equal(detectProject(nextDir).detectedPreset, "next-app-router");

    fs.mkdirSync(path.join(fbDir, "src", "features"), { recursive: true });
    fs.mkdirSync(path.join(fbDir, "src", "shared"), { recursive: true });
    assert.equal(detectProject(fbDir).detectedPreset, "feature-based");

    assert.equal(detectProject(emptyDir).detectedPreset, "auto");
  } finally {
    fs.rmSync(fsdDir, { recursive: true, force: true });
    fs.rmSync(nextDir, { recursive: true, force: true });
    fs.rmSync(fbDir, { recursive: true, force: true });
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
});

test("bin/dev-principles.mjs init, doctor, list, and explain work end-to-end", () => {
  const dir = makeTempDir();
  try {
    fs.mkdirSync(path.join(dir, "src", "entities"), { recursive: true });
    fs.mkdirSync(path.join(dir, "src", "features"), { recursive: true });

    const dryOut = execFileSync(
      process.execPath,
      [BIN_PATH, "init", "--cwd", dir, "--dry-run"],
      { encoding: "utf8" },
    );
    assert.match(dryOut, /preset: fsd/);
    assert.equal(fs.existsSync(path.join(dir, ".dev-principles.yaml")), false);

    execFileSync(process.execPath, [BIN_PATH, "init", "--cwd", dir], { encoding: "utf8" });
    assert.equal(fs.existsSync(path.join(dir, ".dev-principles.yaml")), true);

    const doctorJson = JSON.parse(
      execFileSync(process.execPath, [BIN_PATH, "doctor", "--cwd", dir, "--json"], {
        encoding: "utf8",
      }),
    );
    assert.equal(doctorJson.ok, true);
    assert.equal(doctorJson.config.preset, "fsd");

    const listJson = JSON.parse(
      execFileSync(process.execPath, [BIN_PATH, "list", "--cwd", dir, "--category", "CC", "--json"], {
        encoding: "utf8",
      }),
    );
    assert.equal(listJson.length, 5);

    const explainJson = JSON.parse(
      execFileSync(process.execPath, [BIN_PATH, "explain", "CC-01", "--cwd", dir, "--json"], {
        encoding: "utf8",
      }),
    );
    assert.equal(explainJson.id, "CC-01");
    assert.equal(explainJson.effectiveSeverity, "should");

    const fsdOut = execFileSync(
      process.execPath,
      [BIN_PATH, "explain", "FSD-06", "--cwd", dir],
      { encoding: "utf8" },
    );
    assert.match(fsdOut, /FSD-06/);

    assert.throws(() => {
      execFileSync(process.execPath, [BIN_PATH, "explain", "NOPE-01", "--cwd", dir], {
        encoding: "utf8",
        stdio: "pipe",
      });
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
