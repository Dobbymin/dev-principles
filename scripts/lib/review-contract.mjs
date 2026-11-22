export const REVIEWER_DOMAINS = Object.freeze({
  "principles-reviewer": {
    prefixes: ["AI", "CC", "TS", "TEST", "A11Y", "DEP"],
    explicitIds: ["DQ-01", "DQ-02", "DQ-03", "DQ-05", "PERF-01", "PERF-02"],
  },
  "architecture-reviewer": {
    prefixes: ["SOC", "FB", "FSD"],
    explicitIds: ["NEXT-01", "NEXT-02", "NEXT-03", "NEXT-05", "NEXT-06", "PERF-03"],
  },
  "security-reviewer": {
    prefixes: ["SEC"],
    explicitIds: ["DQ-04", "NEXT-04"],
  },
});

const toPosixPath = (p) => String(p ?? "").replace(/\\/g, "/");

export const getOwnerReviewerForRule = (ruleId) => {
  const normalized = String(ruleId ?? "").toUpperCase();
  const prefix = normalized.split("-")[0];

  for (const [reviewerId, domain] of Object.entries(REVIEWER_DOMAINS)) {
    if (domain.explicitIds.includes(normalized)) {
      return reviewerId;
    }
  }
  for (const [reviewerId, domain] of Object.entries(REVIEWER_DOMAINS)) {
    if (domain.prefixes.includes(prefix)) {
      return reviewerId;
    }
  }
  return "principles-reviewer";
};

export const canDelegateReview = ({ fromReviewer, toReviewer, visited = [] } = {}) => {
  if (!toReviewer || fromReviewer === toReviewer) {
    return false;
  }
  if (!Object.hasOwn(REVIEWER_DOMAINS, toReviewer)) {
    return false;
  }
  const chain = visited.includes(fromReviewer) ? visited : [...visited, fromReviewer];
  if (chain.includes(toReviewer)) {
    return false;
  }
  if (chain.length >= 2) {
    return false;
  }
  return true;
};

export const normalizeFinding = (finding, defaultReviewerId = "principles-reviewer") => {
  const ruleId = String(finding.ruleId ?? "").toUpperCase();
  return {
    reviewerId: finding.reviewerId ?? defaultReviewerId ?? getOwnerReviewerForRule(ruleId),
    severity: String(finding.severity ?? "should").toLowerCase(),
    ruleId,
    file: toPosixPath(finding.file ?? ""),
    line: Number.isFinite(Number(finding.line)) ? Number(finding.line) : 1,
    evidence: String(finding.evidence ?? finding.message ?? ""),
    suggestion: String(finding.suggestion ?? ""),
  };
};

export const buildReviewResult = ({
  reviewerId = "principles-reviewer",
  scope = "repository",
  target = {},
  status = "completed",
  checkedAreas = [],
  findings = [],
  conflicts = [],
  unreviewedAreas = [],
  externalContext = null,
} = {}) => ({
  schemaVersion: 1,
  reviewerId,
  scope,
  target: {
    commit: target.commit ?? null,
    diff: target.diff ?? null,
    paths: Array.isArray(target.paths) ? target.paths.map(toPosixPath) : [],
  },
  status,
  checkedAreas: [...new Set(checkedAreas)],
  findings: findings.map((f) => normalizeFinding(f, reviewerId)),
  conflicts: Array.isArray(conflicts) ? conflicts : [],
  unreviewedAreas: [...new Set(unreviewedAreas)],
  externalContext: externalContext
    ? {
        source: externalContext.source ?? "external",
        prNumber: externalContext.prNumber ?? null,
        baseRef: externalContext.baseRef ?? null,
      }
    : null,
});

export const mergeReviewResults = (results = [], { externalFindings = [] } = {}) => {
  const deduped = new Map();

  const insertFinding = (raw, sourceReviewer) => {
    const item = normalizeFinding(raw, sourceReviewer);
    const key = `${item.ruleId}::${item.file}::${item.line}`;
    const existing = deduped.get(key);
    const canonicalOwner = getOwnerReviewerForRule(item.ruleId);

    if (!existing) {
      deduped.set(key, item);
      return;
    }

    // Prefer finding emitted by the canonical owner reviewer without reclassifying others
    if (item.reviewerId === canonicalOwner && existing.reviewerId !== canonicalOwner) {
      deduped.set(key, item);
    }
  };

  const checkedAreas = new Set();
  const unreviewedAreas = new Set();
  const conflictMap = new Map();
  let target = { commit: null, diff: null, paths: [] };
  let externalContext = null;
  const STATUS_RANK = { completed: 0, skipped: 1, findings_reported: 2, error: 3 };
  let status = "completed";

  for (const res of results) {
    if (!res) continue;
    if (res.status && (STATUS_RANK[res.status] ?? 0) > (STATUS_RANK[status] ?? 0)) {
      status = res.status;
    }
    if (res.target) {
      target = {
        commit: res.target.commit ?? target.commit,
        diff: res.target.diff ?? target.diff,
        paths: Array.from(new Set([...target.paths, ...(res.target.paths ?? [])])),
      };
    }
    if (res.externalContext && !externalContext) {
      externalContext = res.externalContext;
    }
    for (const area of res.checkedAreas ?? []) checkedAreas.add(area);
    for (const area of res.unreviewedAreas ?? []) unreviewedAreas.add(area);
    for (const c of res.conflicts ?? []) {
      conflictMap.set(`${c.ruleId}::${c.projectRule}`, c);
    }
    for (const f of res.findings ?? []) {
      insertFinding(f, res.reviewerId);
    }
  }

  for (const ext of externalFindings) {
    insertFinding(ext, ext.reviewerId ?? "external");
  }

  return buildReviewResult({
    reviewerId: "dev-principles-merged",
    scope: results[0]?.scope ?? "repository",
    target,
    status,
    checkedAreas: [...checkedAreas],
    findings: [...deduped.values()],
    conflicts: [...conflictMap.values()],
    unreviewedAreas: [...unreviewedAreas].filter((area) => !checkedAreas.has(area)),
    externalContext,
  });
};
