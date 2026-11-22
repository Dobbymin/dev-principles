#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMergedConfig, validateConfig } from "../scripts/lib/config.mjs";
import { detectProject } from "../scripts/lib/detect.mjs";
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
      Validate configuration, Rule IDs, security invariants, and detect local conflicts.

  list [--category <prefix>] [--severity <level>] [--preset <name>] [--cwd <dir>] [--json]
      List effective rules for the current project.

  explain <RULE-ID> [--cwd <dir>] [--json]
      Show detailed rule contract, rationale, and example for a Rule ID.

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
    } else if (arg === "--dry-run" || arg === "--json" || arg === "--force") {
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
  const loaded = loadMergedConfig({ cwd });
  const knownIds = new Set(rules.map((r) => r.id));
  const validation = validateConfig(loaded.config, knownIds);
  const errors = [...loaded.parseErrors, ...validation.errors];
  const warnings = [...validation.warnings];
  const detected = detectProject(cwd);

  const report = {
    ok: errors.length === 0,
    cwd,
    config: {
      hasGlobal: loaded.hasGlobal,
      hasProject: loaded.hasProject,
      preset: loaded.config.architecture?.preset ?? "auto",
    },
    detected,
    errors,
    warnings,
  };

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`dev-principles doctor (${cwd})\n`);
    process.stdout.write(`- Config: project=${loaded.hasProject ? ".dev-principles.yaml" : "none (zero-config)"}, global=${loaded.hasGlobal ? "yes" : "none"}\n`);
    process.stdout.write(`- Active preset: ${report.config.preset} (detected: ${detected.detectedPreset}, sourceRoot: ${detected.sourceRoot})\n`);
    if (detected.localConventions.length > 0) {
      process.stdout.write(`- Local conventions: ${detected.localConventions.join(", ")}\n`);
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

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(effective, null, 2)}\n`);
    return 0;
  }

  for (const rule of effective) {
    const mark = rule.overridden ? ` (default: ${rule.defaultSeverity})` : "";
    process.stdout.write(
      `[${rule.effectiveSeverity.toUpperCase()}] ${rule.id} — ${rule.title}${mark}\n`,
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
  if (found.scope) process.stdout.write(`Scope: ${found.scope}\n`);
  if (found.rule) process.stdout.write(`Rule: ${found.rule}\n`);
  if (found.why) process.stdout.write(`Why: ${found.why}\n`);
  if (found.example) process.stdout.write(`\nExample:\n${found.example}\n`);
  process.stdout.write(`Source: ${found.sourceFile}\n`);
  return 0;
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
