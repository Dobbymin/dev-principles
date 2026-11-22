import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SECURITY_INVARIANTS } from "./rules.mjs";

const VALID_PRESETS = new Set(["auto", "feature-based", "fsd", "next-app-router"]);
const VALID_CONTEXT7_MODES = new Set(["auto", "strict", "off"]);
const VALID_SEVERITIES = new Set(["must", "should", "prefer", "off"]);
const TOP_LEVEL_KEYS = new Set([
  "version",
  "architecture",
  "context7",
  "rules",
  "customPrinciples",
]);
const ARCH_KEYS = new Set(["preset", "sourceRoot"]);
const CONTEXT7_KEYS = new Set(["mode", "preferredLibraries"]);

export const DEFAULT_CONFIG = {
  version: 1,
  architecture: {
    preset: "auto",
    sourceRoot: "src",
  },
  context7: {
    mode: "auto",
    preferredLibraries: ["react", "next.js", "@tanstack/react-query", "typescript"],
  },
  rules: {},
  customPrinciples: [],
};

const stripInlineComment = (raw) => {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble && (i === 0 || /\s/.test(raw[i - 1]))) {
      return raw.slice(0, i).trim();
    }
  }
  return raw.trim();
};

const parseScalar = (raw) => {
  const val = stripInlineComment(raw);
  if (val === "[]") return [];
  if (val === "{}") return {};
  if (val === "true") return true;
  if (val === "false") return false;
  if (/^-?\d+$/.test(val)) return Number(val);
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    return val.slice(1, -1);
  }
  return val;
};

export const parseYamlConfig = (yamlText) => {
  const lines = yamlText.replace(/\r\n/g, "\n").split("\n");
  const root = {};
  const stack = [{ indent: -1, container: root, keyInParent: null, parent: null }];

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const withoutComment = stripInlineComment(rawLine);
    if (!withoutComment) continue;

    const indent = rawLine.match(/^(\s*)/)[1].length;
    const trimmed = withoutComment;

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const top = stack[stack.length - 1];

    if (trimmed.startsWith("- ")) {
      const itemVal = parseScalar(trimmed.slice(2));
      if (!Array.isArray(top.container)) {
        if (top.parent && top.keyInParent) {
          const arr = [];
          top.parent[top.keyInParent] = arr;
          top.container = arr;
        } else {
          throw new Error(`Invalid YAML list item at line ${i + 1}`);
        }
      }
      top.container.push(itemVal);
      continue;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      throw new Error(`Invalid YAML syntax at line ${i + 1}: "${trimmed}"`);
    }

    const key = parseScalar(trimmed.slice(0, colonIdx));
    const rest = trimmed.slice(colonIdx + 1).trim();

    if (rest === "") {
      const childObj = {};
      top.container[key] = childObj;
      stack.push({ indent, container: childObj, keyInParent: key, parent: top.container });
    } else {
      top.container[key] = parseScalar(rest);
    }
  }

  return root;
};

const isPlainObject = (val) => typeof val === "object" && val !== null && !Array.isArray(val);

export const mergeConfigs = (base, override) => {
  if (!override) return structuredClone(base);
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    if (Array.isArray(value)) {
      result[key] = [...value];
    } else if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeConfigs(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
};

export const getGlobalConfigPath = (env = process.env) => {
  const base = env.XDG_CONFIG_HOME
    ? path.resolve(env.XDG_CONFIG_HOME)
    : path.join(os.homedir(), ".config");
  return path.join(base, "dev-principles", "config.yaml");
};

export const loadMergedConfig = ({ cwd = process.cwd(), env = process.env, globalPath } = {}) => {
  const resolvedGlobal = globalPath ?? getGlobalConfigPath(env);
  const projectPath = path.join(path.resolve(cwd), ".dev-principles.yaml");

  let globalConfig = null;
  let projectConfig = null;
  const parseErrors = [];

  if (fs.existsSync(resolvedGlobal)) {
    try {
      globalConfig = parseYamlConfig(fs.readFileSync(resolvedGlobal, "utf8"));
    } catch (error) {
      parseErrors.push(`Global config parse error (${resolvedGlobal}): ${error.message}`);
    }
  }

  if (fs.existsSync(projectPath)) {
    try {
      projectConfig = parseYamlConfig(fs.readFileSync(projectPath, "utf8"));
    } catch (error) {
      parseErrors.push(`Project config parse error (${projectPath}): ${error.message}`);
    }
  }

  let merged = mergeConfigs(DEFAULT_CONFIG, globalConfig);
  merged = mergeConfigs(merged, projectConfig);

  return {
    config: merged,
    hasGlobal: Boolean(globalConfig),
    hasProject: Boolean(projectConfig),
    globalPath: resolvedGlobal,
    projectPath,
    parseErrors,
  };
};

export const validateConfig = (config, knownRuleIds) => {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(config)) {
    return { errors: ["Configuration must be a YAML mapping object."], warnings };
  }

  for (const key of Object.keys(config)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      warnings.push(`Unknown top-level config key "${key}".`);
    }
  }

  if (config.version !== 1) {
    errors.push(`"version" must be 1 (got ${JSON.stringify(config.version)}).`);
  }

  if (config.architecture !== undefined) {
    if (!isPlainObject(config.architecture)) {
      errors.push('"architecture" must be an object.');
    } else {
      for (const key of Object.keys(config.architecture)) {
        if (!ARCH_KEYS.has(key)) {
          warnings.push(`Unknown key "architecture.${key}".`);
        }
      }
      if (
        config.architecture.preset !== undefined &&
        !VALID_PRESETS.has(config.architecture.preset)
      ) {
        errors.push(
          `Invalid architecture.preset "${config.architecture.preset}". Expected one of: ${[...VALID_PRESETS].join(", ")}.`,
        );
      }
      if (
        config.architecture.sourceRoot !== undefined &&
        (typeof config.architecture.sourceRoot !== "string" ||
          config.architecture.sourceRoot.trim().length === 0)
      ) {
        errors.push('"architecture.sourceRoot" must be a non-empty string.');
      }
    }
  }

  if (config.context7 !== undefined) {
    if (!isPlainObject(config.context7)) {
      errors.push('"context7" must be an object.');
    } else {
      for (const key of Object.keys(config.context7)) {
        if (!CONTEXT7_KEYS.has(key)) {
          warnings.push(`Unknown key "context7.${key}".`);
        }
      }
      if (config.context7.mode !== undefined && !VALID_CONTEXT7_MODES.has(config.context7.mode)) {
        errors.push(
          `Invalid context7.mode "${config.context7.mode}". Expected one of: ${[...VALID_CONTEXT7_MODES].join(", ")}.`,
        );
      }
      if (
        config.context7.preferredLibraries !== undefined &&
        (!Array.isArray(config.context7.preferredLibraries) ||
          config.context7.preferredLibraries.some((item) => typeof item !== "string" || !item))
      ) {
        errors.push('"context7.preferredLibraries" must be an array of non-empty strings.');
      }
    }
  }

  if (config.rules !== undefined) {
    if (!isPlainObject(config.rules)) {
      errors.push('"rules" must be a mapping of Rule ID to severity.');
    } else {
      for (const [ruleId, severity] of Object.entries(config.rules)) {
        if (!knownRuleIds.has(ruleId)) {
          errors.push(`Unknown Rule ID "${ruleId}" in rules overrides.`);
        }
        if (!VALID_SEVERITIES.has(severity)) {
          errors.push(
            `Invalid severity "${severity}" for "${ruleId}". Expected: must, should, prefer, off.`,
          );
        }
        if (SECURITY_INVARIANTS.has(ruleId) && severity === "off") {
          warnings.push(
            `Security invariant "${ruleId}" cannot be disabled via "off"; core token-storage rule remains active.`,
          );
        }
      }
    }
  }

  if (
    config.customPrinciples !== undefined &&
    (!Array.isArray(config.customPrinciples) ||
      config.customPrinciples.some((item) => typeof item !== "string" || !item))
  ) {
    errors.push('"customPrinciples" must be an array of non-empty strings.');
  }

  return { errors, warnings };
};
