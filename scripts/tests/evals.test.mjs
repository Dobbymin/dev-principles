import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runStaticChecks } from "../lib/checker.mjs";
import { loadRules } from "../lib/rules.mjs";
import { REPO_ROOT } from "../validate.mjs";

const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "dp-evals-test-"));
const writeFixture = (root, relPath, content) => {
  const full = path.join(root, path.normalize(relPath));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
};

const RULES = loadRules(REPO_ROOT);

test("Eval 1 (True Positive): detects core, security, cycle, and preset boundary violations", () => {
  const dir = makeTempDir();
  try {
    writeFixture(
      dir,
      "src/features/auth/model/bad.tsx",
      `
const awsKey = "AKIA1234567890ABCDEF";
localStorage.setItem("accessToken", awsKey);
export function Danger({ html, data }: { html: string; data: any }) {
  fetch("/api/login");
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
`,
    );
    // Cycle: a.ts -> b.ts -> a.ts
    writeFixture(dir, "src/shared/a.ts", `import { b } from "./b"; export const a = b;\n`);
    writeFixture(dir, "src/shared/b.ts", `import { a } from "./a"; export const b = a;\n`);

    // FSD violations: entity -> feature (FSD-01), feature -> feature (FSD-02), deep internal import (FSD-03)
    writeFixture(
      dir,
      "src/entities/user/model/user.ts",
      `import { login } from "@/features/auth/model/login";\nexport const u = login;\n`,
    );
    writeFixture(
      dir,
      "src/features/cart/model/cart.ts",
      `import { auth } from "@/features/auth/model/login";\nexport const c = auth;\n`,
    );
    writeFixture(dir, "src/features/auth/model/login.ts", `export const login = () => {}; export const auth = true;\n`);

    const res = runStaticChecks({
      cwd: dir,
      preset: "fsd",
      rules: RULES,
      config: { architecture: { preset: "fsd", sourceRoot: "src" } },
    });

    const hitRules = new Set(res.findings.map((f) => f.ruleId));
    for (const expected of [
      "SEC-01",
      "SEC-02",
      "DQ-04",
      "TS-02",
      "DQ-02",
      "SOC-04",
      "FSD-01",
      "FSD-02",
      "FSD-03",
    ]) {
      assert.ok(hitRules.has(expected), `Expected True Positive for ${expected}`);
    }

    // Evidence contract: every finding has valid ruleId, severity, POSIX file, line > 0, message, why
    for (const f of res.findings) {
      assert.ok(f.ruleId);
      assert.ok(["must", "should", "prefer"].includes(f.severity));
      assert.equal(f.file.includes("\\"), false);
      assert.ok(f.line >= 1);
      assert.ok(f.message.length > 0);
      assert.ok(f.why.length > 0);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Eval 2 (True Positive): detects Next.js App Router RSC boundary violations", () => {
  const dir = makeTempDir();
  try {
    writeFixture(
      dir,
      "src/app/layout.tsx",
      `"use client";\nimport { cookies } from "next/headers";\nexport default function Layout() { return null; }\n`,
    );
    writeFixture(
      dir,
      "src/components/Panel.tsx",
      `'use client';\nimport { getSecret } from "../lib/db.server";\nexport const Panel = () => null;\n`,
    );

    const res = runStaticChecks({
      cwd: dir,
      preset: "next-app-router",
      rules: RULES,
      config: { architecture: { preset: "next-app-router", sourceRoot: "src" } },
    });
    const hitRules = new Set(res.findings.map((f) => f.ruleId));
    assert.ok(hitRules.has("NEXT-01"));
    assert.ok(hitRules.has("NEXT-04"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Eval 3 (False Positive Guard): 0 false positives on valid patterns and excluded paths", () => {
  const dir = makeTempDir();
  try {
    // 1. import/export as alias, unknown narrowing, non-auth localStorage, comments
    writeFixture(
      dir,
      "src/features/theme/model/theme.ts",
      `
// avoid any and dangerouslySetInnerHTML in comments
import { format as formatDate } from "../../../shared/lib/date";
localStorage.setItem("theme", "dark");
export const label = formatDate("2026-01-01");
export function parseErr(err: unknown): string {
  return err instanceof Error ? err.message : "unknown";
}
`,
    );
    writeFixture(dir, "src/shared/lib/date.ts", `export const format = (s: string) => s;\n`);

    // 2. Vendor UI components/ui/* excluded
    writeFixture(dir, "src/components/ui/button.tsx", `export const Button = (p: any) => p;\n`);

    // 3. Test file fixtures excluded
    writeFixture(dir, "src/features/theme/model/theme.test.ts", `const x = {} as any; fetch("/test");\n`);

    // 4. api-client.ts and *.server.ts allowed to call fetch
    writeFixture(dir, "src/shared/api/api-client.ts", `export const get = (u: string) => fetch(u);\n`);
    writeFixture(dir, "src/lib/loader.server.ts", `export const load = (u: string) => fetch(u);\n`);

    // 5. FSD @x cross-entity Public API allowed
    writeFixture(dir, "src/entities/user/@x/order.ts", `export type UserRef = { id: string };\n`);
    writeFixture(
      dir,
      "src/entities/order/model/order.ts",
      `import type { UserRef } from "@/entities/user/@x/order";\nexport type Order = { user: UserRef };\n`,
    );

    const res = runStaticChecks({
      cwd: dir,
      preset: "fsd",
      rules: RULES,
      config: { architecture: { preset: "fsd", sourceRoot: "src" } },
    });

    assert.equal(res.findings.length, 0, `Unexpected findings: ${JSON.stringify(res.findings)}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Eval 4 (Overrides & Security Invariants): honors TS-02 off, enforces DQ-04/SEC-01/SEC-02", () => {
  const dir = makeTempDir();
  try {
    writeFixture(
      dir,
      "src/app.ts",
      `
export const x: any = 1;
const k = "AKIA1234567890ABCDEF";
localStorage.setItem("auth_token", k);
`,
    );

    const res = runStaticChecks({
      cwd: dir,
      preset: "auto",
      rules: RULES,
      config: {
        architecture: { preset: "auto", sourceRoot: "src" },
        rules: { "TS-02": "off", "SEC-01": "off", "DQ-04": "off" },
      },
    });
    const hitRules = new Set(res.findings.map((f) => f.ruleId));
    assert.equal(hitRules.has("TS-02"), false);
    assert.equal(hitRules.has("SEC-01"), true);
    assert.equal(hitRules.has("DQ-04"), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Eval 5 (Agent Contract): all 4 subagents enforce Read-only, omit tools:, and define boundaries", () => {
  const agentsDir = path.join(REPO_ROOT, "agents");
  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md")).sort();
  assert.deepEqual(files, [
    "architecture-reviewer.md",
    "principles-reviewer.md",
    "security-reviewer.md",
    "structure-analyzer.md",
  ]);

  for (const file of files) {
    const content = fs.readFileSync(path.join(agentsDir, file), "utf8");
    assert.doesNotMatch(content, /^tools:/m, `${file} must not declare tools:`);
    assert.match(content, /Read-only/i, `${file} must state Read-only constraint`);
    assert.match(content, /## Boundaries with Other Agents/, `${file} must define agent boundaries`);
  }
});

test("Eval 6 (Custom tsconfig paths): detects alias violations and preserves @x false-positive guard", () => {
  const dir = makeTempDir();
  try {
    writeFixture(
      dir,
      "tsconfig.json",
      `{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@entities/*": ["src/entities/*"],
      "@features/*": ["src/features/*"]
    }
  }
}
`,
    );
    writeFixture(dir, "src/entities/user/@x/order.ts", `export type UserRef = { id: string };\n`);
    writeFixture(
      dir,
      "src/entities/order/model/order.ts",
      `import type { UserRef } from "@entities/user/@x/order";\nexport type Order = { user: UserRef };\n`,
    );
    writeFixture(
      dir,
      "src/entities/user/model/bad.ts",
      `import { act } from "@features/auth/model/act";\nexport const b = act;\n`,
    );
    writeFixture(dir, "src/features/auth/model/act.ts", `export const act = () => {};\n`);

    const res = runStaticChecks({
      cwd: dir,
      preset: "fsd",
      rules: RULES,
      config: { architecture: { preset: "fsd", sourceRoot: "src" } },
    });

    assert.equal(res.findings.some((f) => f.file === "src/entities/order/model/order.ts"), false);
    assert.equal(
      res.findings.some((f) => f.file === "src/entities/user/model/bad.ts" && f.ruleId === "FSD-01"),
      true,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
