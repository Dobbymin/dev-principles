import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  checkCustomPrinciplePaths,
  loadMergedConfig,
  parseYamlConfig,
  validateConfig,
} from "../lib/config.mjs";
import { detectProject } from "../lib/detect.mjs";
import { loadRules, resolveEffectiveRules } from "../lib/rules.mjs";
import { REPO_ROOT } from "../validate.mjs";

const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "dp-cli-test-"));
const BIN_PATH = path.join(REPO_ROOT, "bin", "dev-principles.mjs");

test("loadRules parses all 58 Rule IDs with automation and exceptions", () => {
  const rules = loadRules(REPO_ROOT);
  assert.equal(rules.length, 58);

  const ids = new Set(rules.map((r) => r.id));
  for (const sample of [
    "AI-01",
    "CC-02",
    "TS-02",
    "SOC-07",
    "DQ-04",
    "SEC-01",
    "SEC-02",
    "TEST-03",
    "PERF-01",
    "A11Y-01",
    "DEP-01",
    "FB-01",
    "FSD-06",
    "NEXT-01",
  ]) {
    assert.ok(ids.has(sample), `Missing ${sample}`);
  }

  const sec01 = rules.find((r) => r.id === "SEC-01");
  assert.equal(sec01.automation, "static");
  assert.ok(sec01.exceptions.length > 0);
});

test("parseYamlConfig, merge, and validateConfig handle overrides, ignore, and security invariants", () => {
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
  preferredLibraries: [next.js, "@tanstack/react-query"]
rules:
  DQ-04: off
  SEC-01: off
  SEC-02: off
customPrinciples:
  - docs/missing-principles.md
ignore:
  - src/generated
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
    assert.deepEqual(loaded.config.ignore, ["src/generated"]);
    assert.equal(loaded.config.rules["CC-04"], "off");
    assert.equal(loaded.config.rules["DQ-04"], "off");

    const knownIds = new Set(loadRules(REPO_ROOT).map((r) => r.id));
    const validation = validateConfig(loaded.config, knownIds);
    assert.equal(validation.errors.length, 0);
    assert.ok(validation.warnings.some((w) => w.includes("extraKey")));
    assert.ok(validation.warnings.some((w) => w.includes("DQ-04")));
    assert.ok(validation.warnings.some((w) => w.includes("SEC-01")));
    assert.ok(validation.warnings.some((w) => w.includes("SEC-02")));

    const customWarnings = checkCustomPrinciplePaths(dir, loaded.config);
    assert.equal(customWarnings.length, 1);
    assert.match(customWarnings[0], /missing-principles\.md/);

    // Invalid rule ID and severity produce errors
    const bad = parseYamlConfig("version: 2\nrules:\n  NOPE-99: invalid\n");
    const badResult = validateConfig(bad, knownIds);
    assert.ok(badResult.errors.length >= 3);

    // Security invariants stay must even when YAML sets off
    const effective = resolveEffectiveRules(loadRules(REPO_ROOT), loaded.config);
    for (const invId of ["DQ-04", "SEC-01", "SEC-02"]) {
      const rule = effective.find((r) => r.id === invId);
      assert.equal(rule.effectiveSeverity, "must", `${invId} must remain must`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(globalDir, { recursive: true, force: true });
  }
});

test("detectProject identifies presets, versions, tools, and conventions", () => {
  const fsdDir = makeTempDir();
  const nextDir = makeTempDir();
  const fbDir = makeTempDir();
  const emptyDir = makeTempDir();
  try {
    fs.mkdirSync(path.join(fsdDir, "src", "entities"), { recursive: true });
    fs.mkdirSync(path.join(fsdDir, "src", "features"), { recursive: true });
    fs.writeFileSync(
      path.join(fsdDir, "package.json"),
      JSON.stringify({
        dependencies: { react: "^19.0.0" },
        devDependencies: { "eslint-plugin-boundaries": "^5.0.0", vitest: "^3.0.0" },
      }),
    );
    const fsdInfo = detectProject(fsdDir);
    assert.equal(fsdInfo.detectedPreset, "fsd");
    assert.equal(fsdInfo.detectedVersions.react, "^19.0.0");
    assert.ok(fsdInfo.detectedTools.includes("eslint-plugin-boundaries"));
    assert.ok(fsdInfo.detectedTools.includes("vitest"));

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

    const listStaticJson = JSON.parse(
      execFileSync(
        process.execPath,
        [BIN_PATH, "list", "--cwd", dir, "--automation", "static", "--json"],
        { encoding: "utf8" },
      ),
    );
    assert.ok(listStaticJson.length >= 5);
    assert.ok(listStaticJson.every((r) => r.automation === "static"));

    const explainJson = JSON.parse(
      execFileSync(process.execPath, [BIN_PATH, "explain", "SEC-01", "--cwd", dir, "--json"], {
        encoding: "utf8",
      }),
    );
    assert.equal(explainJson.id, "SEC-01");
    assert.equal(explainJson.automation, "static");
    assert.equal(explainJson.securityInvariant, true);

    const fsdOut = execFileSync(
      process.execPath,
      [BIN_PATH, "explain", "FSD-06", "--cwd", dir],
      { encoding: "utf8" },
    );
    assert.match(fsdOut, /FSD-06/);
    assert.match(fsdOut, /Automation:/);
    assert.match(fsdOut, /Exceptions:/);

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
