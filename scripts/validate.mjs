#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const MANIFEST_PATHS = [
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  ".codex-plugin/plugin.json",
  ".agents/plugins/marketplace.json",
  ".cursor-plugin/plugin.json",
  ".antigravity-plugin/plugin.json",
  "gemini-extension.json",
];

const MAX_SKILL_BYTES = 8192;
const MAX_SKILL_LINES = 150;

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

export const parseFrontmatter = (content, fileLabel) => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    throw new Error(`${fileLabel}: missing YAML frontmatter block`);
  }
  const fields = {};
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();

    // Handle multi-line folded/literal scalar (e.g. description: >)
    if (value === ">" || value === "|") {
      const blockLines = [];
      while (i + 1 < lines.length && /^[ \t]+/.test(lines[i + 1])) {
        i += 1;
        blockLines.push(lines[i].trim());
      }
      value = blockLines.join(" ").trim();
    } else if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }
  return fields;
};

const assertPathExists = (repoRoot, relPath, manifestRel, fieldName) => {
  if (typeof relPath !== "string" || relPath.trim().length === 0) {
    throw new Error(`${manifestRel}: "${fieldName}" must be a non-empty string`);
  }
  const resolved = path.resolve(repoRoot, path.normalize(relPath));
  if (!fs.existsSync(resolved)) {
    throw new Error(`${manifestRel}: "${fieldName}" points to missing path "${relPath}"`);
  }
};

export const validateRepo = (repoRoot = REPO_ROOT) => {
  const rootPkg = readJson(path.join(repoRoot, "package.json"));
  const expectedVersion = rootPkg.version;
  if (typeof expectedVersion !== "string" || expectedVersion.trim().length === 0) {
    throw new Error("package.json is missing a valid version");
  }
  if (rootPkg.name !== "dev-principles") {
    throw new Error(`package.json: expected name "dev-principles", got "${rootPkg.name}"`);
  }

  for (const relPath of MANIFEST_PATHS) {
    const fullPath = path.join(repoRoot, path.normalize(relPath));
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Missing manifest: ${relPath}`);
    }
    const manifest = readJson(fullPath);

    if (manifest.name !== "dev-principles") {
      throw new Error(`${relPath}: expected name "dev-principles", got "${manifest.name}"`);
    }

    if (relPath === ".claude-plugin/marketplace.json") {
      if (manifest.metadata?.version !== expectedVersion) {
        throw new Error(
          `${relPath}: metadata.version (${manifest.metadata?.version}) !== ${expectedVersion}`,
        );
      }
      if (!Array.isArray(manifest.plugins) || manifest.plugins.length === 0) {
        throw new Error(`${relPath}: plugins array must be non-empty`);
      }
      const primary = manifest.plugins[0];
      if (primary.name !== "dev-principles" || primary.version !== expectedVersion) {
        throw new Error(
          `${relPath}: plugins[0] must match name "dev-principles" and version ${expectedVersion}`,
        );
      }
      assertPathExists(repoRoot, primary.source, relPath, "plugins[0].source");
    } else if (relPath === ".agents/plugins/marketplace.json") {
      if (!Array.isArray(manifest.plugins) || manifest.plugins.length === 0) {
        throw new Error(`${relPath}: plugins array must be non-empty`);
      }
      const primary = manifest.plugins[0];
      if (primary.name !== "dev-principles") {
        throw new Error(`${relPath}: plugins[0].name must be "dev-principles"`);
      }
      if (primary.source?.path !== undefined) {
        assertPathExists(repoRoot, primary.source.path, relPath, "plugins[0].source.path");
      }
    } else if (manifest.version !== expectedVersion) {
      throw new Error(`${relPath}: version (${manifest.version}) !== ${expectedVersion}`);
    }

    if (manifest.skills !== undefined) {
      assertPathExists(repoRoot, manifest.skills, relPath, "skills");
    }
    if (manifest.hooks !== undefined) {
      assertPathExists(repoRoot, manifest.hooks, relPath, "hooks");
    }

    for (const [field, assetPath] of [
      ["icon", manifest.icon],
      ["logo", manifest.logo],
      ["interface.logo", manifest.interface?.logo],
    ]) {
      if (assetPath === undefined) continue;
      assertPathExists(repoRoot, assetPath, relPath, field);
      if (assetPath.toLowerCase().endsWith(".png")) {
        const buf = fs.readFileSync(path.resolve(repoRoot, path.normalize(assetPath)));
        const isPng =
          buf.length >= 24 &&
          buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        if (!isPng) {
          throw new Error(`${relPath}: "${field}" is not a valid PNG file (${assetPath})`);
        }
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);
        if (width !== height || width < 512) {
          throw new Error(
            `${relPath}: "${field}" must be a square PNG >= 512x512 (got ${width}x${height})`,
          );
        }
      }
    }

    if (relPath === "gemini-extension.json") {
      if (
        !manifest.contextFileName ||
        manifest.contextFileName === "GEMINI.md" ||
        manifest.contextFileName === "AGENTS.md"
      ) {
        throw new Error(
          `${relPath}: contextFileName must point to skill entry, not "${manifest.contextFileName}"`,
        );
      }
    }
  }

  // Validate config.schema.json
  const schemaPath = path.join(repoRoot, "schemas", "config.schema.json");
  if (!fs.existsSync(schemaPath)) {
    throw new Error("Missing schemas/config.schema.json");
  }
  const schema = readJson(schemaPath);
  if (schema.type !== "object" || !schema.properties?.version) {
    throw new Error("schemas/config.schema.json: invalid schema structure");
  }

  // Optional/staged checks for skills/, agents/, commands/, hooks/
  let skillCount = 0;
  const skillsDir = path.join(repoRoot, "skills");
  if (fs.existsSync(skillsDir)) {
    const skillEntries = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const skillName of skillEntries) {
      const skillFile = path.join(skillsDir, skillName, "SKILL.md");
      if (!fs.existsSync(skillFile)) {
        throw new Error(`skills/${skillName}: missing SKILL.md`);
      }
      const content = fs.readFileSync(skillFile, "utf8");
      const bytes = Buffer.byteLength(content, "utf8");
      const lines = content.split(/\r?\n/).length;
      if (bytes > MAX_SKILL_BYTES) {
        throw new Error(`skills/${skillName}/SKILL.md exceeds ${MAX_SKILL_BYTES} bytes (${bytes})`);
      }
      if (lines > MAX_SKILL_LINES) {
        throw new Error(`skills/${skillName}/SKILL.md exceeds ${MAX_SKILL_LINES} lines (${lines})`);
      }
      const fm = parseFrontmatter(content, `skills/${skillName}/SKILL.md`);
      if (fm.name !== skillName) {
        throw new Error(
          `skills/${skillName}/SKILL.md: frontmatter name "${fm.name}" !== "${skillName}"`,
        );
      }
      if (!fm.description || !fm.description.includes("Use ")) {
        throw new Error(
          `skills/${skillName}/SKILL.md: frontmatter description must include a "Use ..." trigger phrase`,
        );
      }
      skillCount += 1;
    }
  }

  let agentCount = 0;
  const agentsDir = path.join(repoRoot, "agents");
  if (fs.existsSync(agentsDir)) {
    const agentFiles = fs
      .readdirSync(agentsDir, { withFileTypes: true })
      .filter((f) => f.isFile() && f.name.endsWith(".md"))
      .map((f) => f.name)
      .sort();
    for (const fileName of agentFiles) {
      const content = fs.readFileSync(path.join(agentsDir, fileName), "utf8");
      const fm = parseFrontmatter(content, `agents/${fileName}`);
      for (const required of ["name", "description", "model"]) {
        if (!fm[required]) {
          throw new Error(`agents/${fileName}: missing frontmatter field "${required}"`);
        }
      }
      if (fm.tools !== undefined) {
        throw new Error(
          `agents/${fileName}: omit platform-specific "tools" field for cross-harness compatibility`,
        );
      }
      agentCount += 1;
    }
  }

  let commandCount = 0;
  const commandsDir = path.join(repoRoot, "commands");
  if (fs.existsSync(commandsDir)) {
    const commandFiles = fs
      .readdirSync(commandsDir, { withFileTypes: true })
      .filter((f) => f.isFile() && f.name.endsWith(".md"))
      .map((f) => f.name)
      .sort();
    for (const fileName of commandFiles) {
      const content = fs.readFileSync(path.join(commandsDir, fileName), "utf8");
      const fm = parseFrontmatter(content, `commands/${fileName}`);
      for (const required of ["description", "argument-hint"]) {
        if (!fm[required]) {
          throw new Error(`commands/${fileName}: missing frontmatter field "${required}"`);
        }
      }
      commandCount += 1;
    }
  }

  const hooksJsonPath = path.join(repoRoot, "hooks", "hooks.json");
  if (fs.existsSync(hooksJsonPath)) {
    const hooksJson = readJson(hooksJsonPath);
    if (!hooksJson.hooks || typeof hooksJson.hooks !== "object") {
      throw new Error("hooks/hooks.json: missing top-level 'hooks' object");
    }
    for (const [eventName, entries] of Object.entries(hooksJson.hooks)) {
      if (!Array.isArray(entries)) {
        throw new Error(`hooks/hooks.json: hooks.${eventName} must be an array`);
      }
      for (const entry of entries) {
        for (const hook of entry.hooks ?? []) {
          const cmd = String(hook.command ?? "");
          const refMatch = cmd.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s"']+)/g);
          if (refMatch) {
            for (const ref of refMatch) {
              const rel = ref.replace("${CLAUDE_PLUGIN_ROOT}/", "");
              assertPathExists(repoRoot, rel, "hooks/hooks.json", `hooks.${eventName}`);
            }
          }
        }
      }
    }
  }

  return {
    version: expectedVersion,
    manifests: MANIFEST_PATHS.length,
    skills: skillCount,
    agents: agentCount,
    commands: commandCount,
  };
};

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    const summary = validateRepo(REPO_ROOT);
    process.stdout.write(
      `Validated v${summary.version}: ${summary.manifests} manifests, ${summary.skills} skills, ${summary.agents} agents, ${summary.commands} commands.\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
