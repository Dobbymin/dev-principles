import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { REPO_ROOT } from "../validate.mjs";

const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "dp-own-test-"));
const OWNERSHIP_SH = path.join(REPO_ROOT, "scripts", "lib", "ownership.sh");
const INSTALL_SH = path.join(REPO_ROOT, "install.sh");
const UNINSTALL_SH = path.join(REPO_ROOT, "uninstall.sh");
const CANONICAL_SOURCE = fs.realpathSync.native(path.join(REPO_ROOT, "skills", "dev-principles"));

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

const POSIX_SHELL = resolvePosixShell();

const hasDash = (() => {
  if (process.platform === "win32") return false;
  try {
    return execFileSync("/bin/dash", ["-c", "echo ok"], { encoding: "utf8", stdio: "pipe" }).trim() === "ok";
  } catch {
    return false;
  }
})();

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

const runOwnershipHelper = (shellBin, scriptBody, args = [], expectFail = false) => {
  const preamble = `
set -eu
resolve_dir() { (CDPATH= cd -- "$1" 2>/dev/null && pwd -P); }
is_windows_shell() {
  case "$(uname -s 2>/dev/null || true)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
    *) return 1 ;;
  esac
}
normalize_path_for_compare() {
  if is_windows_shell && command -v cygpath >/dev/null 2>&1; then
    cygpath -u "$1" 2>/dev/null || printf "%s\\n" "$1"
  else
    printf "%s\\n" "$1"
  fi
}
MARKER_FILE=".dev-principles-script-managed"
. "$1"
trap ownership_cleanup EXIT INT TERM
shift
${scriptBody}
`;
  if (expectFail) {
    return runExpectFailure(shellBin, ["-c", preamble, "_", OWNERSHIP_SH, ...args]);
  }
  return execFileSync(shellBin, ["-c", preamble, "_", OWNERSHIP_SH, ...args], {
    encoding: "utf8",
    stdio: "pipe",
  });
};

const buildMarker = ({
  schemaVersion = "2",
  plugin = "dev-principles",
  managedBy = "install.sh",
  managedDash = "install.sh",
  installMode = "copy",
  skill = "dev-principles",
  installPath,
  sourcePath,
  linkTarget = "",
  files = ["SKILL.md"],
  omit = [],
  extraLines = [],
  trailingNewline = true,
}) => {
  const lines = [];
  if (!omit.includes("schema_version")) lines.push(`schema_version=${schemaVersion}`);
  if (!omit.includes("plugin")) lines.push(`plugin=${plugin}`);
  if (!omit.includes("managed_by")) lines.push(`managed_by=${managedBy}`);
  if (!omit.includes("managed-by")) lines.push(`managed-by=${managedDash}`);
  if (!omit.includes("install_mode")) lines.push(`install_mode=${installMode}`);
  if (!omit.includes("skill")) lines.push(`skill=${skill}`);
  if (!omit.includes("install_path")) lines.push(`install_path=${installPath}`);
  if (!omit.includes("source_path")) lines.push(`source_path=${sourcePath}`);
  if (!omit.includes("link_target")) lines.push(`link_target=${linkTarget}`);
  for (const f of files) {
    lines.push(`file=${f}`);
  }
  for (const extra of extraLines) {
    lines.push(extra);
  }
  return lines.join("\n") + (trailingNewline ? "\n" : "");
};

test(
  "IFS and POSIX file-list handling: spaces, tabs, 'n', nested subdirs, hidden files, globs, invalid paths, and duplicates",
  { skip: !POSIX_SHELL },
  () => {
    const tempDir = makeTempDir();
    try {
      const srcDir = path.join(tempDir, "src-skill");
      const destDir = path.join(tempDir, "dest-skill");
      fs.mkdirSync(srcDir, { recursive: true });

      const sampleFiles = [
        "SKILL.md",
        "sub dir/my skill.md",
        "nested/clean-notes.md",
        "a/b/c/d/deep.md",
        ".hidden",
        "sub/.dotfile",
        "..double-dot.md",
        "file[1].md",
      ];
      if (process.platform !== "win32") {
        sampleFiles.push("sub\ttab/tab\tfile.md");
        sampleFiles.push("file*star.md");
      }

      for (const rel of sampleFiles) {
        const full = path.join(srcDir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, `content:${rel}\n`);
      }

      fs.cpSync(srcDir, destDir, { recursive: true });
      const realSrc = fs.realpathSync.native(srcDir);
      const realDest = fs.realpathSync.native(destDir);

      // write_copy_marker + verify_owned_dest + remove_owned_dest succeed with special filenames
      runOwnershipHelper(
        POSIX_SHELL,
        `
        write_copy_marker "$1" "dev-principles" "$2" "$3"
        verify_owned_dest "$1" "dev-principles" "$3" verify "$2"
        `,
        [destDir, realDest, realSrc],
      );

      // Verify marker without trailing newline still passes
      const markerPath = path.join(destDir, ".dev-principles-script-managed");
      const markerNoNl = fs.readFileSync(markerPath, "utf8").replace(/\n$/, "");
      fs.writeFileSync(markerPath, markerNoNl);
      runOwnershipHelper(
        POSIX_SHELL,
        `verify_owned_dest "$1" "dev-principles" "$3" verify "$2"`,
        [destDir, realDest, realSrc],
      );

      // remove_owned_dest removes all special-character files and nested dirs cleanly
      runOwnershipHelper(
        POSIX_SHELL,
        `remove_owned_dest "$1" "dev-principles" "$3" "$2"`,
        [destDir, realDest, realSrc],
      );
      assert.equal(fs.existsSync(destDir), false);

      // Direct invalid relative paths and duplicate file= list tests
      fs.cpSync(srcDir, destDir, { recursive: true });
      const invalidRelPaths = [
        "",
        ".",
        "..",
        "./SKILL.md",
        "a/./b",
        "a/.",
        "../secret.md",
        "a/../b",
        "a/..",
        "/abs/path",
        "C:/abs/path",
        "a\\b",
        "..\\secret",
        "a//b",
        "a/",
      ];

      for (const badRel of invalidRelPaths) {
        const marker = buildMarker({
          installPath: realDest,
          sourcePath: realSrc,
          files: [...sampleFiles, badRel],
        });
        fs.writeFileSync(markerPath, marker);
        runOwnershipHelper(
          POSIX_SHELL,
          `verify_owned_dest "$1" "dev-principles" "$3" verify "$2"`,
          [destDir, realDest, realSrc],
          true,
        );
      }

      // Duplicate file list entry
      const dupMarker = buildMarker({
        installPath: realDest,
        sourcePath: realSrc,
        files: [...sampleFiles, "SKILL.md"],
      });
      fs.writeFileSync(markerPath, dupMarker);
      const dupErr = runOwnershipHelper(
        POSIX_SHELL,
        `verify_owned_dest "$1" "dev-principles" "$3" verify "$2"`,
        [destDir, realDest, realSrc],
        true,
      );
      assert.match(dupErr, /duplicate entry in marker file list/);

      // Empty file list (no file= lines)
      const emptyFilesMarker = buildMarker({
        installPath: realDest,
        sourcePath: realSrc,
        files: [],
      });
      fs.writeFileSync(markerPath, emptyFilesMarker);
      const emptyErr = runOwnershipHelper(
        POSIX_SHELL,
        `verify_owned_dest "$1" "dev-principles" "$3" verify "$2"`,
        [destDir, realDest, realSrc],
        true,
      );
      assert.match(emptyErr, /empty file list in marker/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "Marker validation: missing required fields, duplicates, wrong values, unsupported versions, and symlink marker",
  { skip: !POSIX_SHELL },
  () => {
    const tempDir = makeTempDir();
    try {
      const targetDir = path.join(tempDir, ".agents", "skills");
      const dest = path.join(targetDir, "dev-principles");
      const markerPath = path.join(dest, ".dev-principles-script-managed");

      execFileSync(POSIX_SHELL, [INSTALL_SH, "--target", targetDir, "--copy"], { encoding: "utf8" });
      const realDest = fs.realpathSync.native(dest);
      const validMarker = fs.readFileSync(markerPath, "utf8");
      const validFiles = validMarker
        .split(/\r?\n/)
        .filter((l) => l.startsWith("file="))
        .map((l) => l.slice(5));

      // Missing each required field individually
      for (const reqField of [
        "plugin",
        "schema_version",
        "skill",
        "install_path",
        "source_path",
        "install_mode",
      ]) {
        fs.writeFileSync(
          markerPath,
          buildMarker({
            installPath: realDest,
            sourcePath: CANONICAL_SOURCE,
            files: validFiles,
            omit: [reqField],
          }),
        );
        const err = runExpectFailure(POSIX_SHELL, [UNINSTALL_SH, "--target", targetDir]);
        assert.match(err, new RegExp(`missing required field: ${reqField}`));
      }

      // Duplicate each required field individually
      const dupSamples = [
        ["plugin", "plugin=dev-principles"],
        ["schema_version", "schema_version=2"],
        ["skill", "skill=dev-principles"],
        ["install_path", `install_path=${realDest}`],
        ["source_path", `source_path=${CANONICAL_SOURCE}`],
        ["install_mode", "install_mode=copy"],
      ];
      for (const [field, extraLine] of dupSamples) {
        fs.writeFileSync(
          markerPath,
          buildMarker({
            installPath: realDest,
            sourcePath: CANONICAL_SOURCE,
            files: validFiles,
            extraLines: [extraLine],
          }),
        );
        const err = runExpectFailure(POSIX_SHELL, [UNINSTALL_SH, "--target", targetDir]);
        assert.match(err, new RegExp(`duplicate required field: ${field}`));
      }

      // Wrong plugin, wrong skill, wrong install_path, wrong source_path, wrong install_mode, blank line, unknown field
      const invalidCases = [
        [{ plugin: "other-plugin" }, /plugin mismatch/],
        [{ skill: "other-skill" }, /skill mismatch/],
        [{ installPath: path.join(tempDir, "other") }, /install_path mismatch/],
        [{ installPath: "relative/install/path" }, /invalid install_path/],
        [{ sourcePath: path.join(tempDir, "other-src") }, /source_path mismatch/],
        [{ sourcePath: "relative/source/path" }, /invalid source_path/],
        [{ installMode: "symlink" }, /install_mode mismatch/],
        [{ schemaVersion: "0" }, /unsupported schema_version/],
        [{ schemaVersion: "3" }, /unsupported schema_version/],
        [{ schemaVersion: "99" }, /unsupported schema_version/],
        [{ schemaVersion: "" }, /unsupported schema_version/],
        [{ extraLines: ["unknown_key=1"] }, /unknown marker field/],
        [{ extraLines: [""] }, /blank line in marker/],
      ];
      for (const [overrides, expectedPattern] of invalidCases) {
        fs.writeFileSync(
          markerPath,
          buildMarker({
            installPath: realDest,
            sourcePath: CANONICAL_SOURCE,
            files: validFiles,
            ...overrides,
          }),
        );
        const err = runExpectFailure(POSIX_SHELL, [UNINSTALL_SH, "--target", targetDir]);
        assert.match(err, expectedPattern);
      }

      // Symlinked marker file is rejected
      if (process.platform !== "win32") {
        const externalMarker = path.join(tempDir, "external-marker");
        fs.writeFileSync(externalMarker, validMarker);
        fs.unlinkSync(markerPath);
        fs.symlinkSync(externalMarker, markerPath);
        const symErr = runExpectFailure(POSIX_SHELL, [UNINSTALL_SH, "--target", targetDir]);
        assert.match(symErr, /marker file is a symlink/);
        fs.unlinkSync(markerPath);
      }

      // Restore valid marker and verify clean uninstall
      fs.writeFileSync(markerPath, validMarker);
      execFileSync(POSIX_SHELL, [UNINSTALL_SH, "--target", targetDir], { encoding: "utf8" });
      assert.equal(fs.existsSync(dest), false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "Completeness validation: missing file, modified file, extra file, extra empty/non-empty dir, and symlink file inside copy dir",
  { skip: !POSIX_SHELL },
  () => {
    const tempDir = makeTempDir();
    try {
      const targetDir = path.join(tempDir, ".agents", "skills");
      const dest = path.join(targetDir, "dev-principles");
      const markerPath = path.join(dest, ".dev-principles-script-managed");
      const skillMd = path.join(dest, "SKILL.md");

      execFileSync(POSIX_SHELL, [INSTALL_SH, "--target", targetDir, "--copy"], { encoding: "utf8" });
      const validMarker = fs.readFileSync(markerPath, "utf8");
      const originalSkillContent = fs.readFileSync(skillMd, "utf8");

      // 1. Modified managed file -> rejected & preserved
      fs.writeFileSync(skillMd, `${originalSkillContent}\n<!-- user local edit -->\n`);
      const modInstallErr = runExpectFailure(POSIX_SHELL, [INSTALL_SH, "--target", targetDir, "--copy"]);
      const modUninstallErr = runExpectFailure(POSIX_SHELL, [UNINSTALL_SH, "--target", targetDir]);
      assert.match(modInstallErr, /managed file modified/);
      assert.match(modUninstallErr, /managed file modified/);
      assert.match(fs.readFileSync(skillMd, "utf8"), /user local edit/);
      fs.writeFileSync(skillMd, originalSkillContent);

      // 2. Missing managed file -> rejected & preserved
      const refFile = path.join(dest, "references", "clean-code.md");
      const refBackup = fs.readFileSync(refFile, "utf8");
      fs.unlinkSync(refFile);
      const missInstallErr = runExpectFailure(POSIX_SHELL, [INSTALL_SH, "--target", targetDir, "--copy"]);
      const missUninstallErr = runExpectFailure(POSIX_SHELL, [UNINSTALL_SH, "--target", targetDir]);
      assert.match(missInstallErr, /missing managed file/);
      assert.match(missUninstallErr, /missing managed file/);
      assert.equal(fs.existsSync(skillMd), true);
      fs.writeFileSync(refFile, refBackup);

      // 3. User-added file -> rejected & preserved
      const extraFile = path.join(dest, "references", "my-extra.md");
      fs.writeFileSync(extraFile, "# extra\n");
      const extraFileErr = runExpectFailure(POSIX_SHELL, [UNINSTALL_SH, "--target", targetDir]);
      assert.match(extraFileErr, /user-added file detected/);
      assert.equal(fs.existsSync(extraFile), true);
      fs.unlinkSync(extraFile);

      // 4. User-added empty directory -> rejected & preserved
      const extraEmptyDir = path.join(dest, "user-empty-dir");
      fs.mkdirSync(extraEmptyDir);
      const extraEmptyErr = runExpectFailure(POSIX_SHELL, [INSTALL_SH, "--target", targetDir, "--copy"]);
      const extraEmptyUnErr = runExpectFailure(POSIX_SHELL, [UNINSTALL_SH, "--target", targetDir]);
      assert.match(extraEmptyErr, /user-added directory detected/);
      assert.match(extraEmptyUnErr, /user-added directory detected/);
      assert.equal(fs.existsSync(extraEmptyDir), true);
      fs.rmdirSync(extraEmptyDir);

      // 5. User-added non-empty directory -> rejected & preserved
      const extraFullDir = path.join(dest, "user-notes");
      fs.mkdirSync(extraFullDir);
      fs.writeFileSync(path.join(extraFullDir, "note.txt"), "keep me\n");
      const extraFullErr = runExpectFailure(POSIX_SHELL, [UNINSTALL_SH, "--target", targetDir]);
      assert.match(extraFullErr, /user-added file detected|user-added directory detected/);
      assert.equal(fs.readFileSync(path.join(extraFullDir, "note.txt"), "utf8"), "keep me\n");
      fs.rmSync(extraFullDir, { recursive: true, force: true });

      // 6. Symlink file inside copy dir -> rejected & preserved
      if (process.platform !== "win32") {
        const outsideFile = path.join(tempDir, "outside.txt");
        fs.writeFileSync(outsideFile, "outside\n");
        const symInside = path.join(dest, "extra-link.md");
        fs.symlinkSync(outsideFile, symInside);
        const symErr = runExpectFailure(POSIX_SHELL, [UNINSTALL_SH, "--target", targetDir]);
        assert.match(symErr, /unexpected symlink inside copy directory/);
        assert.equal(fs.lstatSync(symInside).isSymbolicLink(), true);
        fs.unlinkSync(symInside);
      }

      // Restore marker & clean uninstall succeeds
      fs.writeFileSync(markerPath, validMarker);
      execFileSync(POSIX_SHELL, [UNINSTALL_SH, "--target", targetDir], { encoding: "utf8" });
      assert.equal(fs.existsSync(dest), false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "Safe deletion: mid-delete error aborts immediately, direct remove_owned_dest re-verifies, and manifest removal verifies independently",
  { skip: !POSIX_SHELL },
  () => {
    const tempDir = makeTempDir();
    try {
      const targetDir = path.join(tempDir, ".agents", "skills");
      const dest = path.join(targetDir, "dev-principles");
      const markerPath = path.join(dest, ".dev-principles-script-managed");

      execFileSync(POSIX_SHELL, [INSTALL_SH, "--target", targetDir, "--copy"], { encoding: "utf8" });
      const realDest = fs.realpathSync.native(dest);

      // Direct remove_owned_dest with tampered marker fails before deleting anything
      const validMarker = fs.readFileSync(markerPath, "utf8");
      fs.writeFileSync(markerPath, validMarker.replace("plugin=dev-principles", "plugin=other"));
      runOwnershipHelper(
        POSIX_SHELL,
        `remove_owned_dest "$1" "dev-principles" "$3" "$2"`,
        [dest, realDest, CANONICAL_SOURCE],
        true,
      );
      assert.equal(fs.existsSync(path.join(dest, "SKILL.md")), true);
      fs.writeFileSync(markerPath, validMarker);

      // Separate manifest verification before marker removal rejects invalid/tampered marker
      runOwnershipHelper(
        POSIX_SHELL,
        `
        _t="$(ownership_mktemp_dir)"
        _OWNERSHIP_TMPDIR_VERIFY="$_t"
        verify_marker_metadata "$1" "dev-principles" "$3" "$2" "$_t" "$_t/mf.raw" "0"
        `,
        [dest, realDest, CANONICAL_SOURCE],
      );

      fs.writeFileSync(markerPath, validMarker.replace("install_mode=copy", "install_mode=symlink"));
      runOwnershipHelper(
        POSIX_SHELL,
        `
        _t="$(ownership_mktemp_dir)"
        _OWNERSHIP_TMPDIR_VERIFY="$_t"
        verify_marker_metadata "$1" "dev-principles" "$3" "$2" "$_t" "$_t/mf.raw" "0"
        `,
        [dest, realDest, CANONICAL_SOURCE],
        true,
      );
      fs.writeFileSync(markerPath, validMarker);

      // Mid-deletion error (Unix only): read-only subdir prevents rm inside references/
      if (process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() !== 0) {
        const refsDir = path.join(dest, "references");
        fs.chmodSync(refsDir, 0o555);
        try {
          const midErr = runExpectFailure(POSIX_SHELL, [UNINSTALL_SH, "--target", targetDir]);
          assert.match(midErr, /Aborting removal/);
          // Marker and remaining files in references/presets MUST NOT be deleted
          assert.equal(fs.existsSync(markerPath), true);
          assert.equal(fs.existsSync(path.join(refsDir, "presets", "README.md")), true);
        } finally {
          fs.chmodSync(refsDir, 0o755);
        }
      }

      // Clean up via uninstall.sh after permissions restored
      // Note: if mid-deletion test deleted SKILL.md first, reinstall or restore SKILL.md isn't needed if we re-copy
      if (!fs.existsSync(path.join(dest, "SKILL.md"))) {
        fs.copyFileSync(path.join(CANONICAL_SOURCE, "SKILL.md"), path.join(dest, "SKILL.md"));
      }
      execFileSync(POSIX_SHELL, [UNINSTALL_SH, "--target", targetDir], { encoding: "utf8" });
      assert.equal(fs.existsSync(dest), false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "Install update safety: schema_version=1 upgrade, dry-run immutability, rollback on error, and strict /bin/dash compatibility",
  { skip: !POSIX_SHELL },
  () => {
    const tempDir = makeTempDir();
    try {
      const targetDir = path.join(tempDir, ".agents", "skills");
      const dest = path.join(targetDir, "dev-principles");
      const markerPath = path.join(dest, ".dev-principles-script-managed");

      // Install baseline
      execFileSync(POSIX_SHELL, [INSTALL_SH, "--target", targetDir, "--copy"], { encoding: "utf8" });
      const realDest = fs.realpathSync.native(dest);
      const v2Marker = fs.readFileSync(markerPath, "utf8");

      // Dry-run on existing owned installation does not alter files or marker
      const dryInstall = execFileSync(
        POSIX_SHELL,
        [INSTALL_SH, "--target", targetDir, "--copy", "--dry-run"],
        { encoding: "utf8" },
      );
      assert.match(dryInstall, /\[dry-run\] Would replace owned copy directory/);
      assert.equal(fs.readFileSync(markerPath, "utf8"), v2Marker);

      // Explicit schema_version=1 marker upgrades cleanly to schema_version=2
      const v1Marker = buildMarker({
        schemaVersion: "1",
        installPath: realDest,
        sourcePath: CANONICAL_SOURCE,
        files: [],
      });
      fs.writeFileSync(markerPath, v1Marker);
      execFileSync(POSIX_SHELL, [INSTALL_SH, "--target", targetDir, "--copy"], { encoding: "utf8" });
      const upgraded = fs.readFileSync(markerPath, "utf8");
      assert.match(upgraded, /^schema_version=2$/m);
      assert.match(upgraded, /^file=SKILL\.md$/m);

      // Dry-run uninstall leaves directory untouched
      const dryUninstall = execFileSync(
        POSIX_SHELL,
        [UNINSTALL_SH, "--target", targetDir, "--dry-run"],
        { encoding: "utf8" },
      );
      assert.match(dryUninstall, /\[dry-run\] Would remove owned copy directory/);
      assert.equal(fs.existsSync(path.join(dest, "SKILL.md")), true);

      // Update rollback: if Windows symlink fails over existing owned copy, existing copy is preserved
      if (process.platform === "win32") {
        // Test only if symlinks are disabled on Windows runner
        let symAllowed = true;
        try {
          execFileSync(
            POSIX_SHELL,
            ["-c", 'MSYS="winsymlinks:nativestrict" ln -s "$1" "$2" && [ -L "$2" ]', "_", CANONICAL_SOURCE, path.join(tempDir, "probe-link")],
            { stdio: "pipe" },
          );
        } catch {
          symAllowed = false;
        }
        if (!symAllowed) {
          runExpectFailure(POSIX_SHELL, [INSTALL_SH, "--target", targetDir]);
          assert.equal(fs.existsSync(path.join(dest, "SKILL.md")), true);
          assert.equal(fs.readFileSync(markerPath, "utf8"), upgraded);
        }
      }

      execFileSync(POSIX_SHELL, [UNINSTALL_SH, "--target", targetDir], { encoding: "utf8" });
      assert.equal(fs.existsSync(dest), false);

      // Strict /bin/dash verification when available (macOS/Linux)
      if (hasDash) {
        execFileSync("/bin/dash", [INSTALL_SH, "--target", targetDir, "--copy"], { encoding: "utf8" });
        assert.equal(fs.existsSync(path.join(dest, "SKILL.md")), true);
        execFileSync("/bin/dash", [INSTALL_SH, "--target", targetDir, "--copy"], { encoding: "utf8" });
        execFileSync("/bin/dash", [UNINSTALL_SH, "--target", targetDir], { encoding: "utf8" });
        assert.equal(fs.existsSync(dest), false);
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  },
);
