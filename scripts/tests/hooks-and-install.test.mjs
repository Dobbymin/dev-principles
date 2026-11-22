import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildSessionStartPayload, detectCompanionPlugins } from "../../hooks/session-start.mjs";
import { REPO_ROOT } from "../validate.mjs";

const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "dp-hooks-test-"));
const FULL_SKILL_BYTES = Buffer.byteLength(
  fs.readFileSync(path.join(REPO_ROOT, "skills", "dev-principles", "SKILL.md"), "utf8"),
  "utf8",
);

const runExpectFailure = (cmd, args, options = {}) => {
  let failed = false;
  let stderr = "";
  try {
    execFileSync(cmd, args, { encoding: "utf8", stdio: "pipe", ...options });
  } catch (err) {
    failed = true;
    stderr = String(err.stderr ?? "");
  }
  assert.equal(failed, true, `Expected command to fail: ${cmd} ${args.join(" ")}`);
  return stderr;
};

const resolvePosixShell = () => {
  if (process.platform !== "win32") {
    return "sh";
  }
  const candidates = [
    "C:\\Program Files\\Git\\bin\\sh.exe",
    "C:\\Program Files\\Git\\usr\\bin\\sh.exe",
    "C:\\Program Files (x86)\\Git\\bin\\sh.exe",
    "sh",
  ];
  for (const candidate of candidates) {
    try {
      const out = execFileSync(candidate, ["-c", "echo ok"], { encoding: "utf8", stdio: "pipe" });
      if (out.trim() === "ok") {
        return candidate;
      }
    } catch {
      // Try next candidate
    }
  }
  return null;
};

const canCreateShellSymlink = (shPath) => {
  if (!shPath) return false;
  const dir = makeTempDir();
  try {
    const src = path.join(dir, "src");
    const dst = path.join(dir, "dst");
    fs.mkdirSync(src, { recursive: true });
    execFileSync(
      shPath,
      ["-c", 'MSYS="winsymlinks:nativestrict" ln -s "$1" "$2" && [ -L "$2" ]', "_", src, dst],
      { encoding: "utf8", stdio: "pipe" },
    );
    return fs.lstatSync(dst).isSymbolicLink();
  } catch {
    return false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

const POSIX_SHELL = resolvePosixShell();

test("buildSessionStartPayload returns null outside projects without config", () => {
  const dir = makeTempDir();
  try {
    const payload = buildSessionStartPayload({ cwd: dir, env: {}, pluginRoot: REPO_ROOT });
    assert.equal(payload, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("buildSessionStartPayload standalone mode emits Progressive Disclosure digest per platform", () => {
  const dir = makeTempDir();
  const fakeHome = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, "package.json"), '{"name":"demo"}\n');
    fs.writeFileSync(path.join(dir, "AGENTS.md"), "# Rules\n");

    const claudePayload = buildSessionStartPayload({
      cwd: dir,
      env: { CLAUDE_PLUGIN_ROOT: REPO_ROOT, HOME: fakeHome },
      pluginRoot: REPO_ROOT,
    });
    assert.equal(claudePayload.hookSpecificOutput.hookEventName, "SessionStart");
    const claudeCtx = claudePayload.hookSpecificOutput.additionalContext;
    assert.match(claudeCtx, /zero-config project detected/);
    assert.doesNotMatch(claudeCtx, /^---/m);
    assert.match(claudeCtx, /Local conventions detected: AGENTS\.md/);
    assert.match(claudeCtx, /Design\/Implement:/);
    assert.match(claudeCtx, /Refactor:/);
    assert.match(claudeCtx, /General review:/);
    assert.match(claudeCtx, /Architecture review:/);
    assert.match(claudeCtx, /Security review:/);
    assert.match(claudeCtx, /Authority boundary:/);
    assert.ok(Buffer.byteLength(claudeCtx, "utf8") < FULL_SKILL_BYTES);

    const cursorPayload = buildSessionStartPayload({
      cwd: dir,
      env: { CURSOR_PLUGIN_ROOT: REPO_ROOT, HOME: fakeHome },
      pluginRoot: REPO_ROOT,
    });
    assert.ok(typeof cursorPayload.additional_context === "string");

    fs.writeFileSync(
      path.join(dir, ".dev-principles.yaml"),
      `version: 1
architecture:
  preset: fsd
rules:
  CC-04: off
customPrinciples:
  - docs/local.md
`,
    );
    const defaultPayload = buildSessionStartPayload({
      cwd: dir,
      env: { HOME: fakeHome },
      pluginRoot: REPO_ROOT,
    });
    assert.match(
      defaultPayload.additionalContext,
      /\.dev-principles\.yaml detected, preset: fsd, overrides: 1, customPrinciples: 1/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }
});

test("SessionStart hook executes directly via node CLI without error", () => {
  const dir = makeTempDir();
  const fakeHome = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, "package.json"), '{"name":"cli-hook-demo"}\n');
    const stdout = execFileSync(
      process.execPath,
      [path.join(REPO_ROOT, "hooks", "session-start.mjs")],
      {
        cwd: dir,
        env: { ...process.env, HOME: fakeHome, CLAUDE_PLUGIN_ROOT: REPO_ROOT },
        encoding: "utf8",
      },
    );
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
    assert.match(parsed.hookSpecificOutput.additionalContext, /dev-principles active/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }
});

test("buildSessionStartPayload detects github-convention companion and supports mutual compaction & context modes", () => {
  const projectDir = makeTempDir();
  const fakeHome = makeTempDir();
  try {
    fs.writeFileSync(path.join(projectDir, "package.json"), '{"name":"co-demo"}\n');

    const standalonePayload = buildSessionStartPayload({
      cwd: projectDir,
      env: { HOME: fakeHome },
      pluginRoot: REPO_ROOT,
    });
    const standaloneBytes = Buffer.byteLength(standalonePayload.additionalContext, "utf8");

    // 1. Project .github-convention/config.yaml
    const ghConfigDir = path.join(projectDir, ".github-convention");
    fs.mkdirSync(ghConfigDir, { recursive: true });
    const ghConfigPath = path.join(ghConfigDir, "config.yaml");
    fs.writeFileSync(ghConfigPath, "version: 1\n");

    const coConfigPayload = buildSessionStartPayload({
      cwd: projectDir,
      env: { HOME: fakeHome },
      pluginRoot: REPO_ROOT,
    });
    const coBytes = Buffer.byteLength(coConfigPayload.additionalContext, "utf8");
    assert.match(coConfigPayload.additionalContext, /companion: github-convention \(mutual compact\)/);
    assert.match(coConfigPayload.additionalContext, /full dev-principles features active/);
    assert.ok(coBytes <= 650, `Expected mutual-compact digest <= 650 bytes, got ${coBytes}`);
    assert.ok(coBytes < standaloneBytes * 0.65);
    assert.ok(coBytes < FULL_SKILL_BYTES);
    assert.equal(fs.readFileSync(ghConfigPath, "utf8"), "version: 1\n");
    fs.rmSync(ghConfigDir, { recursive: true, force: true });

    // 2. Project .agents/.claude/.cursor/.gemini skill detection
    for (const parent of [".agents", ".claude", ".cursor", ".gemini"]) {
      const projSkillDir = path.join(projectDir, parent, "skills", "using-github-convention");
      fs.mkdirSync(projSkillDir, { recursive: true });
      fs.writeFileSync(path.join(projSkillDir, "SKILL.md"), "# using-github-convention\n");
      assert.deepEqual(
        detectCompanionPlugins({ cwd: projectDir, projectRoot: projectDir, env: { HOME: fakeHome } }).companions,
        ["github-convention"],
      );
      fs.rmSync(path.join(projectDir, parent), { recursive: true, force: true });
    }

    // 3. Global skill and Gemini extension detection
    const globalSkillDir = path.join(fakeHome, ".agents", "skills", "github-convention");
    fs.mkdirSync(globalSkillDir, { recursive: true });
    fs.writeFileSync(path.join(globalSkillDir, "SKILL.md"), "# github-convention\n");
    assert.deepEqual(
      detectCompanionPlugins({ cwd: projectDir, projectRoot: projectDir, env: { HOME: fakeHome } }).companions,
      ["github-convention"],
    );
    fs.rmSync(path.join(fakeHome, ".agents"), { recursive: true, force: true });

    const geminiExtDir = path.join(fakeHome, ".gemini", "extensions", "github-convention");
    fs.mkdirSync(geminiExtDir, { recursive: true });
    fs.writeFileSync(path.join(geminiExtDir, "gemini-extension.json"), '{"name":"github-convention"}\n');
    assert.deepEqual(
      detectCompanionPlugins({ cwd: projectDir, projectRoot: projectDir, env: { HOME: fakeHome } }).companions,
      ["github-convention"],
    );
    fs.rmSync(path.join(fakeHome, ".gemini"), { recursive: true, force: true });

    // 4. Global ~/.claude/plugins/installed_plugins.json (exact key match)
    const claudePluginsDir = path.join(fakeHome, ".claude", "plugins");
    fs.mkdirSync(claudePluginsDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudePluginsDir, "installed_plugins.json"),
      JSON.stringify({
        plugins: {
          "other-plugin@Org": [{ description: "mentions github-convention in prose" }],
        },
      }),
    );
    assert.deepEqual(
      detectCompanionPlugins({ cwd: projectDir, projectRoot: projectDir, env: { HOME: fakeHome } }).companions,
      [],
    );

    fs.writeFileSync(
      path.join(claudePluginsDir, "installed_plugins.json"),
      JSON.stringify({ plugins: { "github-convention@Dobbymin": [{ version: "0.1.0" }] } }),
    );
    assert.deepEqual(
      detectCompanionPlugins({ cwd: projectDir, projectRoot: projectDir, env: { HOME: fakeHome } }).companions,
      ["github-convention"],
    );

    // 5. Malformed installed_plugins.json degrades gracefully
    fs.writeFileSync(path.join(claudePluginsDir, "installed_plugins.json"), "{broken-json");
    assert.deepEqual(
      detectCompanionPlugins({ cwd: projectDir, projectRoot: projectDir, env: { HOME: fakeHome } }).companions,
      [],
    );

    // 6. DEV_PRINCIPLES_CONTEXT_MODE=compact and =full
    const compactPayload = buildSessionStartPayload({
      cwd: projectDir,
      env: { HOME: fakeHome, DEV_PRINCIPLES_CONTEXT_MODE: "compact" },
      pluginRoot: REPO_ROOT,
    });
    assert.match(compactPayload.additionalContext, /\(compact mode\)/);
    assert.ok(Buffer.byteLength(compactPayload.additionalContext, "utf8") <= 650);

    const fullPayload = buildSessionStartPayload({
      cwd: projectDir,
      env: { HOME: fakeHome, DEV_PRINCIPLES_CONTEXT_MODE: "full" },
      pluginRoot: REPO_ROOT,
    });
    assert.doesNotMatch(fullPayload.additionalContext, /^---/m);
    assert.match(fullPayload.additionalContext, /Track S \/ M \/ L/);
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }
});

test(
  "install.sh and uninstall.sh manage copy install, CRLF legacy migration, conflicts, and co-installation across OSes",
  { skip: !POSIX_SHELL },
  () => {
    const tempDir = makeTempDir();
    const fakeHome = makeTempDir();
    const projectDir = path.join(tempDir, "project");
    const targetDir = path.join(tempDir, "custom-target", ".agents", "skills");
    fs.mkdirSync(projectDir, { recursive: true });
    const shellEnv = { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome };

    try {
      // Dry-run does not create target
      const dryRunOut = execFileSync(
        POSIX_SHELL,
        [path.join(REPO_ROOT, "install.sh"), "--scope", "project", "--copy", "--dry-run"],
        { cwd: projectDir, env: shellEnv, encoding: "utf8" },
      );
      assert.match(dryRunOut, /dev-principles/);
      assert.equal(fs.existsSync(path.join(projectDir, ".agents")), false);

      // Fresh --copy install & re-run (project scope)
      execFileSync(
        POSIX_SHELL,
        [path.join(REPO_ROOT, "install.sh"), "--scope", "project", "--copy"],
        { cwd: projectDir, env: shellEnv, encoding: "utf8" },
      );
      const projDest = path.join(projectDir, ".agents", "skills", "dev-principles");
      assert.equal(fs.existsSync(path.join(projDest, "SKILL.md")), true);
      const markerText = fs.readFileSync(path.join(projDest, ".dev-principles-script-managed"), "utf8");
      assert.match(markerText, /^plugin=dev-principles$/m);
      assert.match(markerText, /^managed_by=install\.sh$/m);
      assert.match(markerText, /^install_mode=copy$/m);
      assert.match(markerText, /^skill=dev-principles$/m);

      // Re-run --copy safely
      execFileSync(
        POSIX_SHELL,
        [path.join(REPO_ROOT, "install.sh"), "--scope", "project", "--copy"],
        { cwd: projectDir, env: shellEnv, encoding: "utf8" },
      );
      assert.equal(fs.existsSync(path.join(projDest, "SKILL.md")), true);

      // Legacy v0.1 CRLF marker migration: `managed-by=install.sh\r\n` + CRLF SKILL.md upgrades cleanly
      fs.writeFileSync(path.join(projDest, ".dev-principles-script-managed"), "managed-by=install.sh\r\n");
      const skillText = fs.readFileSync(path.join(projDest, "SKILL.md"), "utf8").replace(/\r?\n/g, "\r\n");
      fs.writeFileSync(path.join(projDest, "SKILL.md"), skillText);
      execFileSync(
        POSIX_SHELL,
        [path.join(REPO_ROOT, "install.sh"), "--scope", "project", "--copy"],
        { cwd: projectDir, env: shellEnv, encoding: "utf8" },
      );
      const upgradedMarker = fs.readFileSync(path.join(projDest, ".dev-principles-script-managed"), "utf8");
      assert.match(upgradedMarker, /^plugin=dev-principles$/m);

      // Global scope install + uninstall, project scope stays intact
      execFileSync(
        POSIX_SHELL,
        [path.join(REPO_ROOT, "install.sh"), "--scope", "global", "--copy"],
        { cwd: projectDir, env: shellEnv, encoding: "utf8" },
      );
      const globalDest = path.join(fakeHome, ".agents", "skills", "dev-principles");
      assert.equal(fs.existsSync(path.join(globalDest, "SKILL.md")), true);
      assert.equal(fs.existsSync(path.join(projDest, "SKILL.md")), true);

      execFileSync(
        POSIX_SHELL,
        [path.join(REPO_ROOT, "uninstall.sh"), "--scope", "global"],
        { cwd: projectDir, env: shellEnv, encoding: "utf8" },
      );
      assert.equal(fs.existsSync(globalDest), false);
      assert.equal(fs.existsSync(path.join(projDest, "SKILL.md")), true);

      // Project uninstall + idempotent second uninstall
      execFileSync(
        POSIX_SHELL,
        [path.join(REPO_ROOT, "uninstall.sh"), "--scope", "project"],
        { cwd: projectDir, env: shellEnv, encoding: "utf8" },
      );
      assert.equal(fs.existsSync(projDest), false);

      execFileSync(
        POSIX_SHELL,
        [path.join(REPO_ROOT, "uninstall.sh"), "--scope", "project"],
        { cwd: projectDir, env: shellEnv, encoding: "utf8" },
      );

      // Conflict protection in --target dir: regular file, unmanaged dir, foreign marker
      fs.mkdirSync(targetDir, { recursive: true });
      const dest = path.join(targetDir, "dev-principles");

      fs.writeFileSync(dest, "keep-file\n");
      runExpectFailure(POSIX_SHELL, [path.join(REPO_ROOT, "install.sh"), "--target", targetDir, "--copy"]);
      runExpectFailure(POSIX_SHELL, [path.join(REPO_ROOT, "uninstall.sh"), "--target", targetDir]);
      assert.equal(fs.readFileSync(dest, "utf8"), "keep-file\n");
      fs.unlinkSync(dest);

      fs.mkdirSync(dest, { recursive: true });
      runExpectFailure(POSIX_SHELL, [path.join(REPO_ROOT, "install.sh"), "--target", targetDir, "--copy"]);
      runExpectFailure(POSIX_SHELL, [path.join(REPO_ROOT, "uninstall.sh"), "--target", targetDir]);
      assert.equal(fs.existsSync(dest), true);

      fs.writeFileSync(path.join(dest, ".github-convention-script-managed"), "managed-by=install.sh\n");
      runExpectFailure(POSIX_SHELL, [path.join(REPO_ROOT, "install.sh"), "--target", targetDir, "--copy"]);
      runExpectFailure(POSIX_SHELL, [path.join(REPO_ROOT, "uninstall.sh"), "--target", targetDir]);
      assert.equal(fs.existsSync(path.join(dest, ".github-convention-script-managed")), true);
      fs.rmSync(dest, { recursive: true, force: true });

      // Co-installation alongside github-convention skill; uninstalling dev-principles leaves sibling untouched
      const siblingSkill = path.join(targetDir, "using-github-convention");
      fs.mkdirSync(siblingSkill, { recursive: true });
      fs.writeFileSync(path.join(siblingSkill, "SKILL.md"), "# using-github-convention\n");
      fs.writeFileSync(
        path.join(siblingSkill, ".github-convention-script-managed"),
        "managed-by=install.sh\n",
      );

      execFileSync(POSIX_SHELL, [path.join(REPO_ROOT, "install.sh"), "--target", targetDir, "--copy"], {
        env: shellEnv,
        encoding: "utf8",
      });
      assert.equal(fs.existsSync(path.join(dest, "SKILL.md")), true);
      assert.equal(fs.existsSync(path.join(siblingSkill, "SKILL.md")), true);

      execFileSync(POSIX_SHELL, [path.join(REPO_ROOT, "uninstall.sh"), "--target", targetDir], {
        env: shellEnv,
        encoding: "utf8",
      });
      assert.equal(fs.existsSync(dest), false);
      assert.equal(fs.existsSync(path.join(siblingSkill, "SKILL.md")), true);
      assert.equal(fs.existsSync(path.join(siblingSkill, ".github-convention-script-managed")), true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  },
);

test(
  "install.sh and uninstall.sh handle symlink ownership, foreign symlinks, and Windows junction/fallback",
  { skip: !POSIX_SHELL },
  () => {
    const tempDir = makeTempDir();
    const targetDir = path.join(tempDir, ".agents", "skills");
    const foreignSource = path.join(tempDir, "other-plugin", "skills", "dev-principles");
    fs.mkdirSync(targetDir, { recursive: true });
    fs.mkdirSync(foreignSource, { recursive: true });
    fs.writeFileSync(path.join(foreignSource, "SKILL.md"), "# foreign skill\n");

    const symlinksSupported = canCreateShellSymlink(POSIX_SHELL);

    try {
      const dest = path.join(targetDir, "dev-principles");

      if (symlinksSupported) {
        // Owned symlink install, re-run, relative owned symlink, symlink <-> copy transitions
        execFileSync(POSIX_SHELL, [path.join(REPO_ROOT, "install.sh"), "--target", targetDir], {
          encoding: "utf8",
        });
        assert.equal(fs.lstatSync(dest).isSymbolicLink(), true);

        const relTarget = path.relative(
          fs.realpathSync.native(path.dirname(dest)),
          fs.realpathSync.native(path.join(REPO_ROOT, "skills", "dev-principles")),
        );
        fs.unlinkSync(dest);
        fs.symlinkSync(relTarget, dest);
        execFileSync(POSIX_SHELL, [path.join(REPO_ROOT, "install.sh"), "--target", targetDir], {
          encoding: "utf8",
        });
        assert.equal(fs.lstatSync(dest).isSymbolicLink(), true);

        execFileSync(
          POSIX_SHELL,
          [path.join(REPO_ROOT, "install.sh"), "--target", targetDir, "--copy"],
          { encoding: "utf8" },
        );
        assert.equal(fs.lstatSync(dest).isSymbolicLink(), false);

        execFileSync(POSIX_SHELL, [path.join(REPO_ROOT, "install.sh"), "--target", targetDir], {
          encoding: "utf8",
        });
        assert.equal(fs.lstatSync(dest).isSymbolicLink(), true);

        execFileSync(POSIX_SHELL, [path.join(REPO_ROOT, "uninstall.sh"), "--target", targetDir], {
          encoding: "utf8",
        });
        assert.equal(fs.existsSync(dest), false);

        // Foreign symlink with identical /skills/dev-principles suffix MUST NOT be overwritten or removed
        fs.symlinkSync(foreignSource, dest);
        const installSymErr = runExpectFailure(POSIX_SHELL, [
          path.join(REPO_ROOT, "install.sh"),
          "--target",
          targetDir,
          "--dry-run",
        ]);
        assert.match(installSymErr, /not owned by dev-principles/);
        const uninstallSymErr = runExpectFailure(POSIX_SHELL, [
          path.join(REPO_ROOT, "uninstall.sh"),
          "--target",
          targetDir,
          "--dry-run",
        ]);
        assert.match(uninstallSymErr, /not owned by dev-principles/);
        assert.equal(fs.lstatSync(dest).isSymbolicLink(), true);
        fs.unlinkSync(dest);

        // Broken / dangling foreign symlink MUST NOT be overwritten or removed
        fs.symlinkSync(path.join(tempDir, "missing-target", "skills", "dev-principles"), dest);
        runExpectFailure(POSIX_SHELL, [path.join(REPO_ROOT, "install.sh"), "--target", targetDir]);
        runExpectFailure(POSIX_SHELL, [path.join(REPO_ROOT, "uninstall.sh"), "--target", targetDir]);
        assert.equal(fs.lstatSync(dest).isSymbolicLink(), true);
        fs.unlinkSync(dest);
      } else if (process.platform === "win32") {
        // Without Developer Mode / SeCreateSymbolicLinkPrivilege, symlink mode fails cleanly with guidance
        const winSymErr = runExpectFailure(POSIX_SHELL, [
          path.join(REPO_ROOT, "install.sh"),
          "--target",
          targetDir,
        ]);
        assert.match(winSymErr, /Symlink creation failed on Windows/);
        assert.equal(fs.existsSync(dest), false);
      }

      if (process.platform === "win32") {
        // Windows directory junction owned by another plugin MUST NOT be overwritten or removed
        fs.symlinkSync(foreignSource, dest, "junction");
        const juncInstallErr = runExpectFailure(POSIX_SHELL, [
          path.join(REPO_ROOT, "install.sh"),
          "--target",
          targetDir,
          "--copy",
        ]);
        assert.match(juncInstallErr, /not owned by dev-principles|unmanaged directory/);
        const juncUninstallErr = runExpectFailure(POSIX_SHELL, [
          path.join(REPO_ROOT, "uninstall.sh"),
          "--target",
          targetDir,
        ]);
        assert.match(juncUninstallErr, /not owned by dev-principles|unmanaged path/);
        assert.equal(fs.existsSync(dest), true);
        fs.rmSync(dest, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  },
);
