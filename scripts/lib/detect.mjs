import fs from "node:fs";
import path from "node:path";

const PREFERRED_LIBS = ["react", "next", "@tanstack/react-query", "typescript", "zod", "zustand"];
const TOOL_PACKAGES = [
  "eslint-plugin-boundaries",
  "dependency-cruiser",
  "steiger",
  "vitest",
  "jest",
  "@playwright/test",
];

const CONVENTION_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".cursorrules",
  "tsconfig.json",
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  ".eslintrc.json",
  ".eslintrc.js",
  ".eslintrc.cjs",
  "biome.json",
  ".dependency-cruiser.js",
  ".dependency-cruiser.cjs",
  ".dependency-cruiser.mjs",
  "steiger.config.ts",
  "steiger.config.js",
  "vitest.config.ts",
  "vitest.config.mjs",
  "jest.config.js",
  "jest.config.ts",
  "playwright.config.ts",
];

const readPackageJson = (projectRoot) => {
  const pkgPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch {
    return null;
  }
};

export const detectProject = (cwd = process.cwd()) => {
  const root = path.resolve(cwd);
  const pkg = readPackageJson(root);
  const deps = {
    ...(pkg?.dependencies ?? {}),
    ...(pkg?.devDependencies ?? {}),
  };

  const hasSrc = fs.existsSync(path.join(root, "src"));
  const sourceRoot = hasSrc ? "src" : ".";
  const baseDir = hasSrc ? path.join(root, "src") : root;

  const hasEntities = fs.existsSync(path.join(baseDir, "entities"));
  const hasFeatures = fs.existsSync(path.join(baseDir, "features"));
  const hasShared = fs.existsSync(path.join(baseDir, "shared"));
  const hasWidgets = fs.existsSync(path.join(baseDir, "widgets"));
  const hasViews = fs.existsSync(path.join(baseDir, "views"));
  const hasAppDir =
    fs.existsSync(path.join(root, "app")) || fs.existsSync(path.join(root, "src", "app"));
  const hasNext = Boolean(deps.next);

  let detectedPreset = "auto";
  if (hasEntities && (hasFeatures || hasWidgets || hasViews)) {
    detectedPreset = "fsd";
  } else if (hasNext && hasAppDir) {
    detectedPreset = "next-app-router";
  } else if (hasFeatures && hasShared) {
    detectedPreset = "feature-based";
  }

  const detectedLibraries = [];
  const detectedVersions = {};
  for (const lib of PREFERRED_LIBS) {
    if (deps[lib]) {
      const displayName = lib === "next" ? "next.js" : lib;
      detectedLibraries.push(displayName);
      detectedVersions[displayName] = deps[lib];
    }
  }

  const detectedTools = TOOL_PACKAGES.filter((tool) => Boolean(deps[tool]));

  const localConventions = [];
  for (const fileName of CONVENTION_FILES) {
    if (fs.existsSync(path.join(root, path.normalize(fileName)))) {
      localConventions.push(fileName);
    }
  }

  const hasGithubWorkflowConfig = fs.existsSync(
    path.join(root, ".github-convention", "config.yaml"),
  );

  return {
    root,
    sourceRoot,
    detectedPreset,
    detectedLibraries:
      detectedLibraries.length > 0
        ? detectedLibraries
        : ["react", "next.js", "@tanstack/react-query", "typescript"],
    detectedVersions,
    detectedTools,
    localConventions,
    hasGithubWorkflowConfig,
  };
};

const NO_FSD_PATTERN = /\bNO\s+FSD\b|FSD\s*(?:금지|사용\s*안\s*함|미사용)/i;

export const detectProjectConflicts = ({ cwd = process.cwd(), config, detected } = {}) => {
  const resolvedDetected = detected ?? detectProject(cwd);
  const root = resolvedDetected.root;
  const configuredPreset = config?.architecture?.preset ?? "auto";
  const effectivePreset =
    configuredPreset === "auto" ? resolvedDetected.detectedPreset : configuredPreset;

  const conflicts = [];

  if (
    configuredPreset !== "auto" &&
    resolvedDetected.detectedPreset !== "auto" &&
    configuredPreset !== resolvedDetected.detectedPreset
  ) {
    conflicts.push({
      ruleId: "SOC-06",
      projectRule: `기존 디렉터리 구조 (${resolvedDetected.detectedPreset})`,
      cause: `설정된 preset(${configuredPreset})이 감지된 기존 프로젝트 구조(${resolvedDetected.detectedPreset})와 불일치`,
      reasonKept:
        "기존 프로젝트 구조 우선 정책(SOC-06)에 따라 구조를 강제 변경하지 않고 충돌을 명시",
    });
  }

  if (effectivePreset === "fsd") {
    for (const fileName of ["AGENTS.md", "CLAUDE.md"]) {
      const filePath = path.join(root, fileName);
      if (!fs.existsSync(filePath)) continue;
      let content = "";
      try {
        content = fs.readFileSync(filePath, "utf8");
      } catch {
        continue;
      }
      if (NO_FSD_PATTERN.test(content)) {
        conflicts.push({
          ruleId: "FSD-01",
          projectRule: `${fileName} (NO FSD / FSD 금지)`,
          cause: `프로젝트 공식 문서(${fileName})가 FSD 미사용을 명시했으나 fsd 프리셋이 활성화됨`,
          reasonKept: `프로젝트 공식 규칙(${fileName})이 기본 프리셋보다 우선하므로 기존 프로젝트 규칙 유지`,
        });
      }
    }
  }

  return conflicts;
};
