# SET Phase 1 — Serena Excision + Enforcement Hooks

**Date:** 2026-08-16
**Status:** Approved design, pending implementation plan
**Branch:** `feat/set-hooks-and-serena-excision`

## Problem

SET carries an optional Serena MCP dependency that its own documentation has
already argued out of the design without removing from the code. SET's CLAUDE.md
states Serena "is a semantic index over the learning shards, nothing more" and
that shards "are the source of truth"; `build.md` bans teammates from calling
Serena at all, because a single stdio process with one mutable `_active_project`
pointer has no per-caller isolation and silently returns wrong answers under
parallel agents. In the walled environments SET targets — devcontainers,
isolated worktrees — no agent can reach an MCP server, the lead included.

The result is a dependency that is unusable by teammates, unreachable in the
target topology, never authoritative, and required to never block anything —
while remaining fully wired across 152 references in 10 files.

Separately, SET ships **zero hooks**. It enforces rules through prose that
spawned agents can rationalize past: a `mcp__serena__*` ban repeated in every
task bundle, a naming contract given a 74-line reference file, and a human
review gate ("NEVER push commits without explicit human approval") that exists
only as an instruction. Prose degrades under autonomy. Hooks do not.

## Goals

1. Remove Serena from SET entirely, collapsing dual-path retrieval to the
   keyword path that already runs by default.
2. Add SET-owned enforcement hooks for the two rules where prose is weakest:
   agent-initiated pushes, and the agent-naming return-channel contract.
3. Establish and apply one uninstall rule: **SET removes only what SET created,
   inside SET's own directories.**

## Non-Goals

- Changing the user's personal Serena setup. `prefer-serena.sh`,
  `preload-serena.sh`, `.serena/memories/`, and any project CLAUDE.md rule
  requiring Serena for code navigation are explicitly out of scope and must not
  be touched.
- A SessionStart Task-tool availability hook. Considered and **dropped**: a
  shell hook cannot call a Claude tool, so it can only verify the settings half
  of the availability gate — the exact half that produced the 1.3.3 bug where
  the gate passed while the tools were absent. The gate in `build.md` was just
  fixed and stays as-is. Reconsider in Phase 2.
- Tier 2 (pull-model builders, peer-to-peer channels) and Tier 3 (build.md
  decomposition). Separate phases, designed after hooks exist.

## Bootstrap Constraint

**`/set-build` and `/set-review` cannot build this.** Both hooks govern the
behavior of spawned agents, and `/set-review` fans out via dynamic workflow with
a `--light` mode that calls `Agent` directly — precisely what the Agent-name
guard intercepts. Installing hooks that govern the agents doing the installing
makes a denial indistinguishable from a build failure.

Only `/set-design` and `/set-plan` are safe (main-context, no spawning). The
plan must therefore carry hard, self-verifiable steps. This is achievable
because hooks are shell scripts testable outside any Claude session:

```
echo '{"tool_name":"Bash","tool_input":{"command":"git push"}}' | ./set-deny-push.sh
```

Table-driven shell tests over stdin/stdout, running in milliseconds, with no
agent involvement. This is a stronger correctness story than a verifier agent
provides.

## Approach

**Sequential, two commits, probe in the middle.** Serena excision lands first as
a self-contained commit, verifiable by grep alone. The payload probe runs next
(requires a human session restart). Hooks are built last, on probe evidence,
against an already-simplified `build.md`.

Ordering matters: excision deletes the `mcp__serena__*` teammate ban, which
would otherwise have been a third hook. Building hooks first would mean building
something we then discard.

Rejected:
- *Parallel tracks* — parallelism is illusory without `/set-build`; it only
  interleaves edits and makes the diff harder to verify.
- *Probe first* — needlessly blocks independent excision work behind a manual
  gate it does not depend on.

---

## Section 1 — Serena Excision

### Scope by file

| File | Refs | Change |
|---|---|---|
| `install.sh` | 49 | Delete Step 0 (plugin install, `uv` check, opt-in prompt), `scan_legacy_serena()` + both call sites, summary line |
| `plugins/set/commands/build.md` | 19 | Delete "Step 0: Resolve Serena State"; collapse A1/A2 to keyword-only; delete teammate ban (~15 lines) + A3 bundle note; delete same ban from Phase B-workflow |
| `plugins/set/commands/update.md` | 22 | Replace Serena-update logic with Section 2 cleanup |
| `plugins/set/commands/learn.md` | 19 | Delete 3a (migration + sentinel) and 3g (mirror) |
| `plugins/set/commands/init.md` | 11 | Delete Serena detection and config write |
| `CLAUDE.md` | 6 | Delete "Serena is optional" and "Serena memories" definitions; **keep** the walled-environment rationale — it now justifies keyword retrieval directly |
| `README.md` | 22 | Delete install steps and feature mentions |
| `review.md`, `enhanced-builder-prompt.md`, `enhanced-qa-prompt.md` | 4 | One-line mentions |

### Retrieval collapses to one branch

A1 (load shards tagged by the plan) is unchanged. A2 loses its Serena fork and
keeps the keyword scan verbatim — `grep -rin` over plain markdown, capped at top
5, deduped against A1. `build.md` already describes this as "the default, and
the only path in walled environments." No new code is written; a branch is
deleted.

`serena_enabled` disappears from `.claude/set/config.json`. This also kills a
latent ordering bug: `learn.md` gates on a key only `build.md` writes, so
`/set-learn` before a first build silently skipped migration.

### Deliberately retained

- CHANGELOG history — a record of what happened, not a live reference.
- The walled-environment rationale in CLAUDE.md, rewritten to stand on its own.

### Knowingly lost

`scan_legacy_serena` is real diagnostic value — it detects a standalone Serena
running alongside the plugin, the cause of duplicate `uvx` processes and
`/plugin` reporting `-32000`. With Serena out of SET, the diagnostic has no
home. Accepted.

### Verification

```bash
grep -ric serena plugins/ install.sh CLAUDE.md README.md
```

Returns zero. Non-negotiable, checkable without an agent.

---

## Section 2 — Migration & Cleanup

`/set-update` gains one reconcile step, following the precedent it set for the
1.0 Compound Teams removal.

### Removes (SET-owned bookkeeping only)

- `serena_enabled` from `.claude/set/config.json` — leaves the file and all
  other keys intact
- `.claude/set/.serena-migrated` sentinel

### Never touches

- `.serena/memories/` — **Serena's directory, not SET's.** Contains
  user-authored memories SET never wrote.
- `.serena/` project config
- Any user hook, MCP config, or CLAUDE.md rule

### The rule

> **SET removes only what SET created, inside SET's own directories.**

Stated once, applied in Section 2 and again in Section 4's uninstall path. A
`source:`-frontmatter filter over `.serena/memories/` was considered and
rejected: it is a heuristic, and a tool that deletes from another tool's data
directory destroys trust the first time it guesses wrong.

### Reports

```
Removed stale Serena bookkeeping:
  - serena_enabled (config.json)
  - .serena-migrated sentinel

Note: .serena/memories/ left untouched — Serena owns that directory.
SET no longer reads it. Delete manually if you want it gone.
```

The final line is required: a user who sees SET drop Serena and finds memories
still present must know it is deliberate, not a leak.

### Idempotent

Both removals are no-ops when already absent, so `/set-update` runs repeatedly
and converges from any prior SET version without version detection.

### The two-run upgrade, and how the user learns about it

A user upgrading runs their **old** installed `/set-update`, which lacks the
reconcile step. They receive new command files; the reconcile has not run. The
notice must therefore come from the **new** command — it runs after the file
swap and is the first thing that knows one occurred.

After installing new command files, `/set-update` compares the version it
started as against the version now on disk. When they differ:

```
⚠  SET was upgraded during this run (1.4.0 → 1.5.0).

The reconcile step for this version did not run — you were executing the
previous /set-update. Run /set-update once more to complete the upgrade.

Pending for this project:
  - Remove stale Serena bookkeeping (serena_enabled, .serena-migrated)
```

Three required properties:

1. **Names what is pending, not merely that something is.** A bare "run again"
   is ignored; a specific list is acted on.
2. **Self-clearing.** On the second run the version comparison shows no change,
   the reconcile finds nothing, and nothing prints. A clean exit is the signal
   the user is done. No sentinel, no persisted state — it falls out of the
   version comparison and the idempotency above.
3. **Generalized.** Keyed on "did the command files change under me," so it
   serves every future SET upgrade shipping an on-disk migration. The Serena
   line is one entry in a pending list, not the message itself.

**Known limit:** already-installed old command files cannot be made to say
anything new. The realistic experience is run-once (silent, gets new files),
run-again (reconciles, exits clean). The warning is the safety net for a user
who stops after one run.

### Verification

Run `/set-update` twice against a fixture project containing both artifacts.
First run removes and reports; second run is silent and exits clean.

---

## Section 3 — Hook Payload Probe

Evidence-gathering that both hooks depend on. A plan task with a committed
artifact, not a design decision.

### Questions

| Q | Question | Consumed by |
|---|---|---|
| Q1 | Does a PreToolUse hook subprocess inherit `$CLAUDE_CODE_AGENT_NAME`? | push-deny carve-out |
| Q2 | Does the payload itself carry agent identity under any key? | push-deny carve-out |
| Q3 | Is main-session distinguishable from named-spawn and unnamed-spawn? | push-deny carve-out |
| Q4 | Exact `tool_input` shape of an `Agent` call — where `name` appears | Agent-name guard |
| Q5 | Does a `-set`-suffixed `name` satisfy the `name` pattern constraint? | agent marker |
| Q6 | Does a suffixed `name` disturb `subagent_type` specialist routing? | agent marker |

Q5/Q6 exist because the `Agent` tool's `name` is pattern-constrained
(`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`), which **excludes brackets** — so `[SET]`
cannot be used. `-set` satisfies the pattern. `subagent_type` is a separate
parameter resolved from `.claude/agents/*.md` frontmatter, so a `name` suffix
should not affect routing; Q6 confirms it, because getting this wrong breaks
specialist routing entirely.

### Method

A throwaway hook that logs and never decides — `exit 0` unconditionally, matcher
covering `Bash` and `Agent`. Records `$CLAUDE_CODE_AGENT_NAME`, the full
payload, and top-level payload keys to a log file.

Trigger matrix, one session:

1. Main context runs a trivial `Bash` → case (a), the human
2. Main context spawns a **named** agent that runs `Bash` → case (b), a teammate
3. Main context spawns an **unnamed** agent that runs `Bash` → case (c), a verifier
4. The `Agent` spawns in 2 and 3 themselves → Q4
5. One spawn uses a `-set`-suffixed name with an explicit `subagent_type` → Q5/Q6

Cases 2 and 3 are the crux: a named spawn is how SET runs builders, an unnamed
spawn is how it runs verifiers, and the guard must separate them from payload
alone.

**Requires the human.** Hooks load at session start: write hook + settings
entry, restart, run the matrix, read the log. There is no in-session shortcut.

### Pre-committed decision

Recorded now so the result does not reopen the design:

- **If (a) is reliably distinguishable from (b)/(c):** the push-deny gains an
  identity carve-out — the human may ask Claude to push in a supervised session;
  teammates may not. Unknown identity → **deny**.
- **If not:** unconditional deny. The human pushes with `!git push`, which fires
  no hook.

**Fallback is DENY under both outcomes**, per SET's fail-closed rule: the
explicit branch allows, the fallthrough denies. A push gate that fails open is
worse than no gate.

### Artifact

A findings file recording each answer with raw payload evidence, committed
alongside the hooks. It justifies whichever branch the hooks take and explains
their shape to a later reader.

### Surviving the restart

The restart falls **inside** this task, not between tasks:

```
write hook + settings entry   ─┐
                               ├─ before restart
restart session               ─┘
run 5-case trigger matrix     ─┐
read log, write findings       ├─ after restart
remove probe hook             ─┘
```

A plan checkbox is too coarse for this. After the restart, "probe: in progress"
does not say whether the hook is installed, which cases have fired, or whether
cleanup has happened — and the conversation context that knew is gone.

**State is derived from disk, never from a claim** — the same principle as SET's
checkpoint design:

| Question | Answered by |
|---|---|
| Which cases have run? | Count labeled entries in the probe log |
| Is the hook still installed? | `jq` the project settings for the probe's command path |
| Is cleanup complete? | Hook absent **and** findings file written |

The probe log is therefore both artifact and progress marker. No new bookkeeping
format is introduced.

**Resume header.** Before the restart, the findings file is created with a
header stating: what is installed and where, the log path, the five cases and
which have fired, and the verbatim removal command. This is the handoff note to
the post-restart session.

**Uninstall is its own plan checkbox**, not a sub-bullet. A throwaway hook left
installed in project settings is the worst failure mode available here — it
would log silently and indefinitely.

**Manual abort.** Printed verbatim in the findings header so it is never
reconstructed under pressure:

```bash
jq 'if (.hooks.PreToolUse | type) == "array"
    then (.hooks.PreToolUse) |= map(select(any(.hooks[]?; .command | test("set-probe")) | not))
    else . end' \
   .claude/settings.json > .claude/settings.json.tmp \
   && mv .claude/settings.json.tmp .claude/settings.json
rm -f .claude/set/probe-log.txt
```

Verified against four cases: a real `settings.json` carrying an unrelated user
hook (survives), that file with a probe entry added (probe removed, user hook
kept), a settings file with no `hooks` key, and `{}` (both no-ops, no error).

Two details the obvious form gets wrong, both caught by testing rather than
inspection:

- `any(.hooks[]?; …)` rather than `.hooks[0].command` — one entry may hold
  several commands.
- The `if … then … else . end` guard rather than `(.hooks.PreToolUse? // [])` —
  `|=` rejects `// []` on its left side with *"Invalid path expression with
  result []"*, which would error on any settings file lacking the key. That is
  the common case for a fresh project, so the naive filter fails exactly where
  it is most needed.

**This same filter shape is what Section 4's uninstall path uses**, with the
`test("set-probe")` pattern swapped for the `~/.claude/set/hooks/` prefix. It is
verified here so the uninstall inherits a tested form rather than a plausible
one.

### Plan progress across tasks

`/set-plan` emits a `## Progress` section and `build.md` defines the tick format
(`- [x] T-{slug} — passed {ISO time}`). `/set-build` normally maintains it;
because this phase is built by hand, the human-facing session maintains it in
the same file and format. Nothing parses it — it exists so a resumed session
sees true state immediately.

### Caveat

**Probed:** in-process spawns via the `Agent` tool (named and unnamed) from a
main context. **Not probed:** `Workflow`-tool agents (`--use-workflow`,
`/set-review`) and teammates run as separate processes (tmux / split-pane
teammate mode). A separate process may present a main-shaped payload — no
`agent_id` — and be *allowed* by the carve-out. Until re-probed, user-facing
docs say so, and the gate is a safety net on those paths, not a guarantee.

The probe measures the current Claude Code version. If identity plumbing changes
upstream, a carve-out built on it fails in the deny direction — safe, but it
would block the human too. The hook must therefore degrade to
unconditional-deny-with-a-clear-message rather than erroring, so the failure is
legible.

---

## Section 4 — The Two Hooks

POSIX shell, JSON on stdin, `permissionDecision` on stdout — matching the
conventions of the user's existing hooks.

### Agent marker

Every SET-spawned **named** agent carries a `-set` name suffix (e.g.
`odm-db-drizzle-set`), set in `build.md`'s T2 spawn template. Verifiers remain
unnamed, per the return-channel contract.

**Polarity is critical.** The marker identifies SET's own spawns; it is
**corroborating evidence for denial, never the trigger for it.** A hook that
denies only on seeing `-set` would allow everything unmarked — any non-SET
agent, any truncated name, any future spawn path that forgets the convention.
That is fail-open on a push gate. The absence of a marker never implies
permission.

Value beyond the hooks: `-set` is a signal SET *controls* rather than observes,
so unlike `$CLAUDE_CODE_AGENT_NAME` it cannot silently change under us; and it
makes SET teammates legible in transcripts and logs during autonomous-run
review.

### Hook 1 — `set-deny-push.sh` (PreToolUse, matcher `Bash`)

**Denies:** `git push`, `gh pr create`, `gh pr merge` (and `gh api` writes to a
pulls endpoint), including forms reached via `&&` / `||` / `;` / `|` / `&` /
newline chaining, `if … then` / `do` bodies, a leading `env` / `sudo` /
`timeout` / `nice` / `xargs` / VAR=val, subshells and `sh -c` strings.
Matching is on the parsed command string and must handle chaining —
`pnpm test && git push` is a push.

> **Amended 2026-08-16 (post-review).** Splitting must be **quote-aware** and
> skip heredoc bodies — quoted text is data, so `git commit -m "fix; git push
> later"` and a heredoc commit body listing `- gh pr create` are commits, not
> pushes (the first cut denied both, breaking the "commits always allowed"
> rule). The parser must never glob (`set -f`) and must be bounded in time — a
> hook past its timeout is a non-blocking error, i.e. fail-open — so above a
> size cap it degrades to a coarse scan. Out of scope, by design: `eval`,
> `$var` expansion, git/gh aliases, scripts on disk.

**Allows:** everything else, including `git commit`. Builders commit; that is
how checkpoints and the corroborating git-log channel work. Only outward-facing
operations are gated.

**Decision logic** (first clause present only under the favorable probe branch):

```
if identity_detectable AND caller == main_session:  allow
else:                                               deny
```

**Deny message must teach the escape hatch:**

```
SET blocks agent-initiated pushes. Human review gate.
To push yourself, type:  !git push origin <branch>
(! runs in your shell — no tool call, no hook.)
```

**Fail-closed on its own errors.** Missing `jq` or an unparseable payload denies
with a message stating why.

### Hook 2 — `set-guard-agent-name.sh` (PreToolUse, matcher `Agent`)

Enforces structurally what `references/agent-return-channels.md` states in
prose: *name an agent only when you intend to `SendMessage` it; never when you
need its result.*

**Denies:** an `Agent` call carrying both a `name` and a verifier-shaped prompt.
Verifier-shaped is detected by the prompt's own contract — it requests the JSON
verdict schema (`passed`, `spec_compliant`, `tdd_followed`) or states "you write
NO code". This is SET's own T3 template, so the signal is reliable within SET.
The `-set` suffix makes "this is a SET spawn" structural rather than inferred,
narrowing the heuristic to prompt shape alone.

**Allows:** named spawns without verifier markers (builders — correct and
required), and all unnamed spawns.

**Why deny rather than warn:** the failure is silent and expensive. A named
verifier returns a mailbox receipt instead of a verdict; the coordinator waits
for something that never arrives, which `build.md` T4 must already reason about
as "a self-inflicted stall." Denying at the call site converts an invisible hang
into an immediate, legible error.

**Honest limitation:** prompt-text matching is heuristic. An unusually phrased
verifier slips through; a builder prompt quoting the schema false-positives.
Both are recoverable — the message names the rule and the fix. This is a safety
net over the prose, not a replacement; `agent-return-channels.md` stays.

### Shared mechanics

**Scripts live centrally** at `~/.claude/set/hooks/`, installed once by
`install.sh`. Project settings reference them as the **literal**
`$HOME/.claude/set/hooks/<script>` (Claude Code runs hook commands through a
shell, so it expands per machine), so N SET projects share one copy **and** the
committed `.claude/settings.json` resolves on the host, in a devcontainer whose
`~/.claude` bind-mount sits at another absolute path, and on a collaborator's
checkout.

> **Amended 2026-08-16 (post-review).** The first cut wrote the expanded absolute
> path. Review showed that in the devcontainer topology SET targets — the
> *primary* topology for autonomous teams — the host path does not exist inside
> the container, so the hook command fails with `not found`, which Claude Code
> treats as a non-blocking error: the gate is silently absent exactly where the
> team runs, and each environment that re-registers appends its own divergent
> entry. `$HOME` is the fix; an absolute path is still accepted for tests.

**Installed to project settings** (`<repo>/.claude/settings.json`) by
`/set-init` and `/set-update` — not user settings. Scope matches intent: hooks
apply only to SET-managed projects. A user who installs SET and can no longer
push from an unrelated repo would correctly call that a bug.

Consequence: a user who installed SET before this change and never re-runs
`/set-init` gets no hooks. `/set-update` therefore installs them into the
current project, which fits — it already owns the reconcile path from Section 2.

**Registration merges, never overwrites.** The constraint that matters most: the
user has `preload-serena.sh` (SessionStart) and `prefer-serena.sh` (PreToolUse)
in the same structure. Using install.sh's existing `jq | tmp | mv` idiom, SET
appends to the relevant `hooks.PreToolUse` array. It must never assign to
`.hooks` wholesale, and must be idempotent — re-running adds nothing when a SET
entry with the same command path is present.

**Uninstall removes only SET's entries**, filtered by the
`~/.claude/set/hooks/` command-path prefix. Same rule as Section 2. The user's
Serena hooks are untouched by construction.

### Verification

Table-driven shell tests over stdin/stdout, no Claude session required:

- `git push` → deny; `git commit` → allow
- `pnpm test && git push` → deny (chaining)
- `env FOO=1 git push` → deny (leading env)
- `gh pr create` → deny; `gh pr view` → allow
- malformed payload → deny (fail-closed)
- missing `jq` → deny (fail-closed)
- named + verifier-shaped prompt → deny
- named builder prompt → allow
- unnamed verifier → allow
- merge into a settings.json containing the user's two Serena hooks → both
  preserved, SET entries appended
- re-run merge → idempotent, no duplicate entries
- uninstall → SET entries gone, Serena hooks intact

---

## Risks

| Risk | Mitigation |
|---|---|
| Hook merge clobbers user's existing hooks | Append-only `jq` merge; explicit test asserting both Serena hooks survive install, re-install, and uninstall |
| Probe answers change with a Claude Code upgrade | Hook degrades to unconditional deny with a legible message, never errors |
| Agent-name guard false-positives a builder | Recoverable; message names the rule and fix. Prose reference retained |
| Push-deny blocks a legitimate human push | `!git push` bypasses by design; deny message teaches it |
| Excision misses a reference | `grep -ric serena` = 0 is a hard gate |
| Probe hook left installed after the restart | Standalone uninstall checkbox; state derived from disk; manual abort command printed in the findings header |
| Post-restart session cannot tell how far the probe got | Probe log is the progress marker; resume header written before the restart |
| User stops after one `/set-update` run | Version-change warning names the pending work |

## Open Questions

None blocking. Two deferred by decision:

- Push-deny bypass mechanism — revisit if users report friction. Deliberately
  unconditional for now.
- SessionStart availability hook — reconsider in Phase 2.
