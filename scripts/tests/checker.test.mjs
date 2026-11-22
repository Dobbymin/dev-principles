import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runStaticChecks } from "../lib/checker.mjs";
import { loadRules } from "../lib/rules.mjs";
import { REPO_ROOT } from "../validate.mjs";

const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "dp-checker-test-"));
const BIN_PATH = path.join(REPO_ROOT, "bin", "dev-principles.mjs");

const writeFixtureFile = (root, relPath, content) => {
  const full = path.join(root, path.normalize(relPath));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
};

test("dev-principles check CLI supports --json, --rule, --strict, and exit codes", () => {
  const dir = makeTempDir();
  const rules = loadRules(REPO_ROOT);
  try {
    writeFixtureFile(
      dir,
      "src/app.ts",
      `export function parse(input: any) { return input; }\n`,
    );

    // MUST violation exits with 1
    let failed = false;
    try {
      execFileSync(process.execPath, [BIN_PATH, "check", "--cwd", dir, "--json"], {
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch (err) {
      failed = true;
      const parsed = JSON.parse(err.stdout);
      assert.equal(parsed.ok, false);
      assert.equal(parsed.summary.must, 1);
      assert.equal(parsed.findings[0].ruleId, "TS-02");
      assert.equal(parsed.findings[0].file, "src/app.ts");
    }
    assert.equal(failed, true);

    // --rule filter for a non-violating rule exits 0
    const cleanOut = execFileSync(
      process.execPath,
      [BIN_PATH, "check", "--cwd", dir, "--rule", "SEC-01", "--json"],
      { encoding: "utf8" },
    );
    const cleanParsed = JSON.parse(cleanOut);
    assert.equal(cleanParsed.ok, true);
    assert.equal(cleanParsed.summary.total, 0);

    // Test SHOULD-only violation with --strict vs default
    const fbDir = makeTempDir();
    try {
      writeFixtureFile(fbDir, "src/features/auth/ui/Login.tsx", `export const Login = () => null;\n`);
      writeFixtureFile(
        fbDir,
        "src/pages/Home.tsx",
        `import { Login } from "../features/auth/ui/Login";\nexport default Login;\n`,
      );

      const defaultRes = runStaticChecks({
        cwd: fbDir,
        preset: "feature-based",
        rules,
        config: { architecture: { preset: "feature-based", sourceRoot: "src" } },
      });
      assert.equal(defaultRes.findings.some((f) => f.ruleId === "FB-04"), true);

      // Default check passes (FB-04 is SHOULD, not MUST)
      const nonStrictOut = execFileSync(
        process.execPath,
        [BIN_PATH, "check", "--cwd", fbDir, "--preset", "feature-based", "--json"],
        { encoding: "utf8" },
      );
      assert.equal(JSON.parse(nonStrictOut).ok, true);

      // --strict fails on SHOULD
      assert.throws(() => {
        execFileSync(
          process.execPath,
          [BIN_PATH, "check", "--cwd", fbDir, "--preset", "feature-based", "--strict"],
          { encoding: "utf8", stdio: "pipe" },
        );
      });
    } finally {
      fs.rmSync(fbDir, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("checker resolves tsconfig.json custom paths, baseUrl, JSONC, and local extends", () => {
  const dir = makeTempDir();
  const rules = loadRules(REPO_ROOT);
  try {
    writeFixtureFile(
      dir,
      "tsconfig.base.json",
      `{
  // Base config with trailing comma
  "compilerOptions": {
    "baseUrl": "./packages/web",
    "paths": {
      "@shared/*": ["shared/*"],
    }
  },
}
`,
    );
    writeFixtureFile(
      dir,
      "tsconfig.json",
      `{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "paths": {
      "@features/*": ["features/*"],
      "@entities/*": ["entities/*"],
      "@auth": ["features/auth/index.ts"],
    }
  }
}
`,
    );
    writeFixtureFile(dir, "packages/web/shared/format.ts", `export const fmt = (s: string) => s;\n`);
    writeFixtureFile(dir, "packages/web/features/auth/index.ts", `export { login } from "./model/login";\n`);
    writeFixtureFile(
      dir,
      "packages/web/features/auth/model/login.ts",
      `import { fmt } from "@shared/format";\nexport const login = () => fmt("ok");\n`,
    );
    // Violation: entity imports feature via custom @auth exact alias -> FSD-01
    writeFixtureFile(
      dir,
      "packages/web/entities/user/model/user.ts",
      `import { login } from "@auth";\nexport const u = login;\n`,
    );
    // Violation: deep internal import via @features/* -> FSD-03
    writeFixtureFile(
      dir,
      "packages/web/pages/home.tsx",
      `import { login } from "@features/auth/model/login";\nexport default login;\n`,
    );

    const res = runStaticChecks({
      cwd: dir,
      preset: "fsd",
      rules,
      config: { architecture: { preset: "fsd", sourceRoot: "packages/web" } },
    });
    const hitRules = new Set(res.findings.map((f) => f.ruleId));
    assert.equal(hitRules.has("FSD-01"), true);
    assert.equal(hitRules.has("FSD-03"), true);
    assert.equal(
      res.findings.some((f) => f.file === "packages/web/features/auth/model/login.ts"),
      false,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("dev-principles check --staged and --changed scope to git changes", () => {
  const dir = makeTempDir();
  const git = (args) =>
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

  try {
    git(["init"]);
    // Existing committed file with a TS-02 violation (should be ignored by --staged/--changed)
    writeFixtureFile(dir, "src/legacy.ts", `export const legacy: any = 1;\n`);
    writeFixtureFile(dir, "src/clean.ts", `export const clean = 1;\n`);
    git(["add", "."]);
    git(["commit", "-m", "initial"]);

    // Modify clean.ts to introduce a TS-02 violation and stage it
    writeFixtureFile(dir, "src/clean.ts", `export const clean: any = 2;\n`);
    git(["add", "src/clean.ts"]);

    // Untracked file with TS-02 violation (ignored by --staged, caught by --changed)
    writeFixtureFile(dir, "src/untracked.ts", `export const extra: any = 3;\n`);

    let stagedErr = null;
    try {
      execFileSync(process.execPath, [BIN_PATH, "check", "--cwd", dir, "--staged", "--json"], {
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch (err) {
      stagedErr = JSON.parse(err.stdout);
    }
    assert.ok(stagedErr);
    assert.equal(stagedErr.scannedFiles, 1);
    assert.deepEqual(
      stagedErr.findings.map((f) => f.file),
      ["src/clean.ts"],
    );

    let changedErr = null;
    try {
      execFileSync(process.execPath, [BIN_PATH, "check", "--cwd", dir, "--changed", "--json"], {
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch (err) {
      changedErr = JSON.parse(err.stdout);
    }
    assert.ok(changedErr);
    assert.equal(changedErr.scannedFiles, 2);
    assert.deepEqual(
      changedErr.findings.map((f) => f.file).sort(),
      ["src/clean.ts", "src/untracked.ts"],
    );

    // Staged cycle with existing committed file is still caught for SOC-04
    writeFixtureFile(dir, "src/a.ts", `import { b } from "./b"; export const a = b;\n`);
    writeFixtureFile(dir, "src/b.ts", `export const b = 1;\n`);
    git(["add", "src/a.ts", "src/b.ts"]);
    git(["commit", "-m", "add a and b"]);
    writeFixtureFile(dir, "src/b.ts", `import { a } from "./a"; export const b = a;\n`);
    git(["add", "src/b.ts"]);
    // Reset clean.ts and remove untracked.ts so only src/b.ts is staged
    git(["checkout", "HEAD", "--", "src/clean.ts"]);
    fs.rmSync(path.join(dir, "src", "untracked.ts"));

    let cycleErr = null;
    try {
      execFileSync(process.execPath, [BIN_PATH, "check", "--cwd", dir, "--staged", "--json"], {
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch (err) {
      cycleErr = JSON.parse(err.stdout);
    }
    assert.ok(cycleErr);
    assert.equal(cycleErr.findings.some((f) => f.ruleId === "SOC-04"), true);

    // Non-code staged file returns ok: true, scannedFiles: 0
    git(["checkout", "HEAD", "--", "src/b.ts"]);
    writeFixtureFile(dir, "README.md", "# Docs\n");
    git(["add", "README.md"]);
    const docsOnly = JSON.parse(
      execFileSync(process.execPath, [BIN_PATH, "check", "--cwd", dir, "--staged", "--json"], {
        encoding: "utf8",
      }),
    );
    assert.equal(docsOnly.ok, true);
    assert.equal(docsOnly.scannedFiles, 0);

    // Non-git directory throws clear error
    const nonGitDir = makeTempDir();
    try {
      assert.throws(() => {
        execFileSync(process.execPath, [BIN_PATH, "check", "--cwd", nonGitDir, "--staged"], {
          encoding: "utf8",
          stdio: "pipe",
        });
      });
    } finally {
      fs.rmSync(nonGitDir, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
