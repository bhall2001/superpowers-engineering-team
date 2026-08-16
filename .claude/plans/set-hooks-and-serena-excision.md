# Plan: SET Hooks and Serena Excision

> **Execution:** This plan is built **by hand**, not with `/set-build`. Both hooks govern
> the behavior of spawned agents, so an Agent Team building them cannot distinguish a hook
> denial from a build failure. See "Bootstrap Constraint" below.
> **Design spec:** `docs/superpowers/specs/2026-08-16-set-hooks-and-serena-excision-design.md`

## Goal

Serena is gone from SET, and two enforcement hooks — agent-push-deny and
Agent-name-guard — install into project settings without disturbing the user's existing
hooks.

## Context

**SET is not initialized on itself.** No `.claude/agents/`, no `.claude/set/taxonomy.md`,
no `.claude/set/learnings/`. Every task carries `Specialist: generic` and `Shards: []` —
the true state of this repo, not an oversight.

**Test tooling exists** (added by the durable-runs work, contrary to CLAUDE.md's "no test
tooling" line, which is now stale):

- `plugins/set/tests/*.test.mjs` — 7 files, run by `node --test`
- `plugins/set/bin/` — the run-store CLI
- Idiom: `execFileSync` against a subprocess with temp-dir fixtures (`cli.test.mjs:14`)

Hook tests extend this harness — `execFileSync` on a `.sh` with JSON on stdin — rather
than introducing a second test framework.

**Tooling probed:** Node 24.16.0, `jq` 1.7.1. **`shellcheck` is NOT installed**, so no task
may depend on it.

**What exists today:**

- `install.sh` (~700 lines) — installs commands, writes `env` vars, manages marketplaces.
  Step 0 is Serena install; `scan_legacy_serena()` at :117 with call sites at :143 and :644.
  Does **not** currently manage hooks.
- `plugins/set/commands/*.md` — 7 command specs. Serena refs: `build.md` 19,
  `update.md` 22, `learn.md` 19, `init.md` 11, `review.md` 2.
- `plugins/set/references/*.md` — `enhanced-builder-prompt.md` and `enhanced-qa-prompt.md`
  carry 1 Serena ref each; `agent-return-channels.md` states the naming contract the
  Agent-name guard enforces structurally.
- User's live hooks (must survive every install/uninstall):
  `~/.claude/hooks/preload-serena.sh` (SessionStart),
  `~/.claude/hooks/prefer-serena.sh` (PreToolUse, matcher `Read|Grep|Bash`).

## Approach

**Sequential in three stages, per the spec's approved approach.** Excision first
(self-contained, grep-verifiable), then the probe (needs a human session restart), then
the hooks (built on probe evidence, against an already-simplified `build.md`).

Ordering is load-bearing: excision deletes the `mcp__serena__*` teammate ban that would
otherwise have been a third hook. Building hooks first means building something we discard.

**Parallelism is limited by design, not oversight.** T-excise-serena-from-command-specs and
T-excise-serena-from-install-sh touch disjoint files and could run concurrently — but this
plan is executed by one session by hand, so parallelism buys nothing and interleaved edits
make the grep gate harder to attribute. Tasks are ordered for verifiability instead.

**The probe is a hard serialization point.** Nothing hook-related can be designed until it
returns, because the push-deny's decision logic has two pre-committed branches and the
Agent-guard needs the exact `Agent` payload shape.

## Bootstrap Constraint

`/set-build` and `/set-review` **cannot** execute this plan. Verification is therefore
mechanical and agent-free at every step:

| Task | Verified by |
|---|---|
| Excision | `grep -ric serena` = 0 |
| Cleanup | `/set-update` run twice against a fixture |
| Probe | Log file contents, read by a human |
| Hooks | `node --test` — JSON on stdin, assert stdout |
| Merge/uninstall | `jq` assertions against a settings fixture holding the user's real hooks |

## Progress

<!-- Orchestrator-maintained. Builders never edit this section. -->

- [x] T-excise-serena-from-command-specs — passed 2026-08-16T00:00Z (commit 6ffcde9)
- [x] T-excise-serena-from-install-sh — passed 2026-08-16T00:00Z (commit 6ffcde9)
- [x] T-reconcile-serena-bookkeeping-in-upda — passed 2026-08-16T00:00Z (commit 6ffcde9)
- [x] T-install-payload-probe — passed 2026-08-16T00:00Z (awaiting human restart)
- [x] T-run-probe-matrix-and-write-findings — passed 2026-08-16 (commit 3d22566)
- [x] T-uninstall-payload-probe — passed 2026-08-16 (commit 37a5926)
- [x] T-hook-test-harness — passed 2026-08-16T00:00Z
- [x] T-deny-push-hook — passed 2026-08-16
- [ ] T-guard-agent-name-hook — pending
- [ ] T-hook-settings-merge-and-uninstall — pending
- [ ] T-wire-hooks-into-init-and-update — pending
- [ ] T-add-set-name-suffix-to-spawns — pending

---

## Tasks

### T-excise-serena-from-command-specs: Excise Serena from command specs

- **Specialist**: generic
- **Shards**: []
- **What**: Delete every Serena reference from the 5 command specs and 2 reference files,
  collapsing A1/A2 dual-path retrieval in `build.md` to the keyword path alone.
- **Files**:
  - `plugins/set/commands/build.md` — delete "Step 0: Resolve Serena State (Lazy
    Detection)"; in A2 delete the `serena_enabled` branch, keeping the keyword scan as the
    only path; delete the `mcp__serena__*` teammate ban (~15 lines under T2) and the
    matching note in the A3 bundle template; delete the same ban paragraph from Phase
    B-workflow
  - `plugins/set/commands/learn.md` — delete step 3a (migration + sentinel) and 3g (mirror)
  - `plugins/set/commands/init.md` — delete Serena detection and the `serena_enabled` write
  - `plugins/set/commands/review.md` — 2 one-line mentions
  - `plugins/set/references/enhanced-builder-prompt.md` — 1 mention
  - `plugins/set/references/enhanced-qa-prompt.md` — 1 mention
  - `CLAUDE.md` — delete the "Serena is optional" paragraph and the "Serena memories"
    shared-definition entry; **rewrite** the walled-environment paragraph so it justifies
    keyword retrieval on its own terms rather than referencing Serena
  - `README.md` — delete install steps and feature mentions
- **Tests**: `grep -ric serena plugins/ CLAUDE.md README.md` → every file reports 0.
  `grep -rn "serena_enabled\|\.serena-migrated" plugins/ CLAUDE.md README.md` → no output.
- **Blocked by**: none
- **Done when**:
  - `grep -ric serena` returns 0 for every file under `plugins/` plus `CLAUDE.md` and `README.md`
  - `build.md` A2 describes exactly one retrieval path (keyword scan), with no conditional
  - No file references `serena_enabled` or `.serena-migrated`
  - `build.md`'s A3 bundle template no longer instructs teammates about Serena
  - CHANGELOG.md is untouched (history, not a live reference)

#### TDD Steps

1. Write `plugins/set/tests/no-serena-refs.test.mjs` asserting `grep -ric serena` is 0
   across the target files, and that `serena_enabled` / `.serena-migrated` appear nowhere.
2. Run `node --test "plugins/set/tests/no-serena-refs.test.mjs"` — verify it FAILS,
   reporting the current counts (19/22/19/11/2/1/1/6/22).
3. Delete the references file by file.
4. Run the test — verify green.
5. Read the modified A2 and CLAUDE.md sections for coherence; a deletion that leaves a
   dangling "otherwise" or an orphaned conditional is not done.

#### Self-Review Checklist

- [ ] All acceptance criteria met — nothing missing
- [ ] No extra features beyond what was specified
- [ ] Tests cover happy path AND edge cases
- [ ] Follows project conventions from CLAUDE.md
- [ ] No hardcoded values, missing validation, or security issues
- [ ] CHANGELOG.md untouched
- [ ] A2 reads as a single path, not a branch with one arm deleted
- [ ] No orphaned prose referencing a deleted step

---

### T-excise-serena-from-install-sh: Excise Serena from install.sh

- **Specialist**: generic
- **Shards**: []
- **What**: Delete Serena installation, the legacy-config scan, and the summary line from
  the installer.
- **Files**: `install.sh`
  - Delete "Step 0: Serena MCP (optional)" — the `uv` check, the opt-in prompt, the
    `claude plugin install serena@...` call
  - Delete `scan_legacy_serena()` (:117) and both call sites (:143, :644)
  - Delete `LEGACY_SERENA_LOCATIONS` and its warning block
  - Delete the Serena line from the final summary (:645-646)
- **Tests**: `grep -ic serena install.sh` → 0. `bash -n install.sh` → exits 0 (syntax valid).
- **Blocked by**: none
- **Done when**:
  - `grep -ic serena install.sh` returns 0
  - `bash -n install.sh` exits 0
  - No unbound-variable references to `LEGACY_SERENA_LOCATIONS` remain
  - Step numbering after the deleted Step 0 remains coherent to a reader
  - The `uv` / `jq` dependency checks that serve non-Serena purposes are retained

#### TDD Steps

1. Extend `no-serena-refs.test.mjs` with a case asserting `grep -ic serena install.sh` is 0.
2. Run — verify it FAILS at 49.
3. Delete the blocks.
4. Run the test — verify green.
5. Run `bash -n install.sh` — verify syntax is valid after deletion.

#### Self-Review Checklist

- [ ] All acceptance criteria met — nothing missing
- [ ] No extra features beyond what was specified
- [ ] Tests cover happy path AND edge cases
- [ ] Follows project conventions from CLAUDE.md
- [ ] No hardcoded values, missing validation, or security issues
- [ ] `bash -n` passes
- [ ] No dangling variable references
- [ ] `uv` check removed only if it served Serena alone

---

### T-reconcile-serena-bookkeeping-in-upda: Reconcile Serena bookkeeping in update

- **Specialist**: generic
- **Shards**: []
- **What**: `/set-update` removes SET-owned Serena bookkeeping and warns when command files
  changed mid-run, naming what is still pending.
- **Files**: `plugins/set/commands/update.md`
- **Tests**: Fixture project containing `.claude/set/config.json` with `serena_enabled` plus
  a `.serena-migrated` sentinel. Assert after one reconcile: key gone, sentinel gone, all
  other config keys intact, `.serena/memories/` untouched. Assert a second reconcile is a
  silent no-op.
- **Blocked by**: T-excise-serena-from-command-specs
- **Done when**:
  - Removes `serena_enabled` from `.claude/set/config.json`, preserving every other key
  - Deletes `.claude/set/.serena-migrated`
  - **Never** touches `.serena/memories/`, `.serena/` config, user hooks, or MCP config
  - Reports what was removed, and states explicitly that `.serena/memories/` was left alone
    and why
  - Idempotent — a second run prints nothing and exits clean
  - Prints the version-change warning when the on-disk version differs from the version the
    run started as, listing pending reconcile work by name
  - The warning is self-clearing: it does not print when versions match

#### TDD Steps

1. Write `plugins/set/tests/update-reconcile.test.mjs` building the fixture in a temp dir
   (`mkdtempSync`, per `cli.test.mjs`), asserting post-reconcile state.
2. Run — verify FAIL (no reconcile step exists).
3. Write the reconcile step into `update.md`.
4. Run — verify green.
5. Add the idempotency case (second run silent) and the `.serena/memories/`-untouched case;
   verify both green.

#### Self-Review Checklist

- [ ] All acceptance criteria met — nothing missing
- [ ] No extra features beyond what was specified
- [ ] Tests cover happy path AND edge cases
- [ ] Follows project conventions from CLAUDE.md
- [ ] No hardcoded values, missing validation, or security issues
- [ ] Other `config.json` keys provably survive
- [ ] `.serena/memories/` provably untouched
- [ ] Warning names pending work, not just its own existence

---

### T-install-payload-probe: Install payload probe

- **Specialist**: generic
- **Shards**: []
- **What**: Install a logging-only hook and write the resume header, so the post-restart
  session can pick up without conversation context.
- **Files**:
  - `plugins/set/tests/fixtures/set-probe.sh` (throwaway; deleted by the uninstall task)
  - `<repo>/.claude/settings.json` — probe entry appended
  - `docs/superpowers/specs/2026-08-16-hook-payload-probe-findings.md` — resume header
- **Tests**: `echo '{"tool_name":"Bash","tool_input":{"command":"true"}}' | ./set-probe.sh`
  → exits 0, appends one entry to the log, emits no `permissionDecision`.
  `jq` the settings file → the user's existing hooks are still present.
- **Blocked by**: none
- **Done when**:
  - Probe hook logs `$CLAUDE_CODE_AGENT_NAME`, the full payload, and top-level payload keys
  - It **always** exits 0 and never emits a decision — it must not gate anything
  - Matcher covers both `Bash` and `Agent`
  - Settings merge is append-only; the user's `prefer-serena.sh` entry survives
  - Findings file exists with the resume header: what is installed, log path, the 5 cases
    and which have fired, the verbatim removal command, and the verbatim manual-abort
    command from the spec
- **Note**: This task ends by asking the human to restart their session. It does not proceed.

#### TDD Steps

1. Write `plugins/set/tests/probe-hook.test.mjs` asserting the probe exits 0, writes a log
   entry, and emits no decision on stdout.
2. Run — verify FAIL (no script).
3. Write `set-probe.sh`.
4. Run — verify green.
5. Merge the settings entry; assert via `jq` that the user's hooks survive.
6. Write the findings file resume header.

#### Self-Review Checklist

- [ ] All acceptance criteria met — nothing missing
- [ ] No extra features beyond what was specified
- [ ] Tests cover happy path AND edge cases
- [ ] Follows project conventions from CLAUDE.md
- [ ] No hardcoded values, missing validation, or security issues
- [ ] Probe cannot deny anything, even on malformed input
- [ ] User's existing hooks provably survive the merge
- [ ] Manual abort command is present and was copied verbatim from the spec

---

### T-run-probe-matrix-and-write-findings: Run probe matrix and write findings

- **Specialist**: generic
- **Shards**: []
- **What**: After the human restarts, run the 5-case trigger matrix and record answers to
  Q1-Q6 with raw payload evidence.
- **Files**: `docs/superpowers/specs/2026-08-16-hook-payload-probe-findings.md`
- **Tests**: Manual — the artifact is the log. Progress is derived from disk: count labeled
  entries in the log; `jq` the settings for the probe path; findings file present.
- **Blocked by**: T-install-payload-probe
- **Done when**:
  - All 5 cases fired and appear in the log: (a) main-context Bash, (b) named-spawn Bash,
    (c) unnamed-spawn Bash, (d) the `Agent` spawns themselves, (e) a `-set`-suffixed name
    with an explicit `subagent_type`
  - Q1-Q6 each answered with the raw payload as evidence
  - Q5 states whether a `-set` suffix satisfies the `name` pattern
  - Q6 states whether the suffix disturbed `subagent_type` routing
  - The findings state which pre-committed branch the push-deny takes, and why
- **Note**: Requires a human-run session restart before this task can begin.

#### TDD Steps

Not a TDD task — it is measurement. The discipline is instead:

1. Read the log before triggering anything; record the starting entry count.
2. Trigger each case individually, confirming a new log entry after each rather than
   batching and hoping.
3. For Q3, compare payloads across (a)/(b)/(c) side by side — a field present in all three
   with different values is a discriminator; one present only sometimes is not.
4. Record raw payloads verbatim. Paraphrase is not evidence.
5. State the chosen push-deny branch explicitly, so the next task has no decision to make.

#### Self-Review Checklist

- [ ] All acceptance criteria met — nothing missing
- [ ] No extra features beyond what was specified
- [ ] Findings cite raw payloads, not paraphrase
- [ ] Follows project conventions from CLAUDE.md
- [ ] Q1-Q6 each explicitly answered, including any answered "no"
- [ ] The push-deny branch is stated, not implied
- [ ] Absent evidence is recorded as absent, never inferred

---

### T-uninstall-payload-probe: Uninstall payload probe

- **Specialist**: generic
- **Shards**: []
- **What**: Remove the throwaway probe from settings and delete its artifacts.
- **Files**: `<repo>/.claude/settings.json`, `plugins/set/tests/fixtures/set-probe.sh`,
  the probe log
- **Tests**: `jq` the settings → no entry matching `set-probe`; the user's hooks still
  present. Probe script and log absent from disk.
- **Blocked by**: T-run-probe-matrix-and-write-findings
- **Done when**:
  - No settings entry matches `set-probe`
  - The user's `prefer-serena.sh` entry is byte-identical to before the probe was installed
  - Probe script and log deleted
  - The findings file is **retained** — it is the evidence artifact
- **Note**: Its own task precisely because a throwaway hook left installed would log
  silently and indefinitely. Never fold this into another task.

#### TDD Steps

1. Assert (via `jq`) that the probe entry is currently present — confirming the test can
   detect its removal.
2. Run the spec's manual-abort filter.
3. Assert the probe entry is gone and the user's entry is unchanged.
4. Confirm script and log are deleted, findings file retained.

#### Self-Review Checklist

- [ ] All acceptance criteria met — nothing missing
- [ ] No extra features beyond what was specified
- [ ] User's hooks byte-identical to the pre-probe state
- [ ] Follows project conventions from CLAUDE.md
- [ ] Findings file retained, not swept up with the throwaway artifacts

---

### T-hook-test-harness: Hook test harness

- **Specialist**: generic
- **Shards**: []
- **What**: A shared harness for driving hook scripts with JSON on stdin, plus a settings
  fixture carrying the user's real hook shapes.
- **Files**: `plugins/set/tests/helpers/hook-harness.mjs`,
  `plugins/set/tests/fixtures/settings-with-user-hooks.json`
- **Tests**: Self-testing — the harness runs a trivial echo hook and asserts the parsed
  result.
- **Blocked by**: none
- **Done when**:
  - Exposes a `runHook(script, payload)` returning parsed stdout, stderr, and exit code
  - Uses `execFileSync` with stdin, matching `cli.test.mjs`'s subprocess idiom
  - Fixture reproduces the real shape:
    `[{matcher, hooks:[{type, command, timeout}]}]`, including a `SessionStart` entry so
    merge tests prove SET touches only `PreToolUse`
  - Handles a non-zero exit without throwing, so fail-closed paths are assertable

#### TDD Steps

1. Write a test that runs a two-line echo hook through `runHook` and asserts the output.
2. Run — verify FAIL (no harness).
3. Implement `runHook`.
4. Run — verify green.
5. Add a case for a hook exiting non-zero; verify it is captured, not thrown.

#### Self-Review Checklist

- [ ] All acceptance criteria met — nothing missing
- [ ] No extra features beyond what was specified
- [ ] Tests cover happy path AND edge cases
- [ ] Follows project conventions from CLAUDE.md
- [ ] No hardcoded values, missing validation, or security issues
- [ ] Fixture mirrors the real settings shape, not a simplified one
- [ ] Non-zero exits are assertable

---

### T-deny-push-hook: Deny push hook

- **Specialist**: generic
- **Shards**: []
- **What**: PreToolUse hook denying agent-initiated pushes and PR creation, fail-closed.
- **Files**: `plugins/set/hooks/set-deny-push.sh`,
  `plugins/set/tests/deny-push.test.mjs`
- **Tests**: `node --test "plugins/set/tests/deny-push.test.mjs"`
- **Blocked by**: T-hook-test-harness, T-run-probe-matrix-and-write-findings
- **Done when** — each row is a test case:
  - `git push` → deny
  - `git push origin main` → deny
  - `pnpm test && git push` → deny (chaining)
  - `git commit -m x; git push` → deny (`;` chaining)
  - `env FOO=1 git push` → deny (leading env)
  - `sudo git push` → deny
  - `gh pr create --title x` → deny
  - `gh pr merge 5` → deny
  - `git commit -m "x"` → **allow** (builders must commit)
  - `gh pr view 5` → allow
  - `git status` → allow
  - malformed JSON payload → deny, with a reason
  - `jq` unavailable → deny, with a reason
  - Deny message includes the `!git push origin <branch>` escape hatch
  - Identity carve-out present only if the probe's findings support it; otherwise
    unconditional deny
  - Unknown identity → deny, under either branch

#### TDD Steps

1. Write the full case table above as failing tests.
2. Run — verify all FAIL (no script).
3. Implement the hook: parse `tool_input.command`, normalize, match.
4. Run — iterate to green.
5. Add the fail-closed cases (malformed payload, missing `jq`) and verify they deny rather
   than crash or allow.

#### Self-Review Checklist

- [ ] All acceptance criteria met — nothing missing
- [ ] No extra features beyond what was specified
- [ ] Tests cover happy path AND edge cases
- [ ] Follows project conventions from CLAUDE.md
- [ ] No hardcoded values, missing validation, or security issues
- [ ] `git commit` provably allowed — a hook blocking commits breaks checkpoints
- [ ] Every failure path denies; none allow or crash
- [ ] Deny message teaches the escape hatch

---

### T-guard-agent-name-hook: Guard agent name hook

- **Specialist**: generic
- **Shards**: []
- **What**: PreToolUse hook rejecting `Agent` spawns that carry both a `name` and a
  verifier-shaped prompt.
- **Files**: `plugins/set/hooks/set-guard-agent-name.sh`,
  `plugins/set/tests/guard-agent-name.test.mjs`
- **Tests**: `node --test "plugins/set/tests/guard-agent-name.test.mjs"`
- **Blocked by**: T-hook-test-harness, T-run-probe-matrix-and-write-findings
- **Done when** — each row is a test case:
  - named + prompt containing the verdict schema (`passed`, `spec_compliant`,
    `tdd_followed`) → deny
  - named + prompt containing "you write NO code" → deny
  - named builder prompt (no verifier markers) → allow
  - unnamed + verifier-shaped prompt → allow (the correct spawn)
  - unnamed + builder prompt → allow
  - non-`Agent` tool → allow (defensive; matcher should prevent it)
  - malformed payload → deny, with a reason
  - Deny message names the rule and the fix ("re-spawn without `name`")
  - Payload field paths match the probe's Q4 findings exactly

#### TDD Steps

1. Write the case table as failing tests, using the real `Agent` payload shape from Q4.
2. Run — verify FAIL.
3. Implement: read `tool_input.name` and `tool_input.prompt`, apply verifier-shape markers.
4. Run — iterate to green.
5. Add the false-positive case (a builder prompt that quotes the schema) and record the
   observed behavior in a comment — this is the known heuristic limit, not a bug to fix.

#### Self-Review Checklist

- [ ] All acceptance criteria met — nothing missing
- [ ] No extra features beyond what was specified
- [ ] Tests cover happy path AND edge cases
- [ ] Follows project conventions from CLAUDE.md
- [ ] No hardcoded values, missing validation, or security issues
- [ ] Field paths verified against probe findings, not assumed
- [ ] Named builders provably allowed — a hook blocking them halts every build
- [ ] Deny message states the fix

---

### T-hook-settings-merge-and-uninstall: Hook settings merge and uninstall

- **Specialist**: generic
- **Shards**: []
- **What**: Idempotent append-only merge of SET hook entries into project settings, plus an
  uninstall that removes only SET's entries.
- **Files**: `plugins/set/bin/set-hooks.mjs`,
  `plugins/set/tests/hook-settings-merge.test.mjs`
- **Tests**: `node --test "plugins/set/tests/hook-settings-merge.test.mjs"`
- **Blocked by**: T-hook-test-harness
- **Done when** — each row is a test case:
  - Merge into settings holding the user's two hooks → both survive; SET entries appended
  - Merge into settings with **no** `hooks` key → succeeds, does not error
  - Merge into `{}` → succeeds
  - Merge run twice → idempotent; no duplicate SET entries
  - Uninstall → SET entries gone, user's hooks byte-identical
  - Uninstall when no SET entries exist → no-op, no error
  - `SessionStart` entries are never touched (SET registers only `PreToolUse`)
  - Uses the spec's verified filter shape:
    `if (.hooks.PreToolUse | type) == "array" then … else . end`,
    with `any(.hooks[]?; …)` rather than `.hooks[0]`
- **Note**: The spec verified this filter against 4 cases; the naive
  `(.hooks.PreToolUse? // []) |=` form errors on settings lacking the key. Do not
  "simplify" it back.

#### TDD Steps

1. Write the case table as failing tests, using the fixture with the user's real hooks.
2. Run — verify FAIL.
3. Implement merge and uninstall with the verified filter shape.
4. Run — iterate to green.
5. Add the byte-identical assertion for the user's entries after a full
   install→uninstall round trip.

#### Self-Review Checklist

- [ ] All acceptance criteria met — nothing missing
- [ ] No extra features beyond what was specified
- [ ] Tests cover happy path AND edge cases
- [ ] Follows project conventions from CLAUDE.md
- [ ] No hardcoded values, missing validation, or security issues
- [ ] Round-trip leaves the user's hooks byte-identical
- [ ] Missing-key and empty-object cases provably do not error
- [ ] Never assigns to `.hooks` wholesale

---

### T-wire-hooks-into-init-and-update: Wire hooks into init and update

- **Specialist**: generic
- **Shards**: []
- **What**: `/set-init` and `/set-update` install the hooks into project settings;
  `install.sh` places the scripts centrally.
- **Files**: `plugins/set/commands/init.md`, `plugins/set/commands/update.md`,
  `install.sh`
- **Tests**: Fixture project — run the init path, assert both SET entries present and the
  user's hooks intact; run the update path against a project with no hooks, assert they are
  added.
- **Blocked by**: T-hook-settings-merge-and-uninstall, T-deny-push-hook,
  T-guard-agent-name-hook
- **Done when**:
  - `install.sh` copies hook scripts to `~/.claude/set/hooks/` and marks them executable
  - `/set-init` merges both entries into `<repo>/.claude/settings.json`, referencing the
    scripts by absolute path
  - `/set-update` installs them too — covering users who initialized before this change
  - Both are idempotent
  - Entries land in **project** settings, never `~/.claude/settings.json`
  - `/set-update`'s pending-work list names hook installation when it has not yet happened

#### TDD Steps

1. Write a fixture-project test asserting post-init settings contain both entries plus the
   user's originals.
2. Run — verify FAIL.
3. Wire `install.sh` script placement, then the two command specs.
4. Run — verify green.
5. Add the idempotency case (init twice → no duplicates).

#### Self-Review Checklist

- [ ] All acceptance criteria met — nothing missing
- [ ] No extra features beyond what was specified
- [ ] Tests cover happy path AND edge cases
- [ ] Follows project conventions from CLAUDE.md
- [ ] No hardcoded values, missing validation, or security issues
- [ ] Nothing writes to `~/.claude/settings.json`
- [ ] Scripts are executable after install
- [ ] Absolute paths, so N projects share one copy

---

### T-add-set-name-suffix-to-spawns: Add set name suffix to spawns

- **Specialist**: generic
- **Shards**: []
- **What**: Every SET-spawned named agent carries a `-set` suffix, making SET provenance
  structural rather than inferred.
- **Files**: `plugins/set/commands/build.md` (T2 spawn template),
  `plugins/set/references/agent-return-channels.md`
- **Tests**: `grep -n 'name: "{Specialist}-set"' plugins/set/commands/build.md` matches.
  Documentation states the marker is corroborating evidence for denial, never its trigger.
- **Blocked by**: T-run-probe-matrix-and-write-findings
- **Done when**:
  - T2's spawn template names builders `{Specialist}-set`
  - Verifiers remain **unnamed** — unchanged, per the return-channel contract
  - `agent-return-channels.md` documents the suffix and its polarity rule
  - Polarity is stated explicitly: absence of the marker never implies permission
  - Applied only if the probe's Q5/Q6 confirmed the suffix validates and does not disturb
    `subagent_type` routing; if it did not, this task is dropped and the findings record why
- **Note**: `[SET]` cannot be used — the `name` pattern
  (`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`) excludes brackets.

#### TDD Steps

1. Confirm Q5/Q6 in the findings support the suffix. If not, stop and record the drop.
2. Write a test asserting `build.md`'s T2 template contains the suffixed form and that
   verifier spawn templates carry no `name`.
3. Run — verify FAIL.
4. Update the template and the reference doc.
5. Run — verify green.

#### Self-Review Checklist

- [ ] All acceptance criteria met — nothing missing
- [ ] No extra features beyond what was specified
- [ ] Tests cover happy path AND edge cases
- [ ] Follows project conventions from CLAUDE.md
- [ ] No hardcoded values, missing validation, or security issues
- [ ] Verifiers still spawn unnamed
- [ ] Polarity rule documented, not merely implied
- [ ] Gated on probe evidence, not assumption

---

## Unresolved Questions

1. Probe outcome decides whether the push-deny gets an identity carve-out. Pre-committed
   both ways in the spec; not blocking.
2. `-set` suffix ships only if Q5/Q6 confirm. Task drops cleanly if not.
3. ~~CLAUDE.md's "no test tooling" line is stale~~ — checked during build; CLAUDE.md
   already documents the `plugins/set/bin/` test exception. No action needed.
