import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildSessionStartPayload } from "../../hooks/session-start.mjs";
import { REPO_ROOT } from "../validate.mjs";

const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "dp-hooks-test-"));

test("buildSessionStartPayload returns null outside projects without config", () => {
  const dir = makeTempDir();
  try {
    const payload = buildSessionStartPayload({ cwd: dir, env: {}, pluginRoot: REPO_ROOT });
    assert.equal(payload, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("buildSessionStartPayload activates for projects and formats per platform", () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, "package.json"), '{"name":"demo"}\n');

    const claudePayload = buildSessionStartPayload({
      cwd: dir,
      env: { CLAUDE_PLUGIN_ROOT: REPO_ROOT },
      pluginRoot: REPO_ROOT,
    });
    assert.equal(claudePayload.hookSpecificOutput.hookEventName, "SessionStart");
    assert.match(claudePayload.hookSpecificOutput.additionalContext, /zero-config project detected/);
    assert.match(claudePayload.hookSpecificOutput.additionalContext, /dev-principles/);

    const cursorPayload = buildSessionStartPayload({
      cwd: dir,
      env: { CURSOR_PLUGIN_ROOT: REPO_ROOT },
      pluginRoot: REPO_ROOT,
    });
    assert.ok(typeof cursorPayload.additional_context === "string");

    fs.writeFileSync(
      path.join(dir, ".dev-principles.yaml"),
      "version: 1\narchitecture:\n  preset: fsd\n",
    );
    const defaultPayload = buildSessionStartPayload({
      cwd: dir,
      env: {},
      pluginRoot: REPO_ROOT,
    });
    assert.match(defaultPayload.additionalContext, /\.dev-principles\.yaml detected, preset: fsd/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test(
  "install.sh and uninstall.sh manage dev-principles skill cleanly",
  { skip: process.platform === "win32" },
  () => {
    const tempDir = makeTempDir();
    const targetDir = path.join(tempDir, ".agents", "skills");
    try {
      const dryRunOut = execFileSync(
        "sh",
        [path.join(REPO_ROOT, "install.sh"), "--target", targetDir, "--dry-run"],
        { encoding: "utf8" },
      );
      assert.match(dryRunOut, /dev-principles/);
      assert.equal(fs.existsSync(targetDir), false);

      execFileSync(
        "sh",
        [path.join(REPO_ROOT, "install.sh"), "--target", targetDir, "--copy"],
        { encoding: "utf8" },
      );
      assert.equal(fs.existsSync(path.join(targetDir, "dev-principles", "SKILL.md")), true);

      execFileSync("sh", [path.join(REPO_ROOT, "uninstall.sh"), "--target", targetDir], {
        encoding: "utf8",
      });
      assert.equal(fs.existsSync(path.join(targetDir, "dev-principles")), false);

      // Refuse to overwrite unmanaged non-empty directory
      const unmanaged = path.join(targetDir, "dev-principles");
      fs.mkdirSync(unmanaged, { recursive: true });
      fs.writeFileSync(path.join(unmanaged, "custom.txt"), "keep\n");
      assert.throws(() => {
        execFileSync(
          "sh",
          [path.join(REPO_ROOT, "install.sh"), "--target", targetDir, "--copy"],
          { encoding: "utf8", stdio: "pipe" },
        );
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  },
);
