import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const findProjectRoot = (startDir) => {
  let current = path.resolve(startDir);
  while (true) {
    if (
      fs.existsSync(path.join(current, ".dev-principles.yaml")) ||
      fs.existsSync(path.join(current, "package.json")) ||
      fs.existsSync(path.join(current, "tsconfig.json")) ||
      fs.existsSync(path.join(current, ".git"))
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

export const buildSessionStartPayload = ({
  cwd = process.cwd(),
  env = process.env,
  pluginRoot = DEFAULT_PLUGIN_ROOT,
} = {}) => {
  const projectRoot = findProjectRoot(cwd);
  const configInCwd = path.join(cwd, ".dev-principles.yaml");
  const configInRoot = projectRoot ? path.join(projectRoot, ".dev-principles.yaml") : null;
  const configPath = fs.existsSync(configInCwd)
    ? configInCwd
    : configInRoot && fs.existsSync(configInRoot)
      ? configInRoot
      : null;

  if (!projectRoot && !configPath) {
    return null;
  }

  const skillPath = path.join(pluginRoot, "skills", "dev-principles", "SKILL.md");
  const skillContent = fs.existsSync(skillPath)
    ? fs.readFileSync(skillPath, "utf8").trim()
    : "Follow skills/dev-principles/SKILL.md.";

  const modeHeader = configPath
    ? `dev-principles active (.dev-principles.yaml detected, preset: ${extractPresetFromYaml(fs.readFileSync(configPath, "utf8"))}).`
    : "dev-principles active (zero-config project detected, preset: auto).";

  const additionalContext = `${modeHeader}\n\n${skillContent}`;

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
