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
  };
};
