import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadMergedConfig } from "../lib/config.mjs";
import { detectProject, detectProjectConflicts } from "../lib/detect.mjs";
import {
  buildReviewResult,
  canDelegateReview,
  getOwnerReviewerForRule,
  mergeReviewResults,
} from "../lib/review-contract.mjs";
import { loadRules, resolveEffectiveRules } from "../lib/rules.mjs";
import { EXPECTED_RULE_IDS, parseFrontmatter, REPO_ROOT } from "../validate.mjs";

const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "dp-compat-test-"));
const BIN_PATH = path.join(REPO_ROOT, "bin", "dev-principles.mjs");

const readRepoFile = (relPath) =>
  fs.readFileSync(path.join(REPO_ROOT, path.normalize(relPath)), "utf8");

test("all 4 agents enforce read-only, omit tools, and define non-overlapping boundaries", () => {
  const agents = [
    "agents/principles-reviewer.md",
    "agents/architecture-reviewer.md",
    "agents/security-reviewer.md",
    "agents/structure-analyzer.md",
  ];
  for (const agentFile of agents) {
    const content = readRepoFile(agentFile);
    const fm = parseFrontmatter(content, agentFile);
    assert.equal(fm.tools, undefined, `${agentFile} must omit tools frontmatter`);
    assert.match(content, /Read-only/i);
    assert.match(content, /브랜치|커밋|푸시|PR|github-convention/);
  }

  for (const reviewerFile of agents.slice(0, 3)) {
    const content = readRepoFile(reviewerFile);
    assert.match(content, /Owned Rule IDs/);
    assert.match(content, /무한 위임 금지|상호 재귀 위임 금지/);
    assert.match(content, /github-convention/);
  }

  const analyzer = readRepoFile("agents/structure-analyzer.md");
  assert.match(analyzer, /Pre-Analysis Only/);
  assert.match(analyzer, /Out-of-Scope/);

  for (const cmdFile of ["commands/dp-design.md", "commands/dp-refactor.md", "commands/dp-review.md"]) {
    const content = readRepoFile(cmdFile);
    const fm = parseFrontmatter(content, cmdFile);
    assert.ok(fm.description);
    assert.ok(fm["argument-hint"]);
    assert.match(content, /standalone/i);
  }
});

test("review-contract separates reviewer domains, deduplicates findings, and prevents infinite delegation", () => {
  assert.equal(getOwnerReviewerForRule("CC-01"), "principles-reviewer");
  assert.equal(getOwnerReviewerForRule("TS-02"), "principles-reviewer");
  assert.equal(getOwnerReviewerForRule("SOC-04"), "architecture-reviewer");
  assert.equal(getOwnerReviewerForRule("FSD-01"), "architecture-reviewer");
  assert.equal(getOwnerReviewerForRule("NEXT-01"), "architecture-reviewer");
  assert.equal(getOwnerReviewerForRule("SEC-01"), "security-reviewer");
  assert.equal(getOwnerReviewerForRule("DQ-04"), "security-reviewer");
  assert.equal(getOwnerReviewerForRule("NEXT-04"), "security-reviewer");

  // Anti-loop delegation checks
  assert.equal(canDelegateReview({ fromReviewer: "principles-reviewer", toReviewer: "principles-reviewer" }), false);
  assert.equal(canDelegateReview({ fromReviewer: "principles-reviewer", toReviewer: "architecture-reviewer", visited: [] }), true);
  assert.equal(
    canDelegateReview({
      fromReviewer: "architecture-reviewer",
      toReviewer: "principles-reviewer",
      visited: ["principles-reviewer", "architecture-reviewer"],
    }),
    false,
  );

  const r1 = buildReviewResult({
    reviewerId: "principles-reviewer",
    scope: "pr-diff",
    target: { commit: "abc123", paths: ["src/a.ts"] },
    checkedAreas: ["clean-code", "typescript"],
    findings: [
      { severity: "must", ruleId: "TS-02", file: "src/a.ts", line: 10, evidence: "any used" },
      // Duplicate SEC-01 emitted by non-owner should lose to canonical security-reviewer
      { reviewerId: "principles-reviewer", severity: "must", ruleId: "SEC-01", file: "src/a.ts", line: 20, evidence: "dup" },
    ],
  });

  const r2 = buildReviewResult({
    reviewerId: "architecture-reviewer",
    scope: "pr-diff",
    target: { commit: "abc123", paths: ["src/a.ts"] },
    checkedAreas: ["architecture-soc"],
    findings: [
      { severity: "must", ruleId: "SOC-04", file: "src/a.ts", line: 10, evidence: "reverse dep" },
    ],
  });

  const r3 = buildReviewResult({
    reviewerId: "security-reviewer",
    scope: "pr-diff",
    target: { commit: "abc123", paths: ["src/a.ts"] },
    checkedAreas: ["security"],
    findings: [
      { reviewerId: "security-reviewer", severity: "must", ruleId: "SEC-01", file: "src/a.ts", line: 20, evidence: "secret" },
    ],
  });

  const merged = mergeReviewResults([r1, r2, r3]);
  assert.equal(merged.findings.length, 3);
  // Distinct Rule IDs on the same line (TS-02 and SOC-04 at line 10) are preserved
  assert.ok(merged.findings.some((f) => f.ruleId === "TS-02" && f.line === 10));
  assert.ok(merged.findings.some((f) => f.ruleId === "SOC-04" && f.line === 10));
  const sec01 = merged.findings.find((f) => f.ruleId === "SEC-01");
  assert.equal(sec01.reviewerId, "security-reviewer");
  assert.equal(sec01.evidence, "secret");
});

test("CLI check supports --format review-result, --pr-context, and --out standalone and with external context", () => {
  const dir = makeTempDir();
  const fakeHome = makeTempDir();
  try {
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "clean.ts"), "export const sum = (a: number, b: number) => a + b;\n");
    const prCtxPath = path.join(dir, "pr-context.json");
    const outPath = path.join(dir, "review-out.json");
    fs.writeFileSync(
      prCtxPath,
      JSON.stringify({
        source: "github-convention",
        prNumber: 42,
        baseRef: "main",
        commit: "deadbeef",
        paths: ["src/clean.ts"],
      }),
    );

    const stdout = execFileSync(
      process.execPath,
      [
        BIN_PATH,
        "check",
        "--cwd",
        dir,
        "--format",
        "review-result",
        "--pr-context",
        prCtxPath,
        "--out",
        outPath,
      ],
      { env: { ...process.env, HOME: fakeHome }, encoding: "utf8" },
    );

    const parsed = JSON.parse(stdout);
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.status, "completed");
    assert.equal(parsed.externalContext.source, "github-convention");
    assert.equal(parsed.externalContext.prNumber, 42);
    assert.equal(parsed.target.commit, "deadbeef");
    assert.equal(fs.existsSync(outPath), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }
});

test("project rule conflicts preserve existing project rules without mutating files", () => {
  const fsdConflictsDir = makeTempDir();
  const claudeConflictDir = makeTempDir();
  const structConflictDir = makeTempDir();
  const coExistDir = makeTempDir();
  const fakeHome = makeTempDir();

  try {
    // 1. AGENTS.md (NO FSD) vs fsd preset
    fs.mkdirSync(path.join(fsdConflictsDir, "src", "entities"), { recursive: true });
    fs.mkdirSync(path.join(fsdConflictsDir, "src", "features"), { recursive: true });
    const agentsContent = "# Project Rules\n- NO FSD (use standard Next.js folders)\n";
    fs.writeFileSync(path.join(fsdConflictsDir, "AGENTS.md"), agentsContent);
    const loaded1 = loadMergedConfig({ cwd: fsdConflictsDir, globalPath: path.join(fakeHome, "none.yaml") });
    const detected1 = detectProject(fsdConflictsDir);
    const conflicts1 = detectProjectConflicts({ cwd: fsdConflictsDir, config: loaded1.config, detected: detected1 });
    assert.ok(conflicts1.some((c) => c.ruleId === "FSD-01" && c.projectRule.includes("AGENTS.md")));
    assert.equal(fs.readFileSync(path.join(fsdConflictsDir, "AGENTS.md"), "utf8"), agentsContent);

    // 2. CLAUDE.md (FSD 금지) vs explicit fsd preset
    const claudeContent = "# CLAUDE\nFSD 금지: 표준 디렉터리만 사용한다.\n";
    fs.writeFileSync(path.join(claudeConflictDir, "CLAUDE.md"), claudeContent);
    fs.writeFileSync(
      path.join(claudeConflictDir, ".dev-principles.yaml"),
      "version: 1\narchitecture:\n  preset: fsd\n",
    );
    const doctorClaude = JSON.parse(
      execFileSync(process.execPath, [BIN_PATH, "doctor", "--cwd", claudeConflictDir, "--json"], {
        env: { ...process.env, HOME: fakeHome },
        encoding: "utf8",
      }),
    );
    assert.equal(doctorClaude.ok, true);
    assert.ok(doctorClaude.conflicts.some((c) => c.ruleId === "FSD-01" && c.projectRule.includes("CLAUDE.md")));
    assert.equal(fs.readFileSync(path.join(claudeConflictDir, "CLAUDE.md"), "utf8"), claudeContent);

    // 3. Existing next-app-router structure vs .dev-principles.yaml preset: fsd
    fs.mkdirSync(path.join(structConflictDir, "src", "app"), { recursive: true });
    fs.writeFileSync(path.join(structConflictDir, "package.json"), '{"dependencies":{"next":"16.0.0"}}');
    const dpYaml = "version: 1\narchitecture:\n  preset: fsd\n";
    fs.writeFileSync(path.join(structConflictDir, ".dev-principles.yaml"), dpYaml);
    const doctorStruct = JSON.parse(
      execFileSync(process.execPath, [BIN_PATH, "doctor", "--cwd", structConflictDir, "--json"], {
        env: { ...process.env, HOME: fakeHome },
        encoding: "utf8",
      }),
    );
    assert.ok(doctorStruct.conflicts.some((c) => c.ruleId === "SOC-06" && c.cause.includes("next-app-router")));
    assert.equal(fs.readFileSync(path.join(structConflictDir, ".dev-principles.yaml"), "utf8"), dpYaml);

    // 4. Co-existing .github-convention/config.yaml + .dev-principles.yaml remain orthogonal
    fs.mkdirSync(path.join(coExistDir, ".github-convention"), { recursive: true });
    fs.writeFileSync(path.join(coExistDir, ".github-convention", "config.yaml"), "version: 1\n");
    fs.writeFileSync(
      path.join(coExistDir, ".dev-principles.yaml"),
      "version: 1\narchitecture:\n  preset: feature-based\n",
    );
    const doctorCo = JSON.parse(
      execFileSync(process.execPath, [BIN_PATH, "doctor", "--cwd", coExistDir, "--json"], {
        env: { ...process.env, HOME: fakeHome },
        encoding: "utf8",
      }),
    );
    assert.equal(doctorCo.ok, true);
    assert.equal(doctorCo.config.preset, "feature-based");
    assert.equal(doctorCo.detected.hasGithubWorkflowConfig, true);
    assert.deepEqual(doctorCo.companionPlugins, ["github-convention"]);
    assert.equal(doctorCo.conflicts.length, 0);
  } finally {
    fs.rmSync(fsdConflictsDir, { recursive: true, force: true });
    fs.rmSync(claudeConflictDir, { recursive: true, force: true });
    fs.rmSync(structConflictDir, { recursive: true, force: true });
    fs.rmSync(coExistDir, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }
});

test("regression: all 58 Rule IDs, 4 presets, Track S/M/L, and gemini-extension.json remain intact", () => {
  const rules = loadRules(REPO_ROOT);
  assert.equal(EXPECTED_RULE_IDS.length, 58);
  const loadedIds = new Set(rules.map((r) => r.id));
  for (const id of EXPECTED_RULE_IDS) {
    assert.ok(loadedIds.has(id), `Missing Rule ID ${id}`);
  }

  for (const preset of ["auto", "feature-based", "fsd", "next-app-router"]) {
    const resolved = resolveEffectiveRules(rules, { rules: {} }, preset);
    assert.ok(resolved.length >= 39, `Preset ${preset} resolved unexpectedly few rules`);
  }

  const skillMd = readRepoFile("skills/dev-principles/SKILL.md");
  assert.match(skillMd, /Track S/);
  assert.match(skillMd, /Track M/);
  assert.match(skillMd, /Track L/);

  const geminiExt = JSON.parse(readRepoFile("gemini-extension.json"));
  assert.equal(geminiExt.contextFileName, "skills/dev-principles/SKILL.md");
});
