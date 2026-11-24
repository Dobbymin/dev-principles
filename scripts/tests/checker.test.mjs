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

test("SEC-01 detects Stripe, Slack, and Google keys and skips placeholders", () => {
  const dir = makeTempDir();
  const rules = loadRules(REPO_ROOT);
  // Built at runtime so this file never contains a scannable secret literal.
  const stripe = ["sk", "live", "a1B2c3D4e5F6g7H8i9J0k1L2m3"].join("_");
  const stripeRestricted = ["rk", "live", "a1B2c3D4e5F6g7H8i9J0k1L2m3"].join("_");
  const slack = ["xoxb", "123456789012", "abcdefABCDEF"].join("-");
  const google = `AIza${"a1B2c3D4e5".repeat(3)}a1B2c`;
  const placeholder = ["sk", "live", "example1234567890123456789012"].join("_");
  try {
    writeFixtureFile(
      dir,
      "src/keys.ts",
      [
        `export const a = "${stripe}";`,
        `export const b = "${stripeRestricted}";`,
        `export const c = "${slack}";`,
        `export const d = "${google}";`,
        `export const e = "${placeholder}";`,
        "",
      ].join("\n"),
    );
    writeFixtureFile(dir, "src/keys.test.ts", `export const t = "${stripe}";\n`);

    const result = runStaticChecks({
      cwd: dir,
      preset: "feature-based",
      ruleFilter: "SEC-01",
      rules,
      config: { architecture: { preset: "feature-based", sourceRoot: "src" } },
    });
    const lines = result.findings.map((f) => `${f.file}:${f.line}`).sort();
    assert.equal(lines.length, 4);
    assert.deepEqual(lines, ["src/keys.ts:1", "src/keys.ts:2", "src/keys.ts:3", "src/keys.ts:4"]);
    assert.ok(result.findings.every((f) => f.ruleId === "SEC-01"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("checker parses multiline imports, validates --rule IDs, supports text --out, and filters by --pr-context paths", () => {
  const dir = makeTempDir();
  const rules = loadRules(REPO_ROOT);
  try {
    writeFixtureFile(
      dir,
      ".dev-principles.yaml",
      `version: 1\narchitecture:\n  preset: fsd\n  sourceRoot: src\n`,
    );
    writeFixtureFile(
      dir,
      "src/features/auth/model/login.ts",
      `export const loginUser = () => "ok";\nexport const extraHelper = () => "ok";\n`,
    );
    // Multiline import from entities -> features (FSD-01 + FSD-03)
    writeFixtureFile(
      dir,
      "src/entities/user/model/user.ts",
      [
        "import {",
        "  loginUser,",
        "  extraHelper,",
        '} from "../../../features/auth/model/login";',
        "export const user = loginUser();",
        "",
      ].join("\n"),
    );
    // Unrelated file with TS-02 violation
    writeFixtureFile(dir, "src/shared/legacy.ts", `export const oldVal: any = 1;\n`);

    const res = runStaticChecks({
      cwd: dir,
      preset: "fsd",
      rules,
      config: { architecture: { preset: "fsd", sourceRoot: "src" } },
    });
    assert.ok(res.findings.some((f) => f.ruleId === "FSD-01" && f.file === "src/entities/user/model/user.ts"));
    assert.ok(res.findings.some((f) => f.ruleId === "FSD-03" && f.file === "src/entities/user/model/user.ts"));

    // Invalid --rule ID fails immediately with clear error
    assert.throws(() => {
      execFileSync(process.execPath, [BIN_PATH, "check", "--cwd", dir, "--rule", "UNKNOWN-99"], {
        encoding: "utf8",
        stdio: "pipe",
      });
    }, /Unknown --rule "UNKNOWN-99"/);

    // Running check from nested subdirectory resolves ancestor config and scopes to subdirectory
    const subCwd = path.join(dir, "src", "shared");
    const textOutPath = path.join(dir, "reports", "check.txt");
    let subCheckErr = null;
    try {
      execFileSync(process.execPath, [BIN_PATH, "check", "--cwd", subCwd, "--out", textOutPath], {
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch (err) {
      subCheckErr = err;
    }
    assert.ok(subCheckErr);
    assert.equal(fs.existsSync(textOutPath), true);
    const savedText = fs.readFileSync(textOutPath, "utf8");
    assert.match(savedText, /preset: fsd, files: 1/);
    assert.match(savedText, /\[TS-02\] src\/shared\/legacy\.ts:1/);

    // --pr-context paths filter scopes static check only to listed PR files
    const prContextPath = path.join(dir, "pr-ctx.json");
    writeFixtureFile(
      dir,
      "pr-ctx.json",
      JSON.stringify({
        source: "github-convention",
        prNumber: 19,
        baseRef: "main",
        commit: "abc1234",
        paths: ["src/features/auth/model/login.ts"],
      }),
    );
    const prOut = JSON.parse(
      execFileSync(
        process.execPath,
        [BIN_PATH, "check", "--cwd", dir, "--format", "review-result", "--pr-context", prContextPath],
        { encoding: "utf8" },
      ),
    );
    assert.equal(prOut.status, "completed");
    assert.equal(prOut.findings.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("PR changed-files scope distinguishes 0/1/N files and rejects invalid --pr-context without falling back to full scan", () => {
  const dir = makeTempDir();
  try {
    writeFixtureFile(dir, "src/clean.ts", `export const ok = 1;\n`);
    writeFixtureFile(dir, "src/bad1.ts", `export const b1: any = 1;\n`);
    writeFixtureFile(dir, "src/bad2.ts", `export const b2: any = 2;\n`);

    const runCheckExpectFail = (args) => {
      let failed = false;
      let stdout = "";
      let stderr = "";
      try {
        execFileSync(process.execPath, [BIN_PATH, "check", "--cwd", dir, ...args], {
          encoding: "utf8",
          stdio: "pipe",
        });
      } catch (err) {
        failed = true;
        stdout = String(err.stdout ?? "");
        stderr = String(err.stderr ?? "");
      }
      assert.equal(failed, true, `Expected check to fail for args: ${args.join(" ")}`);
      return { stdout, stderr };
    };

    // 1. PR changed files = 0 (paths: []) -> MUST NOT scan src/bad1.ts or src/bad2.ts
    const emptyPrPath = path.join(dir, "pr-empty.json");
    writeFixtureFile(
      dir,
      "pr-empty.json",
      JSON.stringify({ source: "github-convention", prNumber: 10, baseRef: "main", paths: [] }),
    );
    const emptyJson = JSON.parse(
      execFileSync(process.execPath, [BIN_PATH, "check", "--cwd", dir, "--pr-context", emptyPrPath, "--json"], {
        encoding: "utf8",
      }),
    );
    assert.equal(emptyJson.ok, true);
    assert.equal(emptyJson.scannedFiles, 0);
    assert.deepEqual(emptyJson.findings, []);

    const emptyReview = JSON.parse(
      execFileSync(
        process.execPath,
        [BIN_PATH, "check", "--cwd", dir, "--format", "review-result", "--pr-context", emptyPrPath],
        { encoding: "utf8" },
      ),
    );
    assert.equal(emptyReview.status, "completed");
    assert.deepEqual(emptyReview.findings, []);
    assert.deepEqual(emptyReview.target.paths, []);

    const emptyText = execFileSync(
      process.execPath,
      [BIN_PATH, "check", "--cwd", dir, "--pr-context", emptyPrPath],
      { encoding: "utf8" },
    );
    assert.match(emptyText, /files: 0/);
    assert.match(emptyText, /Summary: 0 findings/);

    // 2. PR changed files = 1 (clean file -> 0 findings; bad1 -> only bad1)
    const oneCleanPath = path.join(dir, "pr-one-clean.json");
    writeFixtureFile(dir, "pr-one-clean.json", JSON.stringify({ paths: ["src/clean.ts"] }));
    const oneClean = JSON.parse(
      execFileSync(process.execPath, [BIN_PATH, "check", "--cwd", dir, "--pr-context", oneCleanPath, "--json"], {
        encoding: "utf8",
      }),
    );
    assert.equal(oneClean.ok, true);
    assert.equal(oneClean.scannedFiles, 1);
    assert.equal(oneClean.findings.length, 0);

    const oneBadPath = path.join(dir, "pr-one-bad.json");
    writeFixtureFile(dir, "pr-one-bad.json", JSON.stringify({ paths: ["src/bad1.ts"] }));
    const oneBadRes = runCheckExpectFail(["--pr-context", oneBadPath, "--json"]);
    const oneBad = JSON.parse(oneBadRes.stdout);
    assert.equal(oneBad.scannedFiles, 1);
    assert.deepEqual(
      oneBad.findings.map((f) => f.file),
      ["src/bad1.ts"],
    );

    // 3. PR changed files = multiple (clean + bad1 -> excludes bad2)
    const multiPath = path.join(dir, "pr-multi.json");
    writeFixtureFile(dir, "pr-multi.json", JSON.stringify({ paths: ["src/clean.ts", "src/bad1.ts"] }));
    const multiRes = runCheckExpectFail(["--pr-context", multiPath, "--json"]);
    const multi = JSON.parse(multiRes.stdout);
    assert.equal(multi.scannedFiles, 2);
    assert.deepEqual(
      multi.findings.map((f) => f.file),
      ["src/bad1.ts"],
    );

    // 4. Normal full project check (no --pr-context, no target) -> scans all 3 files
    const fullRes = runCheckExpectFail(["--json"]);
    const full = JSON.parse(fullRes.stdout);
    assert.equal(full.scannedFiles, 3);
    assert.deepEqual(
      full.findings.map((f) => f.file).sort(),
      ["src/bad1.ts", "src/bad2.ts"],
    );

    // 5. Explicit target file -> scans only that file
    const explicitRes = runCheckExpectFail(["src/bad1.ts", "--json"]);
    const explicit = JSON.parse(explicitRes.stdout);
    assert.equal(explicit.scannedFiles, 1);
    assert.deepEqual(
      explicit.findings.map((f) => f.file),
      ["src/bad1.ts"],
    );

    // 6. PR context error cases: missing file, parse error, missing required field, invalid formats
    const missingCtx = runCheckExpectFail(["--pr-context", path.join(dir, "does-not-exist.json"), "--json"]);
    assert.equal(missingCtx.stdout, "");
    assert.match(missingCtx.stderr, /PR context file not found/);

    const emptyFlagCtx = runCheckExpectFail(["--pr-context", "", "--json"]);
    assert.equal(emptyFlagCtx.stdout, "");
    assert.match(emptyFlagCtx.stderr, /Invalid --pr-context/);

    const badJsonPath = path.join(dir, "bad.json");
    writeFixtureFile(dir, "bad.json", "{not-json");
    const badJsonCtx = runCheckExpectFail(["--pr-context", badJsonPath, "--json"]);
    assert.equal(badJsonCtx.stdout, "");
    assert.match(badJsonCtx.stderr, /Failed to parse PR context JSON/);

    const invalidCases = [
      ["missing-paths.json", JSON.stringify({ source: "github-convention" }), /missing required field "paths"/],
      ["root-array.json", JSON.stringify(["src/clean.ts"]), /expected a JSON object/],
      ["paths-string.json", JSON.stringify({ paths: "src/clean.ts" }), /must be an array/],
      ["paths-nonstring.json", JSON.stringify({ paths: [123] }), /invalid path entry/],
      ["paths-empty-entry.json", JSON.stringify({ paths: [""] }), /invalid path entry/],
      ["paths-traversal.json", JSON.stringify({ paths: ["../escape.ts"] }), /invalid path entry/],
      ["bad-pr-number.json", JSON.stringify({ paths: [], prNumber: "42" }), /field "prNumber" has invalid type/],
    ];
    for (const [fileName, content, pattern] of invalidCases) {
      const p = path.join(dir, fileName);
      writeFixtureFile(dir, fileName, content);
      const errRes = runCheckExpectFail(["--pr-context", p, "--json"]);
      assert.equal(errRes.stdout, "");
      assert.match(errRes.stderr, pattern);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
