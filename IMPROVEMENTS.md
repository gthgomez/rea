# IMPROVEMENTS.md — this fork's delta over morluto/rea

This repository is a MIT-licensed working fork of [morluto/rea](https://github.com/morluto/rea)
("REA: Reverse Engineer Anything"), operated by gthgomez as a self-hosted
deployment with Windows-first fixes. Upstream retains all credit for the
tool's design and implementation; the fork tracks upstream `main` and carries
a small, evidence-backed delta. All REA-authored code remains MIT; see
`LICENSE` and `THIRD_PARTY_NOTICES.md`.

Mission: keep REA's exact tool catalog and contracts, and make the
self-hosted deployment reliable on a Windows host driven from Git Bash by
MCP clients — starting with the failure modes our own campaigns hit in
practice.

## Confirmed issues and fix status

Each issue below was reproduced in this workspace; evidence lives under
`D:\Workspace\artifacts\rea-selfhost\2026-10-15\` unless noted.

### WIN-01 (fixed here): unusable TEMP fails the native self-test and all provider runtimes

When `TEMP`/`TMP` are unset or POSIX-style (`/tmp`, the Git Bash default),
Windows resolves the process temporary directory to the unwritable
`C:\WINDOWS\TEMP`. The bundled native self-test then fails with
`Open Windows path component failed [C:\WINDOWS\TEMP] (Win32 5): Access is denied`,
doctor classifies every provider as `runtime_failure`, and analysis commands
fail before doing work. This bit every REA invocation in our 2026-10-13/15
campaigns and required manual `TMP`/`TEMP` exports before each call.

Root cause chain: `os.tmpdir()`/`GetTempPathW` fall back to the system
directory → the native self-test (`WindowsNativeLoader` → `binding.call("inspect", [])`)
opens that directory and fails → `windowsNativeCapabilities` reports the
Windows controls unavailable → every provider-backed operation degrades.

Fix (this branch): `src/windows/TempEnvironmentGuard.ts` probes the resolved
temp directory once at dispatch (`scripts/rea.mjs`, before any compiled
runtime import) and repoints `TEMP`/`TMP` to `%LOCALAPPDATA%\Temp` when the
preferred resolution is not writable, declaring the repoint on stderr. A
failed probe leaves the environment untouched so upstream diagnostics keep
reporting the real constraint. The native artifact itself is unchanged and
still fully validates (version, ABI, architecture, SHA-256).

### WIN-02 (open): `--allowed-origins` array quoting breaks under Git Bash

Passing `--allowed-origins '["https://example.com"]'` from Git Bash mangles
the array argument (2026-10-15 Lovable campaign). Workaround: omit the flag.
Candidate fix: accept repeatable scalar flags (`--allowed-origin <url>`)
alongside the JSON array form.

### WIN-03 (open): browser scenario connect mode fails; parameter naming is inconsistent

`capture-browser-scenario` connect mode failed with a sparse
`execution_failure` while launch mode worked (2026-10-15 campaign). Connect
requires `cdp_endpoint` + `target_id`; `goto` actions require
`destination: {url, wait_until}`. Candidate fix: accept `endpoint` as an
alias, surface actionable connect diagnostics, and align parameter naming
across scenario actions.

### EVD-01 (open, matches upstream #4092): Evidence views require inlining the full Evidence

`inspect-analysis-view` needed the 247 MB application Evidence inlined into
the view input; on a 16 GB RAM host the projection was skipped. Candidate
fix: file-reference Evidence sources with streaming projection.

### MCP-01 (open, matches upstream #4025/#4058/#4081): catalog compatibility with strict MCP clients

Upstream reports Gemini clients rejecting the entire catalog over non-string
`const` schema values (#4025), Claude Desktop failing on `$ref` params passed
as strings (#4058), and `compare_web_captures` failing to register on Claude
Desktop Windows (#4081). Candidate fix: a schema-normalization pass and a
client-conformance lane that validates the catalog against the strictest
advertised-profile clients; upstream ships `verify:gemini-client` /
`verify:claude-client` lanes to build on.

### LC-01 (open, matches upstream #4005/#4009/#3985): cancellation and lifecycle emit false success

SIGINT during process-capture cleanup (#4005), cancellation during native
call finalization (#4009), and Hopper close after a timed-out probe (#3985)
report successful Evidence despite aborted work. Candidate fix: propagate
cancellation status into Evidence envelopes.

## Deployment notes (self-hosted)

- Source checkout: `D:\Workspace\tools\rea` (canonical, tracks upstream);
  task branches via worktrees; this fork publishes `gthgomez/rea`.
- The Windows native artifact is restored from the matching published
  `rea-agents@<version>` tarball per `native/windows/README.md` (the MinGW
  build lane is Linux-only). Digest-verified before loading.
- The MCP server runs from the deployed build via `node scripts/rea.mjs mcp`
  (stdio); harness configuration sets Windows-style `TMP`/`TEMP` explicitly
  in addition to WIN-01's in-process guard (belt and suspenders).
