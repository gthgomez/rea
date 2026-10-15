# IMPROVEMENTS.md — this fork's delta over morluto/rea

This repository is a MIT-licensed working fork of [morluto/rea](https://github.com/morluto/rea)
("REA: Reverse Engineer Anything"), operated by gthgomez as a self-hosted
deployment (`gthgomez/rea-improved`, private) with Windows-first fixes.
Upstream retains all credit for the tool's design and implementation; the
fork tracks upstream `main` and carries a small, evidence-backed delta. All
REA-authored code remains MIT; see `LICENSE` and `THIRD_PARTY_NOTICES.md`.

Mission: keep REA's exact tool catalog and contracts, and make the
self-hosted deployment reliable on a Windows host driven from Git Bash by
MCP clients — starting with the failure modes our own campaigns hit in
practice.

## Confirmed issues and fix status

Evidence lives under `D:\Workspace\artifacts\rea-selfhost\2026-10-15\`
(reproductions, wire dumps, E2E outputs).

### WIN-01 (FIXED): unusable TEMP fails the native self-test and all provider runtimes

When `TEMP`/`TMP` are unset or POSIX-style (`/tmp`, the Git Bash default),
Windows resolves the process temporary directory to the unwritable
`C:\WINDOWS\TEMP`. The bundled native self-test then fails with
`Open Windows path component failed [C:\WINDOWS\TEMP] (Win32 5): Access is denied`
— **even for elevated, writable callers**, because the native admission layer
requires per-user DACL authority, so writability alone is the wrong probe —
and doctor classifies every provider as `runtime_failure`.

Fix: `src/windows/TempEnvironmentGuard.ts` probes the resolved temp directory
once at dispatch (`scripts/rea.mjs`, before any compiled runtime import),
excludes any directory inside the Windows directory tree, and repoints
`TEMP`/`TMP` to `%LOCALAPPDATA%\Temp`, declared on stderr. A failed probe
leaves the environment untouched (no silent fallback). Node 24 ignores a
POSIX-style `TEMP` via `os.tmpdir()`, which is why both hostile variants
(unset and `/tmp`) resolve to the same system path.

### MCP-01 (FIXED, matches upstream #4025/#4081): non-string const/enum values break strict MCP clients

Scan of all 207 advertised tool input schemas (pre-fix): 5 tools emitted
non-string `const` values — `inspect_web_page`, `analyze_web_bundle`,
`compare_web_captures` (booleans from `z.literal(true/false)` inside embedded
inspection shapes). The Gemini advertised-schema profile rejects the entire
catalog on this shape (#4025), and `compare_web_captures` is the tool
reported failing to register in Claude Desktop Windows (#4081).

Fix: `src/contracts/clientCompatibleAdvertisedSchema.ts` — a wire-presentation
transform (applied via the existing `transformAdvertisedInputJsonSchema` hook
in `toolSchemaMetadata.ts`) that downgrades any non-string `enum`/`const`
keyword to its JSON type. Canonical Zod validation is unchanged.
`advertisedInputSchemaConformance.test.ts` locks the guarantee over all
contracts. Verified on the wire: `tools/list` → 207 tools, 0 non-string
const/enum (`toolslist-wire.json`).

### WIN-02 (FIXED): `--allowed-origins` JSON-array quoting breaks under Git Bash

Fix: repeatable shell-safe `--allowed-origin <url>` scalar (comma-separated)
via `browserScopeOptions.allowedOrigin` + `mergedAllowedOrigins`, wired into
all browser/web CLI commands. E2E: `rea list-browser-targets
http://127.0.0.1:9333 --allowed-origin https://example.com` succeeded and
recorded the merged filter.

### WIN-03 (FIXED): browser-scenario connect mode takes `endpoint` alias; connect failures are actionable

Fix: the connect arm of `browserScenarioBrowserSchema` accepts `endpoint` as
an alias for `cdp_endpoint` (both optional at the type level; the scenario
refine requires one and rejects disagreement), consumers resolve the alias,
and `connectOverCDP` failures now name the endpoint and remediate
("Verify the endpoint with list-browser-targets…"). E2E: connect-mode
`capture-browser-scenario` using `endpoint` against a live Chrome CDP
succeeded (prior campaigns could not connect at all).

### EVD-01 (FIXED here; streaming follow-up remains, matches upstream #4092): Evidence views accept a local file source

`inspect_analysis_view` previously required inlining the complete Evidence
into the request (a 247 MB projection failed on a 16 GB RAM host). Fix:
`source: {kind: "file", path}` reads and parses the Evidence server-side and
routes it through the existing inline admission; the CLI command now routes
through the same raw entry. E2E: MCP `analyze_javascript_application` →
`export_evidence_bundle` (verbatim, server-side) → `inspect_analysis_view`
with the file source succeeded and produced the summary view.
**EVD-01b (open):** CLI `--json` tool output is a projection, not a verbatim
Evidence record — replaying it fails digest admission by design. Verbatim
records come from `export_evidence_bundle`. Investigate making CLI output
replayable or documenting the boundary in guides. True streaming projection
(no full parse) remains open with #4092.

### LC-01 (OPEN, matches upstream #4005/#4009/#3985): cancellation and lifecycle emit false success

SIGINT during process-capture cleanup (#4005), cancellation during native
call finalization (#4009), and Hopper close after a timed-out probe (#3985)
report successful Evidence despite aborted work. Plan (not yet implemented —
each requires per-provider lifecycle study): thread the abort signal's
settlement state into the Evidence envelope at the three named sites, add a
shared "cancelled-during-finalization" error class so envelopes cannot claim
success after an aborted cleanup, and extend the process-boundary test
project with cancellation races. Estimated as its own campaign.

## Deployment notes (self-hosted)

- Upstream canonical: `D:\Workspace\tools\rea` (tracks morluto/rea, clean).
- Private repo: `gthgomez/rea-improved` (this delta on `main`); public fork
  `gthgomez/rea` kept for future upstream contributions.
- The Windows native artifact is restored from the matching published
  `rea-agents@<version>` tarball per `native/windows/README.md` (the MinGW
  build lane is Linux-only). Digest-verified before loading.
- MCP service deploy: `D:\AgentData\services\rea-mcp` — detached worktree
  pinned to the verified commit; registered in ZCode user config
  (`~/.zcode/cli/config.json` → `mcp.servers.rea`, stdio). Redeploy = move
  the pin after verification.
- Harness config sets Windows-style `TMP`/`TEMP` explicitly in addition to
  WIN-01's in-process guard (belt and suspenders).

## Verification receipts (2026-10-15, remaining-fixes branch)

| Check                                                                             | Result                              |
| --------------------------------------------------------------------------------- | ----------------------------------- |
| `npm run compile` + `npm run typecheck`                                           | 0 errors                            |
| `npx vitest run` conformance + analysis-view + options tests                      | 40/40 passed                        |
| `npm run test:fast` (domain/services/adapters/composition/conformance/evaluation) | passed (exit 0)                     |
| MCP wire `tools/list`                                                             | 207 tools, 0 non-string const/enum  |
| E2E MCP loop: analyze → export bundle → file-source view                          | success (summary view produced)     |
| E2E `--allowed-origin` scalar (live Chrome CDP)                                   | success, filter recorded            |
| E2E connect scenario with `endpoint` alias (live Chrome CDP)                      | success (capture evidence produced) |
| Hostile-env doctor (WIN-01, prior branch, re-verified in service)                 | no `runtime_failure`                |
