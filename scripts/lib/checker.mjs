import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { SECURITY_INVARIANTS } from "./rules.mjs";

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const TS_EXTENSIONS = new Set([".ts", ".tsx"]);
const DEFAULT_IGNORE_SEGMENTS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "components/ui",
  "shared/ui",
];

const FSD_LAYER_RANK = {
  app: 0,
  pages: 1,
  views: 1,
  widgets: 2,
  features: 3,
  entities: 4,
  shared: 5,
};

const FB_LAYER_RANK = {
  app: 0,
  pages: 1,
  features: 2,
  shared: 3,
};

const toPosix = (p) => p.split(path.sep).join("/");

const isTestFile = (posixRel) =>
  /(^|\/)__tests__\//.test(posixRel) ||
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(posixRel);

const shouldIgnore = (posixRel, ignorePatterns) => {
  for (const seg of DEFAULT_IGNORE_SEGMENTS) {
    if (
      posixRel === seg ||
      posixRel.startsWith(`${seg}/`) ||
      posixRel.includes(`/${seg}/`)
    ) {
      return true;
    }
  }
  for (const rawPattern of ignorePatterns) {
    const pattern = toPosix(String(rawPattern)).replace(/^\/+|\/+$/g, "");
    if (!pattern) continue;
    if (posixRel === pattern || posixRel.startsWith(`${pattern}/`) || posixRel.includes(`/${pattern}/`)) {
      return true;
    }
  }
  return false;
};

const collectCodeFiles = (dir, rootDir, ignorePatterns, out = []) => {
  if (!fs.existsSync(dir)) return out;
  const stat = fs.statSync(dir);
  if (stat.isFile()) {
    const rel = toPosix(path.relative(rootDir, dir));
    if (CODE_EXTENSIONS.has(path.extname(dir)) && !shouldIgnore(rel, ignorePatterns)) {
      out.push(dir);
    }
    return out;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = toPosix(path.relative(rootDir, full));
    if (shouldIgnore(rel, ignorePatterns)) continue;
    if (entry.isDirectory()) {
      collectCodeFiles(full, rootDir, ignorePatterns, out);
    } else if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out.sort();
};

const scanSourceKeepLines = (text, { maskStrings = false, maskRegex = false } = {}) => {
  const out = [];
  const len = text.length;
  let state = "code"; // code | lineComment | blockComment | single | double | template | regex
  let inRegexClass = false;

  const emitMasked = (ch) => {
    out.push(ch === "\n" ? "\n" : " ");
  };

  for (let i = 0; i < len; i += 1) {
    const ch = text[i];
    const next = i + 1 < len ? text[i + 1] : "";

    if (state === "lineComment") {
      if (ch === "\n") {
        state = "code";
        out.push("\n");
      } else {
        out.push(" ");
      }
      continue;
    }

    if (state === "blockComment") {
      if (ch === "*" && next === "/") {
        out.push(" ", " ");
        i += 1;
        state = "code";
      } else {
        emitMasked(ch);
      }
      continue;
    }

    if (state === "single" || state === "double" || state === "template") {
      const quote = state === "single" ? "'" : state === "double" ? '"' : "`";
      if (ch === "\\") {
        if (maskStrings) {
          emitMasked(ch);
          if (i + 1 < len) emitMasked(next);
        } else {
          out.push(ch);
          if (i + 1 < len) out.push(next);
        }
        i += 1;
        continue;
      }
      if (ch === quote) {
        state = "code";
      }
      if (maskStrings) emitMasked(ch);
      else out.push(ch);
      continue;
    }

    if (state === "regex") {
      if (ch === "\\") {
        if (maskRegex) {
          emitMasked(ch);
          if (i + 1 < len) emitMasked(next);
        } else {
          out.push(ch);
          if (i + 1 < len) out.push(next);
        }
        i += 1;
        continue;
      }
      if (ch === "[") inRegexClass = true;
      else if (ch === "]" && inRegexClass) inRegexClass = false;
      else if (ch === "/" && !inRegexClass) {
        state = "code";
      } else if (ch === "\n") {
        state = "code";
        out.push("\n");
        continue;
      }
      if (maskRegex) emitMasked(ch);
      else out.push(ch);
      continue;
    }

    // state === "code"
    if (ch === "/" && next === "/") {
      out.push(" ", " ");
      i += 1;
      state = "lineComment";
    } else if (ch === "/" && next === "*") {
      out.push(" ", " ");
      i += 1;
      state = "blockComment";
    } else if (ch === "'") {
      state = "single";
      if (maskStrings) out.push(" ");
      else out.push(ch);
    } else if (ch === '"') {
      state = "double";
      if (maskStrings) out.push(" ");
      else out.push(ch);
    } else if (ch === "`") {
      state = "template";
      if (maskStrings) out.push(" ");
      else out.push(ch);
    } else if (ch === "/") {
      // Heuristic: regex literal if preceded by operator/delimiter/keyword
      let j = i - 1;
      while (j >= 0 && (text[j] === " " || text[j] === "\t")) j -= 1;
      const prev = j >= 0 ? text[j] : "";
      if (prev === "" || "(=,:;!&|?{[+\n~^%".includes(prev)) {
        state = "regex";
        inRegexClass = false;
        if (maskRegex) out.push(" ");
        else out.push(ch);
      } else {
        out.push(ch);
      }
    } else {
      out.push(ch);
    }
  }

  return out.join("");
};

const maskCommentsKeepLines = (text) => scanSourceKeepLines(text, { maskStrings: false, maskRegex: false });

const maskCommentsAndStringsKeepLines = (text) =>
  scanSourceKeepLines(text, { maskStrings: true, maskRegex: true });

const indexToLine = (text, index) => text.slice(0, index).split("\n").length;

const hasUseClientDirective = (text) => {
  const firstNonEmpty = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("/*"));
  return firstNonEmpty === '"use client";' || firstNonEmpty === "'use client';" || firstNonEmpty === '"use client"' || firstNonEmpty === "'use client'";
};

const parseImports = (text) => {
  const masked = maskCommentsKeepLines(text);
  const imports = [];
  const regex = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^;"'\n]+?\s+from\s+)?["']([^"'\n]+)["']/g;
  let match;
  while ((match = regex.exec(masked)) !== null) {
    imports.push({
      specifier: match[1],
      line: indexToLine(masked, match.index + 1),
    });
  }
  return imports;
};

const stripJsonCommentsAndTrailingCommas = (text) => {
  const withoutComments = scanSourceKeepLines(text, { maskStrings: false, maskRegex: false });
  // Remove trailing commas only outside strings by scanning quotes
  let out = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < withoutComments.length; i += 1) {
    const ch = withoutComments[i];
    if (inString) {
      out += ch;
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < withoutComments.length && /\s/.test(withoutComments[j])) j += 1;
      if (withoutComments[j] === "}" || withoutComments[j] === "]") {
        continue;
      }
    }
    out += ch;
  }
  return out;
};

const readTsconfigObject = (filePath, depth = 0) => {
  if (depth > 3 || !fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(stripJsonCommentsAndTrailingCommas(fs.readFileSync(filePath, "utf8")));
    if (!parsed || typeof parsed !== "object") return null;

    let baseOpts = {};
    let baseOriginDir = path.dirname(filePath);
    if (typeof parsed.extends === "string" && (parsed.extends.startsWith("./") || parsed.extends.startsWith("../"))) {
      let parentPath = path.resolve(path.dirname(filePath), parsed.extends);
      if (!parentPath.endsWith(".json") && fs.existsSync(`${parentPath}.json`)) {
        parentPath = `${parentPath}.json`;
      }
      const parentObj = readTsconfigObject(parentPath, depth + 1);
      if (parentObj) {
        baseOpts = parentObj.compilerOptions ?? {};
        baseOriginDir = parentObj.baseOriginDir;
      }
    }

    const ownOpts = parsed.compilerOptions ?? {};
    const mergedOpts = {
      ...baseOpts,
      ...ownOpts,
      paths: {
        ...(baseOpts.paths ?? {}),
        ...(ownOpts.paths ?? {}),
      },
    };
    return {
      compilerOptions: mergedOpts,
      baseOriginDir: ownOpts.baseUrl !== undefined ? path.dirname(filePath) : baseOriginDir,
    };
  } catch {
    return null;
  }
};

export const loadTsconfigAliases = (rootDir) => {
  const candidates = [path.join(rootDir, "tsconfig.json"), path.join(rootDir, "jsconfig.json")];
  const configPath = candidates.find((p) => fs.existsSync(p));
  if (!configPath) return null;

  const loaded = readTsconfigObject(configPath);
  if (!loaded) return null;

  const { compilerOptions, baseOriginDir } = loaded;
  const baseUrl = typeof compilerOptions.baseUrl === "string" ? compilerOptions.baseUrl : ".";
  const baseDir = path.resolve(baseOriginDir, baseUrl);
  const pathsMap = compilerOptions.paths ?? {};
  const entries = [];

  for (const [pattern, rawTargets] of Object.entries(pathsMap)) {
    if (!Array.isArray(rawTargets) || rawTargets.length === 0) continue;
    const starIdx = pattern.indexOf("*");
    const hasWildcard = starIdx !== -1;
    const prefix = hasWildcard ? pattern.slice(0, starIdx) : pattern;
    const suffix = hasWildcard ? pattern.slice(starIdx + 1) : "";
    entries.push({
      pattern,
      hasWildcard,
      prefix,
      suffix,
      targets: rawTargets.filter((t) => typeof t === "string" && t.trim().length > 0),
    });
  }

  // Prefer more specific prefixes first
  entries.sort((a, b) => b.prefix.length - a.prefix.length);
  return { baseDir, entries };
};

const resolveCandidateFile = (candidateBase) => {
  const candidates = [
    candidateBase,
    ...["ts", "tsx", "js", "jsx", "mjs"].map((ext) => `${candidateBase}.${ext}`),
    ...["ts", "tsx", "js", "jsx", "mjs"].map((ext) => path.join(candidateBase, `index.${ext}`)),
  ];
  for (const cand of candidates) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
      return cand;
    }
  }
  return null;
};

const resolveLocalImport = (fromFile, specifier, rootDir, sourceRootRel, tsAliases = null) => {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const base = path.resolve(path.dirname(fromFile), specifier);
    const resolved = resolveCandidateFile(base) ?? base;
    return toPosix(path.relative(rootDir, resolved));
  }

  if (tsAliases && tsAliases.entries.length > 0) {
    for (const entry of tsAliases.entries) {
      let captured = "";
      if (!entry.hasWildcard) {
        if (specifier !== entry.pattern) continue;
      } else {
        if (!specifier.startsWith(entry.prefix) || !specifier.endsWith(entry.suffix)) continue;
        captured = specifier.slice(entry.prefix.length, specifier.length - entry.suffix.length);
      }

      let fallbackBase = null;
      for (const target of entry.targets) {
        const mapped = entry.hasWildcard ? target.replace("*", captured) : target;
        const base = path.resolve(tsAliases.baseDir, mapped);
        if (!fallbackBase) fallbackBase = base;
        const resolved = resolveCandidateFile(base);
        if (resolved) {
          return toPosix(path.relative(rootDir, resolved));
        }
      }
      if (fallbackBase) {
        return toPosix(path.relative(rootDir, fallbackBase));
      }
    }
  }

  let candidateBase = null;
  if (specifier.startsWith("@/") || specifier.startsWith("~/")) {
    const sub = specifier.slice(2);
    candidateBase = path.resolve(rootDir, sourceRootRel === "." ? "" : sourceRootRel, sub);
  } else {
    return null;
  }

  const resolved = resolveCandidateFile(candidateBase) ?? candidateBase;
  return toPosix(path.relative(rootDir, resolved));
};

export const collectGitTargetFiles = (cwd, { staged = false, changed = false } = {}) => {
  const rootDir = fs.realpathSync(path.resolve(cwd));
  let gitRoot;
  try {
    gitRoot = fs.realpathSync(
      execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: rootDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim(),
    );
  } catch {
    throw new Error("--staged/--changed requires a git repository.");
  }

  const runGitLines = (args) => {
    const out = execFileSync("git", args, {
      cwd: gitRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  };

  const gitFiles = new Set();
  if (staged) {
    for (const f of runGitLines(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])) {
      gitFiles.add(f);
    }
  }
  if (changed) {
    for (const f of runGitLines(["diff", "--name-only", "--diff-filter=ACMR"])) {
      gitFiles.add(f);
    }
    for (const f of runGitLines(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])) {
      gitFiles.add(f);
    }
    for (const f of runGitLines(["ls-files", "--others", "--exclude-standard"])) {
      gitFiles.add(f);
    }
  }

  const resolvedFiles = new Set();
  for (const gitRel of gitFiles) {
    const abs = path.resolve(gitRoot, path.normalize(gitRel));
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    const relToCwd = toPosix(path.relative(rootDir, abs));
    if (!relToCwd || relToCwd.startsWith("../") || relToCwd === "..") continue;
    if (CODE_EXTENSIONS.has(path.extname(abs))) {
      resolvedFiles.add(relToCwd);
    }
  }

  return resolvedFiles;
};

const stripSourceRoot = (posixRel, sourceRootRel) => {
  if (sourceRootRel && sourceRootRel !== "." && posixRel.startsWith(`${sourceRootRel}/`)) {
    return posixRel.slice(sourceRootRel.length + 1);
  }
  return posixRel;
};

const parseLayerSlice = (relInsideRoot, layerSet) => {
  const parts = relInsideRoot.split("/");
  if (parts.length === 0 || !layerSet.has(parts[0])) return null;
  const layer = parts[0];
  const slice = parts.length >= 2 ? parts[1].replace(/\.[cm]?[jt]sx?$/, "") : null;
  const rest = parts.slice(2);
  return { layer, slice, rest, parts };
};

export const runStaticChecks = ({
  cwd = process.cwd(),
  targetPath = null,
  preset = null,
  ruleFilter = null,
  includeFiles = null,
  rules = [],
  config = {},
} = {}) => {
  const rootDir = path.resolve(cwd);
  const sourceRootRel = toPosix(config?.architecture?.sourceRoot ?? "src").replace(/^\.\/|\/+$/g, "") || ".";
  const activePreset = preset ?? config?.architecture?.preset ?? "auto";
  const ignorePatterns = config?.ignore ?? [];
  const ruleOverrides = config?.rules ?? {};
  const ruleById = new Map(rules.map((r) => [r.id, r]));

  const includeSet = includeFiles ? new Set([...includeFiles].map((f) => toPosix(f))) : null;
  if (includeSet && includeSet.size === 0) {
    return {
      ok: true,
      preset: activePreset,
      sourceRoot: sourceRootRel,
      scannedFiles: 0,
      summary: { total: 0, must: 0, should: 0, prefer: 0 },
      findings: [],
    };
  }

  const tsAliases = loadTsconfigAliases(rootDir);

  const isRuleEnabled = (ruleId) => {
    if (ruleFilter && ruleFilter !== ruleId) return false;
    if (SECURITY_INVARIANTS.has(ruleId)) return true;
    return ruleOverrides[ruleId] !== "off";
  };

  const effectiveSeverityOf = (ruleId, fallback = "must") => {
    if (SECURITY_INVARIANTS.has(ruleId)) return "must";
    const override = ruleOverrides[ruleId];
    if (override && override !== "off") return override;
    return ruleById.get(ruleId)?.severity ?? fallback;
  };

  const scanRoot = targetPath ? path.resolve(rootDir, targetPath) : rootDir;
  const files = collectCodeFiles(scanRoot, rootDir, ignorePatterns);
  const findings = [];

  const pushFinding = (ruleId, file, line, message, suggestion) => {
    if (!isRuleEnabled(ruleId)) return;
    if (includeSet && !includeSet.has(file)) return;
    const ruleMeta = ruleById.get(ruleId);
    findings.push({
      ruleId,
      severity: effectiveSeverityOf(ruleId),
      file,
      line,
      message,
      why: ruleMeta?.why || message,
      suggestion,
    });
  };

  const graph = new Map();

  for (const absFile of files) {
    const rel = toPosix(path.relative(rootDir, absFile));
    const ext = path.extname(absFile);
    const raw = fs.readFileSync(absFile, "utf8");
    const testFile = isTestFile(rel);
    const dtsFile = rel.endsWith(".d.ts");
    const noComments = maskCommentsKeepLines(raw);
    const noCommentsNoStrings = maskCommentsAndStringsKeepLines(raw);

    // 1. SEC-01: Secret patterns (non-test)
    if (!testFile && isRuleEnabled("SEC-01")) {
      const secretPatterns = [
        { name: "AWS Access Key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
        { name: "GitHub Token", regex: /\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})\b/g },
        { name: "Anthropic/OpenAI API Key", regex: /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/g },
        { name: "Private Key Block", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
      ];
      for (const { name, regex } of secretPatterns) {
        let m;
        while ((m = regex.exec(raw)) !== null) {
          const snippet = m[0].toLowerCase();
          if (snippet.includes("example") || snippet.includes("dummy") || snippet.includes("placeholder")) {
            continue;
          }
          pushFinding(
            "SEC-01",
            rel,
            indexToLine(raw, m.index),
            `Potential hardcoded secret detected (${name}).`,
            "Move credentials to environment variables or a secret manager.",
          );
        }
      }
    }

    // 2. SEC-02: Dangerous execution / XSS sinks (non-test)
    if (!testFile && isRuleEnabled("SEC-02")) {
      const dangerousPatterns = [
        { label: "dangerouslySetInnerHTML", regex: new RegExp("\\bdangerouslySetInnerHTML\\b", "g") },
        { label: "eval()", regex: new RegExp("\\beval\\s*\\(", "g") },
        { label: "new Function()", regex: new RegExp("\\bnew\\s+Function\\s*\\(", "g") },
      ];
      for (const { label, regex } of dangerousPatterns) {
        let m;
        while ((m = regex.exec(noCommentsNoStrings)) !== null) {
          pushFinding(
            "SEC-02",
            rel,
            indexToLine(noCommentsNoStrings, m.index),
            `Unsafe execution or HTML injection sink detected (${label}).`,
            "Avoid dynamic code execution and sanitize untrusted HTML with a trusted sanitizer.",
          );
        }
      }
    }

    // 3. DQ-04: Auth token storage in localStorage / sessionStorage
    if (!testFile && isRuleEnabled("DQ-04")) {
      const storageRegex =
        /\b(?:localStorage|sessionStorage)\.(?:setItem\s*\(\s*["'`]([^"'`]+)["'`]|([a-zA-Z0-9_]+)\s*=)/g;
      let m;
      while ((m = storageRegex.exec(noComments)) !== null) {
        const keyName = m[1] ?? m[2] ?? "";
        if (/token|jwt|auth|session|access_?token|refresh_?token|bearer/i.test(keyName)) {
          pushFinding(
            "DQ-04",
            rel,
            indexToLine(noComments, m.index),
            `Auth token/session key "${keyName}" stored in Web Storage.`,
            "Keep access tokens in memory and refresh tokens in httpOnly Secure cookies.",
          );
        }
      }
    }

    // 4. TS-02: any / as any in TS production files
    if (!testFile && !dtsFile && TS_EXTENSIONS.has(ext) && isRuleEnabled("TS-02")) {
      const anyRegex = /(:\s*any\b|<any>|\bas\s+any\b)/g;
      let m;
      while ((m = anyRegex.exec(noCommentsNoStrings)) !== null) {
        pushFinding(
          "TS-02",
          rel,
          indexToLine(noCommentsNoStrings, m.index),
          `Prohibited "${m[1].trim()}" type usage detected.`,
          "Replace `any` with `unknown` + type narrowing or isolate third-party `.d.ts` defects in one adapter.",
        );
      }
    }

    // 5. DQ-02: Raw fetch / axios outside api-client / server / scripts
    const isHttpClientExempt =
      testFile ||
      /(^|\/)(api-client|http-client|fetcher)\b/i.test(rel) ||
      /\.server\.[cm]?[jt]sx?$/.test(rel) ||
      /(^|\/)app\/api\//.test(rel) ||
      /(^|\/)scripts\//.test(rel);
    if (!isHttpClientExempt && isRuleEnabled("DQ-02")) {
      const rawHttpRegex = /(?:^|[^.\w])(fetch\s*\(|axios(?:\.[a-z]+|\s*\())/gm;
      let m;
      while ((m = rawHttpRegex.exec(noCommentsNoStrings)) !== null) {
        pushFinding(
          "DQ-02",
          rel,
          indexToLine(noCommentsNoStrings, m.index),
          `Direct "${m[1].replace(/\s*\($/, "")}" call outside single apiClient entry point.`,
          "Route HTTP calls through the centralized apiClient module.",
        );
      }
    }

    // 6. Imports & Architecture checks
    const fileImports = parseImports(raw);
    const localDeps = [];

    // Next.js App Router checks
    if (activePreset === "next-app-router") {
      if (/(^|\/)layout\.[jt]sx$/.test(rel) && hasUseClientDirective(raw)) {
        pushFinding(
          "NEXT-01",
          rel,
          1,
          "Top-level layout file declares 'use client'.",
          "Keep layout.tsx as a Server Component and push 'use client' down to interactive leaf components.",
        );
      }
      if (hasUseClientDirective(raw)) {
        for (const imp of fileImports) {
          if (
            imp.specifier === "server-only" ||
            imp.specifier === "next/headers" ||
            /\.server(\.[cm]?[jt]sx?)?$/.test(imp.specifier)
          ) {
            pushFinding(
              "NEXT-04",
              rel,
              imp.line,
              `Client Component imports server-only module "${imp.specifier}".`,
              "Keep server loaders and secrets out of client bundles.",
            );
          }
        }
      }
    }

    for (const imp of fileImports) {
      const resolvedRel = resolveLocalImport(absFile, imp.specifier, rootDir, sourceRootRel, tsAliases);
      if (!resolvedRel || resolvedRel.startsWith("..")) continue;
      localDeps.push(resolvedRel);

      const fromInside = stripSourceRoot(rel, sourceRootRel);
      const toInside = stripSourceRoot(resolvedRel, sourceRootRel);

      if (activePreset === "fsd") {
        const fromInfo = parseLayerSlice(fromInside, new Set(Object.keys(FSD_LAYER_RANK)));
        const toInfo = parseLayerSlice(toInside, new Set(Object.keys(FSD_LAYER_RANK)));
        if (fromInfo && toInfo) {
          const fromRank = FSD_LAYER_RANK[fromInfo.layer];
          const toRank = FSD_LAYER_RANK[toInfo.layer];

          if (fromRank > toRank) {
            pushFinding(
              "FSD-01",
              rel,
              imp.line,
              `Reverse FSD layer import: "${fromInfo.layer}" imports "${toInfo.layer}" (${imp.specifier}).`,
              "Dependencies must flow strictly top-down (app -> pages/views -> widgets -> features -> entities -> shared).",
            );
          } else if (
            fromInfo.layer === toInfo.layer &&
            ["widgets", "features", "entities"].includes(fromInfo.layer) &&
            fromInfo.slice &&
            toInfo.slice &&
            fromInfo.slice !== toInfo.slice
          ) {
            const isAtX =
              fromInfo.layer === "entities" &&
              toInfo.rest[0] === "@x";
            if (!isAtX) {
              pushFinding(
                "FSD-02",
                rel,
                imp.line,
                `Cross-slice import in "${fromInfo.layer}": "${fromInfo.slice}" imports "${toInfo.slice}".`,
                "Avoid direct same-layer slice imports; lift shared logic or use entities/@x/<consumer> for entities.",
              );
            }
          }

          if (
            ["widgets", "features", "entities"].includes(toInfo.layer) &&
            toInfo.slice &&
            (fromInfo.layer !== toInfo.layer || fromInfo.slice !== toInfo.slice) &&
            toInfo.rest.length > 0 &&
            !(toInfo.rest.length === 1 && /^index\.[cm]?[jt]sx?$/.test(toInfo.rest[0])) &&
            !(toInfo.layer === "entities" && toInfo.rest[0] === "@x")
          ) {
            pushFinding(
              "FSD-03",
              rel,
              imp.line,
              `Deep internal import bypasses slice Public API: "${imp.specifier}".`,
              `Import from "${toInfo.layer}/${toInfo.slice}" index.ts Public API instead.`,
            );
          }
        }
      } else if (activePreset === "feature-based") {
        const fromInfo = parseLayerSlice(fromInside, new Set(Object.keys(FB_LAYER_RANK)));
        const toInfo = parseLayerSlice(toInside, new Set(Object.keys(FB_LAYER_RANK)));
        if (fromInfo && toInfo) {
          const fromRank = FB_LAYER_RANK[fromInfo.layer];
          const toRank = FB_LAYER_RANK[toInfo.layer];

          if (fromInfo.layer === "shared" && fromRank > toRank) {
            pushFinding(
              "FB-01",
              rel,
              imp.line,
              `Reverse import from "shared" to "${toInfo.layer}" (${imp.specifier}).`,
              "Keep shared independent of features, pages, and app.",
            );
          } else if (
            fromInfo.layer === "features" &&
            toInfo.layer === "features" &&
            fromInfo.slice &&
            toInfo.slice &&
            fromInfo.slice !== toInfo.slice
          ) {
            pushFinding(
              "FB-02",
              rel,
              imp.line,
              `Cross-feature import: "${fromInfo.slice}" imports "${toInfo.slice}".`,
              "Extract shared types/helpers to shared/ or compose in pages/.",
            );
          }

          if (
            toInfo.layer === "features" &&
            toInfo.slice &&
            (fromInfo.layer !== "features" || fromInfo.slice !== toInfo.slice) &&
            toInfo.rest.length > 0 &&
            !(toInfo.rest.length === 1 && /^index\.[cm]?[jt]sx?$/.test(toInfo.rest[0]))
          ) {
            pushFinding(
              "FB-04",
              rel,
              imp.line,
              `External import bypasses feature Public API: "${imp.specifier}".`,
              `Import from "features/${toInfo.slice}" index.ts instead.`,
            );
          }
        }
      }
    }

    graph.set(rel, localDeps);
  }

  // 7. SOC-04: Circular dependency DFS detection
  if (isRuleEnabled("SOC-04")) {
    const visited = new Set();
    const inStack = new Set();
    const stack = [];
    const seenCycles = new Set();

    const dfs = (node) => {
      visited.add(node);
      inStack.add(node);
      stack.push(node);

      for (const next of graph.get(node) ?? []) {
        if (!graph.has(next)) continue;
        if (!visited.has(next)) {
          dfs(next);
        } else if (inStack.has(next)) {
          const cycleStart = stack.indexOf(next);
          const cycleNodes = [...stack.slice(cycleStart), next];
          const canonical = [...cycleNodes.slice(0, -1)].sort().join("->");
          if (!seenCycles.has(canonical)) {
            seenCycles.add(canonical);
            const targetCycleNode =
              includeSet ? cycleNodes.find((n) => includeSet.has(n)) ?? null : next;
            if (targetCycleNode) {
              pushFinding(
                "SOC-04",
                targetCycleNode,
                1,
                `Circular dependency detected: ${cycleNodes.join(" -> ")}`,
                "Break the cycle by extracting shared abstractions to a lower layer.",
              );
            }
          }
        }
      }

      stack.pop();
      inStack.delete(node);
    };

    for (const node of [...graph.keys()].sort()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.ruleId.localeCompare(b.ruleId));

  const summary = {
    total: findings.length,
    must: findings.filter((f) => f.severity === "must").length,
    should: findings.filter((f) => f.severity === "should").length,
    prefer: findings.filter((f) => f.severity === "prefer").length,
  };

  const scannedFilesCount = includeSet
    ? files.filter((f) => includeSet.has(toPosix(path.relative(rootDir, f)))).length
    : files.length;

  return {
    ok: summary.must === 0,
    preset: activePreset,
    sourceRoot: sourceRootRel,
    scannedFiles: scannedFilesCount,
    summary,
    findings,
  };
};
