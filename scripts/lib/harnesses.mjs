export const MANIFEST_PATHS = [
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  ".codex-plugin/plugin.json",
  ".agents/plugins/marketplace.json",
  ".cursor-plugin/plugin.json",
  ".antigravity-plugin/plugin.json",
  "gemini-extension.json",
];

export const HARNESS_CAPABILITIES = {
  "claude-code": {
    manifests: [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"],
    skills: true,
    agents: true,
    commands: true,
    hooks: true,
    fallback: "Full native plugin support (skills, agents, commands, SessionStart hook).",
  },
  codex: {
    manifests: [".codex-plugin/plugin.json", ".agents/plugins/marketplace.json"],
    skills: true,
    agents: false,
    commands: true,
    hooks: false,
    fallback: "Uses SKILL.md, commands, and AGENTS.md; agents/ and hooks/ are optional.",
  },
  cursor: {
    manifests: [".cursor-plugin/plugin.json"],
    skills: true,
    agents: false,
    commands: true,
    hooks: true,
    fallback: "SessionStart emits { additional_context } via CURSOR_PLUGIN_ROOT.",
  },
  antigravity: {
    manifests: [".antigravity-plugin/plugin.json"],
    skills: true,
    agents: true,
    commands: true,
    hooks: false,
    fallback: "Strict YAML agent frontmatter (no tools: field); invokes skills/ and agents/.",
  },
  "gemini-cli": {
    manifests: ["gemini-extension.json"],
    skills: true,
    agents: false,
    commands: false,
    hooks: false,
    fallback: "Loads skills/dev-principles/SKILL.md directly via contextFileName.",
  },
};
