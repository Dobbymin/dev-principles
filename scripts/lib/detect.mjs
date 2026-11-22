import fs from "node:fs";
import path from "node:path";

const PREFERRED_LIBS = ["react", "next", "@tanstack/react-query", "typescript", "zod", "zustand"];

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
  for (const lib of PREFERRED_LIBS) {
    if (deps[lib]) {
      detectedLibraries.push(lib === "next" ? "next.js" : lib);
    }
  }

  const localConventions = [];
  for (const fileName of [
    "AGENTS.md",
    "CLAUDE.md",
    "tsconfig.json",
    "eslint.config.js",
    "eslint.config.mjs",
    "biome.json",
  ]) {
    if (fs.existsSync(path.join(root, fileName))) {
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
    localConventions,
  };
};
