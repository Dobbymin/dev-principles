import fs from "node:fs";
import path from "node:path";

export const SECURITY_INVARIANTS = new Set(["DQ-04", "SEC-01", "SEC-02"]);

const CORE_FILES = [
  "ai-workflow.md",
  "clean-code.md",
  "typescript.md",
  "architecture-soc.md",
  "data-and-state.md",
  "security-and-reliability.md",
  "testing-and-verification.md",
  "performance-and-a11y.md",
];

const PRESET_FILES = [
  { file: "presets/feature-based.md", preset: "feature-based" },
  { file: "presets/fsd.md", preset: "fsd" },
  { file: "presets/next-app-router.md", preset: "next-app-router" },
];

const normalizeNewlines = (text) => text.replace(/\r\n/g, "\n");

export const parseRuleSections = (content, sourceFile, presetName = null) => {
  const normalized = normalizeNewlines(content);
  const sections = normalized.split(/\n(?=### `([A-Z0-9]+-\d{2})` )/);
  const rules = [];

  for (const section of sections) {
    const headerMatch = section.match(/^### `([A-Z0-9]+-\d{2})`\s+(.+)$/m);
    if (!headerMatch) continue;

    const id = headerMatch[1].trim();
    const title = headerMatch[2].trim();
    const category = id.split("-")[0];

    const severityMatch = section.match(/^- \*\*강도\*\*:\s*`([A-Z]+)`/m);
    const automationMatch = section.match(
      /^- \*\*자동화\*\*:\s*`(manual|static|automated|hybrid)`(?:\s*[—-]\s*(.+))?$/m,
    );
    const scopeMatch = section.match(/^- \*\*적용 범위\*\*:\s*(.+)$/m);
    const ruleMatch = section.match(/^- \*\*규칙\*\*:\s*(.+)$/m);
    const whyMatch = section.match(/^- \*\*이유 \(Why\)\*\*:\s*(.+)$/m);
    const exceptionsMatch = section.match(/^- \*\*예외 \/ 오탐 방지\*\*:\s*(.+)$/m);
    const exampleMatch = section.match(/```[a-zA-Z]*\n([\s\S]*?)```/);

    rules.push({
      id,
      title,
      category,
      preset: presetName,
      severity: severityMatch ? severityMatch[1].toLowerCase() : "should",
      automation: automationMatch ? automationMatch[1].toLowerCase() : "manual",
      automationDetail: automationMatch?.[2] ? automationMatch[2].trim() : "",
      scope: scopeMatch ? scopeMatch[1].trim() : "",
      rule: ruleMatch ? ruleMatch[1].trim() : "",
      why: whyMatch ? whyMatch[1].trim() : "",
      exceptions: exceptionsMatch ? exceptionsMatch[1].trim() : "",
      example: exampleMatch ? exampleMatch[0].trim() : "",
      sourceFile,
    });
  }

  return rules;
};

export const loadRules = (repoRoot) => {
  const refsDir = path.join(repoRoot, "skills", "dev-principles", "references");
  const rules = [];

  for (const rel of CORE_FILES) {
    const fullPath = path.join(refsDir, path.normalize(rel));
    if (!fs.existsSync(fullPath)) continue;
    const sourceFile = `skills/dev-principles/references/${rel}`;
    rules.push(...parseRuleSections(fs.readFileSync(fullPath, "utf8"), sourceFile, null));
  }

  for (const { file, preset } of PRESET_FILES) {
    const fullPath = path.join(refsDir, path.normalize(file));
    if (!fs.existsSync(fullPath)) continue;
    const sourceFile = `skills/dev-principles/references/${file}`;
    rules.push(...parseRuleSections(fs.readFileSync(fullPath, "utf8"), sourceFile, preset));
  }

  return rules;
};

export const resolveEffectiveRules = (rules, config, presetOverride = null) => {
  const activePreset = presetOverride ?? config?.architecture?.preset ?? "auto";
  const overrides = config?.rules ?? {};

  return rules
    .filter((rule) => rule.preset === null || rule.preset === activePreset)
    .map((rule) => {
      const override = overrides[rule.id];
      const isSecurityInvariant = SECURITY_INVARIANTS.has(rule.id);
      const effectiveSeverity =
        override && !(isSecurityInvariant && override === "off") ? override : rule.severity;
      return {
        ...rule,
        defaultSeverity: rule.severity,
        effectiveSeverity,
        overridden: Boolean(override && effectiveSeverity !== rule.severity),
        securityInvariant: isSecurityInvariant,
      };
    });
};
