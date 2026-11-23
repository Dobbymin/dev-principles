#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectCompanionPlugins } from "../hooks/session-start.mjs";
import { collectGitTargetFiles, runStaticChecks } from "../scripts/lib/checker.mjs";
import { checkCustomPrinciplePaths, loadMergedConfig, validateConfig } from "../scripts/lib/config.mjs";
import { detectProject, detectProjectConflicts } from "../scripts/lib/detect.mjs";
import { buildReviewResult, getOwnerReviewerForRule } from "../scripts/lib/review-contract.mjs";
import { loadRules, resolveEffectiveRules } from "../scripts/lib/rules.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VALID_PRESETS = new Set(["auto", "feature-based", "fsd", "next-app-router"]);

const readVersion = () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  return pkg.version;
};

const printHelp = () => {
  process.stdout.write(`dev-principles v${readVersion()}

Usage:
  dev-principles <command> [options]

Commands:
  init [--preset <name>] [--source-root <dir>] [--cwd <dir>] [--dry-run] [--force]
      Detect repository structure and generate .dev-principles.yaml.

  doctor [--cwd <dir>] [--json]
      Validate configuration, Rule IDs, security invariants, customPrinciples, and local conflicts.

  list [--category <prefix>] [--severity <level>] [--automation <level>] [--preset <name>] [--cwd <dir>] [--json]
      List effective rules for the current project.

  explain <RULE-ID> [--cwd <dir>] [--json]
      Show detailed rule contract, automation level, rationale, exceptions, and example for a Rule ID.

  check [target] [--cwd <dir>] [--preset <name>] [--rule <RULE-ID>] [--staged] [--changed] [--strict] [--format review-result] [--pr-context <file>] [--out <file>] [--json]
      Run zero-dependency static checks (secrets, XSS sinks, token storage, any, raw fetch, cycles, boundaries).

Options:
  -h, --help      Show help
  -v, --version   Show version
`);
};

const parseArgs = (argv) => {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      flags.help = true;
    } else if (arg === "-v" || arg === "--version") {
      flags.version = true;
    } else if (
      arg === "--dry-run" ||
      arg === "--json" ||
      arg === "--force" ||
      arg === "--strict" ||
      arg === "--staged" ||
      arg === "--changed"
    ) {
      flags[arg.slice(2)] = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new Error(`Missing value for --${key}`);
      }
      flags[key] = next;
      i += 1;
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags };
};

const renderYamlTemplate = ({ preset, sourceRoot, preferredLibraries }) => {
  const libsLines = preferredLibraries.map((lib) => `    - ${JSON.stringify(lib)}`).join("\n");
  return `version: 1

architecture:
  preset: ${preset}
  sourceRoot: ${sourceRoot}

context7:
  mode: auto
  preferredLibraries:
${libsLines}

rules: {}

customPrinciples: []

ignore: []
`;
};

const runInit = (flags) => {
  const cwd = path.resolve(flags.cwd ?? process.cwd());
  const detected = detectProject(cwd);
  const preset = flags.preset ?? detected.detectedPreset;
  if (!VALID_PRESETS.has(preset)) {
    throw new Error(`Invalid --preset "${preset}". Expected: ${[...VALID_PRESETS].join(", ")}`);
  }
  const sourceRoot = flags["source-root"] ?? detected.sourceRoot;
  const targetPath = path.join(cwd, ".dev-principles.yaml");
  const yamlContent = renderYamlTemplate({
    preset,
    sourceRoot,
    preferredLibraries: detected.detectedLibraries,
  });

  if (flags["dry-run"]) {
    process.stdout.write(`[dry-run] Would write ${targetPath} (preset: ${preset}):\n\n${yamlContent}`);
    return 0;
  }

  if (fs.existsSync(targetPath) && !flags.force) {
    throw new Error(`Refusing to overwrite existing ${targetPath}. Pass --force or --dry-run.`);
  }

  fs.writeFileSync(targetPath, yamlContent, "utf8");
  process.stdout.write(`Created ${targetPath} (preset: ${preset}, sourceRoot: ${sourceRoot}).\n`);
  return 0;
};

const runDoctor = (flags, rules) => {
  const cwd = path.resolve(flags.cwd ?? process.cwd());
  const detected = detectProject(cwd);
  const loaded = loadMergedConfig({ cwd: detected.root });
  const knownIds = new Set(rules.map((r) => r.id));
  const validation = validateConfig(loaded.config, knownIds);
  const customWarnings = checkCustomPrinciplePaths(detected.root, loaded.config);
  const errors = [...loaded.parseErrors, ...validation.errors];
  const warnings = [...validation.warnings, ...customWarnings];
  const conflicts = detectProjectConflicts({ cwd: detected.root, config: loaded.config, detected });
  const { companions: companionPlugins } = detectCompanionPlugins({
    cwd,
    projectRoot: detected.root,
    env: process.env,
  });

  const report = {
    ok: errors.length === 0,
    cwd,
    config: {
      hasGlobal: loaded.hasGlobal,
      hasProject: loaded.hasProject,
      preset: loaded.config.architecture?.preset ?? "auto",
    },
    detected,
    conflicts,
    companionPlugins,
    errors,
    warnings,
  };

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`dev-principles doctor (${cwd})\n`);
    process.stdout.write(`- Config: project=${loaded.hasProject ? ".dev-principles.yaml" : "none (zero-config)"}, global=${loaded.hasGlobal ? "yes" : "none"}\n`);
    process.stdout.write(`- Active preset: ${report.config.preset} (detected: ${detected.detectedPreset}, sourceRoot: ${detected.sourceRoot})\n`);
    if (detected.detectedTools.length > 0) {
      process.stdout.write(`- Detected tools: ${detected.detectedTools.join(", ")}\n`);
    }
    if (Object.keys(detected.detectedVersions).length > 0) {
      const vers = Object.entries(detected.detectedVersions)
        .map(([k, v]) => `${k}@${v}`)
        .join(", ");
      process.stdout.write(`- Detected versions: ${vers}\n`);
    }
    if (detected.localConventions.length > 0) {
      process.stdout.write(`- Local conventions: ${detected.localConventions.join(", ")}\n`);
    }
    if (companionPlugins.length > 0) {
      process.stdout.write(`- Companion plugins: ${companionPlugins.join(", ")} (separate workflow domain)\n`);
    }
    for (const conflict of conflicts) {
      process.stdout.write(
        `[Conflict] ${conflict.ruleId} ↔ ${conflict.projectRule} | 원인: ${conflict.cause} | 유지 사유: ${conflict.reasonKept}\n`,
      );
    }
    for (const warn of warnings) {
      process.stdout.write(`WARN: ${warn}\n`);
    }
    for (const err of errors) {
      process.stderr.write(`ERROR: ${err}\n`);
    }
    if (report.ok) {
      process.stdout.write("Status: OK\n");
    }
  }

  return report.ok ? 0 : 1;
};

const runList = (flags, rules) => {
  const cwd = path.resolve(flags.cwd ?? process.cwd());
  const { config } = loadMergedConfig({ cwd });
  let effective = resolveEffectiveRules(rules, config, flags.preset ?? null);

  if (flags.category) {
    const cat = flags.category.toUpperCase();
    effective = effective.filter((r) => r.category === cat);
  }
  if (flags.severity) {
    const sev = flags.severity.toLowerCase();
    effective = effective.filter((r) => r.effectiveSeverity === sev);
  }
  if (flags.automation) {
    const auto = flags.automation.toLowerCase();
    effective = effective.filter((r) => r.automation === auto);
  }

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(effective, null, 2)}\n`);
    return 0;
  }

  for (const rule of effective) {
    const mark = rule.overridden ? ` (default: ${rule.defaultSeverity})` : "";
    process.stdout.write(
      `[${rule.effectiveSeverity.toUpperCase()}] [${rule.automation}] ${rule.id} — ${rule.title}${mark}\n`,
    );
  }
  process.stdout.write(`\nTotal: ${effective.length} rules\n`);
  return 0;
};

const runExplain = (ruleIdRaw, flags, rules) => {
  if (!ruleIdRaw) {
    throw new Error("Missing <RULE-ID>. Example: dev-principles explain CC-01");
  }
  const ruleId = ruleIdRaw.toUpperCase();
  const cwd = path.resolve(flags.cwd ?? process.cwd());
  const { config } = loadMergedConfig({ cwd });
  const allWithOverrides = resolveEffectiveRules(rules, config, rules.find((r) => r.id === ruleId)?.preset ?? null);
  const found = allWithOverrides.find((r) => r.id === ruleId);

  if (!found) {
    process.stderr.write(`Unknown Rule ID: "${ruleId}". Run "dev-principles list" to see available IDs.\n`);
    return 1;
  }

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(found, null, 2)}\n`);
    return 0;
  }

  process.stdout.write(`${found.id}: ${found.title}\n`);
  process.stdout.write(`Severity: ${found.effectiveSeverity.toUpperCase()}${found.overridden ? ` (overridden from ${found.defaultSeverity.toUpperCase()})` : ""}${found.securityInvariant ? " [security invariant]" : ""}\n`);
  process.stdout.write(`Automation: ${found.automation}${found.automationDetail ? ` — ${found.automationDetail}` : ""}\n`);
  if (found.scope) process.stdout.write(`Scope: ${found.scope}\n`);
  if (found.rule) process.stdout.write(`Rule: ${found.rule}\n`);
  if (found.why) process.stdout.write(`Why: ${found.why}\n`);
  if (found.exceptions) process.stdout.write(`Exceptions: ${found.exceptions}\n`);
  if (found.example) process.stdout.write(`\nExample:\n${found.example}\n`);
  process.stdout.write(`Source: ${found.sourceFile}\n`);
  return 0;
};

const writeOutputIfRequested = (outFlag, text) => {
  if (!outFlag) return;
  const outPath = path.resolve(outFlag);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, text, "utf8");
};

const runCheck = (targetArg, flags, rules) => {
  const cwd = path.resolve(flags.cwd ?? process.cwd());
  const detected = detectProject(cwd);
  const projectRoot = detected.root;
  const { config } = loadMergedConfig({ cwd: projectRoot });
  const effectivePreset =
    flags.preset ??
    (config.architecture?.preset && config.architecture.preset !== "auto"
      ? config.architecture.preset
      : detected.detectedPreset);
  if (!VALID_PRESETS.has(effectivePreset)) {
    throw new Error(`Invalid --preset "${effectivePreset}". Expected: ${[...VALID_PRESETS].join(", ")}`);
  }
  if (flags.format !== undefined && flags.format !== "review-result") {
    throw new Error(`Invalid --format "${flags.format}". Expected: review-result`);
  }

  let ruleFilter = null;
  if (flags.rule) {
    ruleFilter = flags.rule.toUpperCase();
    const knownRuleIds = new Set(rules.map((r) => r.id));
    if (!knownRuleIds.has(ruleFilter)) {
      throw new Error(`Unknown --rule "${ruleFilter}". Run "dev-principles list" to see available Rule IDs.`);
    }
  }

  let externalContext = null;
  let targetOverride = null;
  let prIncludeFiles = null;
  if (flags["pr-context"]) {
    const prPath = path.resolve(flags["pr-context"]);
    if (fs.existsSync(prPath)) {
      try {
        const prJson = JSON.parse(fs.readFileSync(prPath, "utf8"));
        externalContext = {
          source: prJson.source ?? "github-convention",
          prNumber: prJson.prNumber ?? null,
          baseRef: prJson.baseRef ?? null,
        };
        const prPaths = Array.isArray(prJson.paths)
          ? prJson.paths.filter((p) => typeof p === "string" && p.trim().length > 0)
          : [];
        targetOverride = {
          commit: prJson.commit ?? null,
          diff: prJson.diff ?? null,
          paths: prPaths,
        };
        if (prPaths.length > 0) {
          prIncludeFiles = new Set(prPaths.map((p) => p.replace(/\\/g, "/").replace(/^\.\//, "")));
        }
      } catch {
        // Ignore malformed external PR context; standalone check still succeeds.
      }
    }
  }

  const resolvedTargetArg = targetArg
    ? path.relative(projectRoot, path.resolve(cwd, targetArg)) || "."
    : cwd !== projectRoot
      ? path.relative(projectRoot, cwd) || "."
      : null;

  const includeFiles =
    flags.staged || flags.changed
      ? collectGitTargetFiles(projectRoot, {
          staged: Boolean(flags.staged),
          changed: Boolean(flags.changed),
        })
      : !targetArg && prIncludeFiles
        ? prIncludeFiles
        : null;

  const result = runStaticChecks({
    cwd: projectRoot,
    targetPath: resolvedTargetArg,
    preset: effectivePreset,
    ruleFilter,
    includeFiles,
    rules,
    config,
  });

  const failed = flags.strict
    ? result.summary.must > 0 || result.summary.should > 0
    : result.summary.must > 0;

  if (flags.format === "review-result") {
    const conflicts = detectProjectConflicts({ cwd: projectRoot, config, detected });
    const reviewPayload = buildReviewResult({
      reviewerId: "dev-principles-static-check",
      scope: flags.staged ? "staged" : flags.changed ? "changed" : targetArg ?? "repository",
      target: targetOverride ?? { paths: targetArg ? [targetArg] : [] },
      status: failed ? "findings_reported" : "completed",
      checkedAreas: ["static-rules", `preset:${result.preset}`],
      findings: result.findings.map((f) => ({
        reviewerId: getOwnerReviewerForRule(f.ruleId),
        severity: f.severity,
        ruleId: f.ruleId,
        file: f.file,
        line: f.line,
        evidence: f.message,
        suggestion: f.suggestion,
      })),
      conflicts,
      unreviewedAreas: ["manual-contextual-review"],
      externalContext,
    });
    const serialized = `${JSON.stringify(reviewPayload, null, 2)}\n`;
    writeOutputIfRequested(flags.out, serialized);
    process.stdout.write(serialized);
    return failed ? 1 : 0;
  }

  if (flags.json) {
    const serialized = `${JSON.stringify({ ...result, ok: !failed }, null, 2)}\n`;
    writeOutputIfRequested(flags.out, serialized);
    process.stdout.write(serialized);
    return failed ? 1 : 0;
  }

  const textLines = [
    `dev-principles check (${projectRoot}) — preset: ${result.preset}, files: ${result.scannedFiles}`,
  ];
  for (const f of result.findings) {
    textLines.push(
      `[${f.severity.toUpperCase()}] [${f.ruleId}] ${f.file}:${f.line} — ${f.message}`,
      `  Suggestion: ${f.suggestion}`,
    );
  }
  textLines.push(
    `Summary: ${result.summary.total} findings (MUST: ${result.summary.must}, SHOULD: ${result.summary.should}, PREFER: ${result.summary.prefer})`,
  );
  const textOut = `${textLines.join("\n")}\n`;
  writeOutputIfRequested(flags.out, textOut);
  process.stdout.write(textOut);
  return failed ? 1 : 0;
};

const main = () => {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  if (flags.version) {
    process.stdout.write(`${readVersion()}\n`);
    return 0;
  }
  if (flags.help || positionals.length === 0) {
    printHelp();
    return 0;
  }

  const command = positionals[0];
  const rules = loadRules(REPO_ROOT);

  switch (command) {
    case "init":
      return runInit(flags);
    case "doctor":
      return runDoctor(flags, rules);
    case "list":
      return runList(flags, rules);
    case "explain":
      return runExplain(positionals[1], flags, rules);
    case "check":
      return runCheck(positionals[1], flags, rules);
    default:
      throw new Error(`Unknown command "${command}". Run "dev-principles --help" for usage.`);
  }
};

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
