# Security Policy

## Reporting a Vulnerability

If you discover a security issue in `dev-principles` (for example, unsafe shell handling in `install.sh` or unintended file writes in `bin/dev-principles.mjs`), please report it privately via GitHub Security Advisories on `Dobbymin/dev-principles` instead of opening a public issue.

## Security Invariants

- No remote telemetry is collected.
- Non-interactive invocations never infer destructive approvals.
- Security rule `DQ-04` (no access tokens in `localStorage`/`sessionStorage`) is treated as a security invariant and cannot be silently disabled.
