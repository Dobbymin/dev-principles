#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SKIP_DIRS = new Set(["node_modules", ".git", "_workspace", ".harness"]);

const FORBIDDEN_PLANNING_DOCS = new Set([
  "PRD.md",
  "SPEC.md",
  "ROADMAP.md",
  "decision-register.md",
  "dry-run-report.md",
  "IMPLEMENTATION-PLAN.md",
  "skill-draft.md",
]);

const collectMarkdownFiles = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMarkdownFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out.sort();
};

const stripCodeFences = (text) =>
  text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\r\n]+`/g, "");

export const gardenRepo = (repoRoot = REPO_ROOT) => {
  const issues = [];
  const mdFiles = collectMarkdownFiles(repoRoot);

  for (const filePath of mdFiles) {
    const relFile = path.relative(repoRoot, filePath).split(path.sep).join("/");
    const baseName = path.basename(filePath);

    // 1. Ensure planning/design docs stay in Obsidian wiki only
    if (FORBIDDEN_PLANNING_DOCS.has(baseName)) {
      issues.push(`${relFile}: planning/design document must not live in plugin repository`);
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const prose = stripCodeFences(raw);

    // 2. Check relative markdown links
    const linkRegex = /\[[^\]]*\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(prose)) !== null) {
      const targetRaw = match[1].trim().split(/\s+/)[0];
      if (
        !targetRaw ||
        targetRaw.startsWith("http://") ||
        targetRaw.startsWith("https://") ||
        targetRaw.startsWith("mailto:") ||
        targetRaw.startsWith("#")
      ) {
        continue;
      }
      const targetPathOnly = targetRaw.split("#")[0];
      if (!targetPathOnly) continue;
      const resolved = path.resolve(path.dirname(filePath), path.normalize(targetPathOnly));
      if (!fs.existsSync(resolved)) {
        issues.push(`${relFile}: broken relative link "${targetRaw}"`);
      }
    }

    // 3. Reject Obsidian [[wikilinks]] in runtime plugin/skill/agent/command/README docs
    if (
      relFile.startsWith("skills/") ||
      relFile.startsWith("agents/") ||
      relFile.startsWith("commands/") ||
      relFile === "README.md"
    ) {
      if (/\[\[[^\]\r\n]+\]\]/.test(prose)) {
        issues.push(`${relFile}: contains Obsidian [[wikilink]] syntax`);
      }
    }
  }

  // 4. Check orphan files in skills/, agents/, commands/
  const skillsDir = path.join(repoRoot, "skills");
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (entry.name === ".DS_Store") continue;
      if (!entry.isDirectory()) {
        issues.push(`skills/${entry.name}: unexpected non-directory entry`);
        continue;
      }
      const subEntries = fs.readdirSync(path.join(skillsDir, entry.name));
      for (const sub of subEntries) {
        if (sub === ".DS_Store") continue;
        if (sub !== "SKILL.md" && sub !== "references") {
          issues.push(`skills/${entry.name}/${sub}: unexpected file in skill directory`);
        }
      }
    }
  }

  for (const dirName of ["agents", "commands"]) {
    const dirPath = path.join(repoRoot, dirName);
    if (!fs.existsSync(dirPath)) continue;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.name === ".DS_Store") continue;
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        issues.push(`${dirName}/${entry.name}: expected .md file only`);
      }
    }
  }

  return { ok: issues.length === 0, checkedFiles: mdFiles.length, issues };
};

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const result = gardenRepo(REPO_ROOT);
  if (!result.ok) {
    for (const issue of result.issues) {
      process.stderr.write(`DRIFT: ${issue}\n`);
    }
    process.exit(1);
  }
  process.stdout.write(`Garden check OK (${result.checkedFiles} markdown files, 0 drift issues).\n`);
}
