import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMergedConfig } from "../scripts/lib/config.mjs";

const DEFAULT_PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VALID_CONTEXT_MODES = new Set(["auto", "compact", "full"]);

const LOCAL_CONVENTION_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".cursorrules",
  "tsconfig.json",
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  ".eslintrc",
  ".eslintrc.json",
  ".eslintrc.js",
  ".eslintrc.cjs",
  "biome.json",
  "biome.jsonc",
];

const COMPANION_SKILL_NAMES = ["using-github-convention", "github-convention"];
const PROJECT_SKILL_ROOTS = [".agents", ".claude", ".cursor", ".gemini"];
const GLOBAL_SKILL_ROOTS = [".agents", ".claude", ".cursor", ".codex", ".gemini"];

const safeExists = (targetPath) => {
  try {
    return Boolean(targetPath) && fs.existsSync(targetPath);
  } catch {
    return false;
  }
};

const safeReadFile = (targetPath) => {
  try {
    return fs.readFileSync(targetPath, "utf8");
  } catch {
    return null;
  }
};

const hasInstalledClaudePlugin = (installedPluginsPath, pluginName) => {
  const raw = safeReadFile(installedPluginsPath);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    const checkKeys = (obj) => {
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
      return Object.keys(obj).some(
        (key) => key === pluginName || key.startsWith(`${pluginName}@`),
      );
    };
    return checkKeys(parsed) || checkKeys(parsed.plugins);
  } catch {
    return false;
  }
};

const findProjectRoot = (startDir) => {
  let current = path.resolve(startDir);
  while (true) {
    if (
      safeExists(path.join(current, ".dev-principles.yaml")) ||
      safeExists(path.join(current, "package.json")) ||
      safeExists(path.join(current, "tsconfig.json")) ||
      safeExists(path.join(current, ".git"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
};

const extractPresetFromYaml = (yamlText) => {
  const match = yamlText.match(/^\s*preset:\s*([a-zA-Z0-9_-]+)/m);
  return match ? match[1] : "auto";
};

const stripFrontmatter = (markdown) =>
  markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, "").trim();

export const detectLocalConventions = (projectRoot) => {
  if (!projectRoot) return [];
  const found = [];
  for (const fileName of LOCAL_CONVENTION_FILES) {
    if (safeExists(path.join(projectRoot, fileName))) {
      found.push(fileName);
    }
  }
  return found;
};

const resolveHomeDir = (env) => {
  if (env && (env.HOME || env.USERPROFILE)) {
    return env.HOME || env.USERPROFILE;
  }
  if (env === process.env) {
    return os.homedir();
  }
  return null;
};

export const resolveContextMode = ({ env = process.env } = {}) => {
  const envMode = typeof env?.DEV_PRINCIPLES_CONTEXT_MODE === "string"
    ? env.DEV_PRINCIPLES_CONTEXT_MODE.trim().toLowerCase()
    : "";
  if (VALID_CONTEXT_MODES.has(envMode)) {
    return envMode;
  }
  return "auto";
};

export const detectCompanionPlugins = ({ cwd = process.cwd(), projectRoot = null, env = process.env } = {}) => {
  const signals = [];
  const resolvedCwd = path.resolve(cwd);
  const resolvedRoot = projectRoot ? path.resolve(projectRoot) : null;

  try {
    if (env?.GITHUB_CONVENTION_PLUGIN_ROOT) {
      signals.push("env:GITHUB_CONVENTION_PLUGIN_ROOT");
    }

    const searchBases = [resolvedCwd];
    if (resolvedRoot && resolvedRoot !== resolvedCwd) {
      searchBases.push(resolvedRoot);
    }

    for (const base of searchBases) {
      if (safeExists(path.join(base, ".github-convention", "config.yaml"))) {
        signals.push(`project-config:${path.join(base, ".github-convention", "config.yaml")}`);
      }
      for (const parent of PROJECT_SKILL_ROOTS) {
        for (const skillName of COMPANION_SKILL_NAMES) {
          const skillMd = path.join(base, parent, "skills", skillName, "SKILL.md");
          if (safeExists(skillMd)) {
            signals.push(`project-skill:${skillMd}`);
          }
        }
      }
    }

    const homeDir = resolveHomeDir(env);
    if (homeDir) {
      for (const rootName of GLOBAL_SKILL_ROOTS) {
        for (const skillName of COMPANION_SKILL_NAMES) {
          const skillMd = path.join(homeDir, rootName, "skills", skillName, "SKILL.md");
          if (safeExists(skillMd)) {
            signals.push(`global-skill:${skillMd}`);
          }
        }
      }

      const geminiExtPath = path.join(
        homeDir,
        ".gemini",
        "extensions",
        "github-convention",
        "gemini-extension.json",
      );
      if (safeExists(geminiExtPath)) {
        signals.push(`gemini-extension:${geminiExtPath}`);
      }

      const installedPluginsPath = path.join(homeDir, ".claude", "plugins", "installed_plugins.json");
      if (hasInstalledClaudePlugin(installedPluginsPath, "github-convention")) {
        signals.push(`claude-registry:${installedPluginsPath}`);
      }
    }
  } catch {
    return { companions: [], signals: [] };
  }

  const companions = signals.length > 0 ? ["github-convention"] : [];
  return { companions, signals };
};

const buildStandaloneDigest = ({ modeHeader, localConventions }) => {
  const lines = [
    modeHeader,
    "",
    "Priority: 1. Security invariants (SEC-01/SEC-02/DQ-04, no implicit destructive actions) > 2. Project config (.dev-principles.yaml) & official rules > 3. Global config > 4. dev-principles defaults.",
    "Conflict rule: Keep existing project rules on conflict and report `[Conflict] <RULE-ID> <-> <project rule> | cause: <cause> | reason: <why kept>`.",
  ];

  if (localConventions.length > 0) {
    lines.push(`Local conventions detected: ${localConventions.join(", ")}.`);
  }

  lines.push(
    "Core MUST: AI-01/03/05 (clarify ambiguity, surgical edits, Context7 MCP), TS-02 (no any), SOC-01/04/06 (SoC, unidirectional deps, no forced structure), DQ-02/04 (single apiClient, memory access token + skipAuthRefresh), SEC-01/02 (no secret exposure/XSS/injection), TEST-03 (fresh verification). Workflows: Track S/M/L.",
    "Progressive disclosure (load on demand by task):",
    "- Design/Implement: `skills/dev-principles/SKILL.md`, `references/workflow-guide.md`, `ai-workflow.md`, `clean-code.md`, `typescript.md`, `data-and-state.md`",
    "- Refactor: `references/clean-code.md`, `architecture-soc.md`, `performance-and-a11y.md`",
    "- General review: `references/review-checklist.md` + `agents/principles-reviewer.md`",
    "- Architecture review: `references/architecture-soc.md`, `presets/*.md` + `agents/architecture-reviewer.md`",
    "- Security review: `references/security-and-reliability.md`, `data-and-state.md` (`DQ-04`) + `agents/security-reviewer.md`",
    "Authority boundary: all reviewers & `structure-analyzer` are read-only; never create branches, commit, push, open/merge PRs, modify issues, or touch tags/releases implicitly.",
  );

  return lines.join("\n");
};

const buildCompactDigest = ({ modeHeader, localConventions, hasCompanion }) => {
  const header = hasCompanion
    ? `${modeHeader} | companion: github-convention (mutual compact).`
    : `${modeHeader} (compact mode).`;
  const lines = [
    header,
    "Scope: code design, Rule IDs, architecture/SoC, security invariants, presets (Git/PR deferred; orthogonal priority, project rules win; full dev-principles features active).",
  ];

  if (localConventions.length > 0) {
    lines.push(`Local rules: ${localConventions.join(", ")}.`);
  }

  lines.push(
    "MUST: AI-01/03/05, TS-02, SOC-01/04/06, DQ-02/04, SEC-01/02, TEST-03. Conflicts: [Conflict] ID <-> project rule | cause | reason.",
    "On-demand: SKILL.md + workflow-guide/clean-code/architecture-soc/security-and-reliability/review-checklist by task; reviewers/analyzer read-only.",
  );

  return lines.join("\n");
};

export const buildSessionStartPayload = ({
  cwd = process.cwd(),
  env = process.env,
  pluginRoot = DEFAULT_PLUGIN_ROOT,
} = {}) => {
  const projectRoot = findProjectRoot(cwd);
  const configInCwd = path.join(cwd, ".dev-principles.yaml");
  const configInRoot = projectRoot ? path.join(projectRoot, ".dev-principles.yaml") : null;
  const configPath = safeExists(configInCwd)
    ? configInCwd
    : configInRoot && safeExists(configInRoot)
      ? configInRoot
      : null;

  if (!projectRoot && !configPath) {
    return null;
  }

  let modeHeader;
  if (configPath) {
    let preset = "auto";
    let extraInfo = "";
    try {
      const loaded = loadMergedConfig({ cwd: path.dirname(configPath), env });
      preset = loaded.config.architecture?.preset ?? "auto";
      const overrideCount = Object.keys(loaded.config.rules ?? {}).length;
      const customCount = (loaded.config.customPrinciples ?? []).length;
      if (overrideCount > 0) extraInfo += `, overrides: ${overrideCount}`;
      if (customCount > 0) extraInfo += `, customPrinciples: ${customCount}`;
    } catch {
      preset = extractPresetFromYaml(safeReadFile(configPath) ?? "");
    }
    modeHeader = `dev-principles active (.dev-principles.yaml detected, preset: ${preset}${extraInfo}).`;
  } else {
    modeHeader = "dev-principles active (zero-config project detected, preset: auto).";
  }

  const skillPath = path.join(pluginRoot, "skills", "dev-principles", "SKILL.md");
  const hasSkillEntry = safeExists(skillPath);
  const localConventions = detectLocalConventions(projectRoot ?? path.resolve(cwd));
  const contextMode = resolveContextMode({ env });
  const { companions } = detectCompanionPlugins({
    cwd,
    projectRoot: projectRoot ?? path.resolve(cwd),
    env,
  });
  const hasCompanion = companions.includes("github-convention");

  let additionalContext;
  if (!hasSkillEntry) {
    additionalContext = `${modeHeader}\n\nFollow skills/dev-principles/SKILL.md.`;
  } else if (contextMode === "full") {
    const skillContent = stripFrontmatter(safeReadFile(skillPath) ?? "");
    const boundaryNote = hasCompanion
      ? "\n\nCompanion detected: github-convention (code design & Rule IDs stay with dev-principles; Git/GitHub workflow stays with github-convention)."
      : "";
    additionalContext = `${modeHeader}\n\n${skillContent}${boundaryNote}`;
  } else if (contextMode === "compact" || hasCompanion) {
    additionalContext = buildCompactDigest({ modeHeader, localConventions, hasCompanion });
  } else {
    additionalContext = buildStandaloneDigest({ modeHeader, localConventions });
  }

  if (env.CURSOR_PLUGIN_ROOT) {
    return { additional_context: additionalContext };
  }

  if (env.CLAUDE_PLUGIN_ROOT && !env.COPILOT_CLI) {
    return {
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext,
      },
    };
  }

  return { additionalContext };
};

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    const payload = buildSessionStartPayload();
    if (payload) {
      process.stdout.write(`${JSON.stringify(payload)}\n`);
    }
  } catch {
    // Never block session startup on hook errors.
  }
}
