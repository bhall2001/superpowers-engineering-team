# Run-Scoped Push Gate — Design Spec

**Status:** DRAFT — awaiting human approval
**Date:** 2026-08-16
**Branch:** `feat/set-hooks-and-serena-excision` (PR #23, unmerged)
**Supersedes:** the identity carve-out in `set-deny-push.sh` (1.5.0, unmerged)
**Evidence:** `2026-08-16-hook-payload-probe-findings.md`

---

## 1. Problem

`set-deny-push.sh` currently denies **every** agent-initiated push. Its carve-out keys on
caller identity: main-context payloads carry no `agent_id`/`agent_type`, spawns carry both,
so spawns are denied.

That rule denies a case it should allow. When the human says "push these changes" in an
ordinary session, the assistant's own tool call is main-shaped and *is* allowed — but any
delegation of that same instruction is denied, and the human cannot tell from the error which
situation they are in. Meanwhile it permits nothing it should: identity cannot distinguish "a
builder inside a `/set-build` team" from "the assistant helping a human at a keyboard,"
because outside a run those are the same shape.

**Intended behavior:** agents in an active `/set-build` run cannot push or open PRs; the human
asking the assistant to push, outside a run, can.

The discriminator must be **SET-run state**, not caller identity.

## 2. Mechanism: a marker file

`/set-build` writes a marker file when it starts and deletes it when it finishes. The hook
gates on that file's presence.

```
<worktree>/.claude/set/RUN-IN-PROGRESS.md
```

### Why not the run store

The run store (`~/.claude/set-runs/runs.db`) already tracks runs, and an earlier draft of this
spec had the hook query it read-only. That was measured and shown to work — a probe hook
returned `VERDICT=STORE_READABLE` under the sandbox. It is nonetheless the wrong mechanism
here, and the marker is chosen on merit, not as a downgrade:

| | run store | marker file |
|---|---|---|
| Hook runtime deps | Node + `node:sqlite` (`--experimental-sqlite` on Node 22) | none — bash `test -f` + read |
| Sandbox risk | SQLite creates `-wal`/`-shm` sidecars even to read; needs `mode=ro&immutable=1` | none; plain read |
| Worktree scoping | compare `worktree_path` (realpath'd) against payload `cwd` (not realpath'd) | **location is the answer** |
| Inspectable | `sqlite3` query | `cat`; fix by `rm` |
| Cost | ~50ms | negligible |

The third row is the decisive one. The store-based design had exactly one path that failed
**open**: if `cwd` and the stored `worktree_path` disagreed after symlink resolution
(`/tmp` → `/private/tmp` on macOS), the query found no row, the gate concluded "no active run,"
and allowed the push. A marker inside the worktree cannot have that bug — being in the
directory *is* the scoping.

The run store remains authoritative for resume and checkpointing. **It is simply not consulted
by this gate.** No dual-write, so no drift between two sources that can disagree after a crash.

Consequence, stated deliberately: this gate's correctness now depends on `/set-build`
reliably writing and removing a file, rather than on a transactional store. §5 is how that
stops being fragile.

### On the probe

`set-store-probe.sh` was a throwaway hook that answered one make-or-break question for the
store-based design — *can a hook subprocess read the run store under the sandbox?* It
answered yes. That design is not being used, so the probe has no further purpose: it emits no
decision, blocks nothing, and is deleted (§9). It is scaffolding, never shipped.

## 3. Decision rule

Evaluated only after the existing command parser classifies the segment as gated (`git push`,
`gh pr create|merge`, `gh api` writes to a pulls endpoint). Non-gated commands exit 0 before
any of this, unchanged.

| Condition | Decision |
|---|---|
| Caller is main-shaped (no `agent_id`/`agent_type`) | **allow** |
| Caller is a spawn, marker absent | **allow** |
| Caller is a spawn, marker present and live (§5) | **deny** |
| Caller is a spawn, marker present but run is provably dead (§5) | **allow** |
| Marker present but unreadable / unparseable | **deny** |
| Payload unparseable / identity undetectable | **deny** (unchanged) |

The main-shaped allow is retained deliberately: it is the human's own supervised session, and
it is the path `!git push` already bypasses. Every case allowed today stays allowed — this
change is strictly additive.

**Human-facing summary:** asking the assistant to push, or to open a PR, works exactly as it
does now. What changes is that agents spawned *during a build* cannot.

## 4. Marker format

Written by `/set-build` at start; deleted at completion.

```markdown
# SET run in progress

run: 20260816-142233-push-gate
pid: 48213
host: bobs-m1-pro
started: 2026-08-16T14:22:33Z

A SET build is running in this worktree. Agents cannot push or open PRs while this
file exists. If no build is actually running, delete this file.
```

Machine-read fields are `key: value` lines; the prose is for whoever finds the file. The hook
parses only `pid`, `host`, `started`, and `run` — with `grep`/`sed`, no YAML or JSON parser, so
there is no dependency to fail closed on.

**Malformed marker → deny.** A file that exists but yields no usable `pid`/`started` is
undeterminable state, not an absent run.

**`.gitignore`:** `.claude/set/RUN-IN-PROGRESS.md` must be ignored. Committing one mid-build
would gate every clone permanently, which is the worst available failure. In scope (§6a).

**Location:** the hook resolves the worktree root by walking up from the payload's `cwd`
looking for `.git`, then checks `<root>/.claude/set/RUN-IN-PROGRESS.md`. No global path
matching, so repo A's build cannot gate repo B. If the root cannot be resolved, no marker can
be found — that lands in *allow*, matching "not in a SET worktree, not in a run." Recorded as
the one remaining fail-open in §7.

## 5. Staleness — the failure this design must handle

A build that crashes (Ctrl-C, session death, laptop sleep) never deletes its marker. Without
staleness handling the gate would deny agent pushes in that worktree **forever**, with no
signal why. Ctrl-C during a build is routine, not an edge case.

The marker carries `pid`/`host`/`started` so the hook can apply the liveness rules already
proven in `claim.mjs:21-60`. Reuse that polarity exactly; do not reinvent it:

| Marker state | Gate |
|---|---|
| pid alive | **ON** |
| pid gone (`kill -0` → ESRCH) | **OFF** — self-heals |
| pid absent or unparseable | **ON** — unknown is not dead |
| `host` differs from this machine | **ON** — never assume dead across hosts |
| no pid, `started` older than 15 min (`STALE_AFTER_MINUTES`) | **OFF** |
| no pid, `started` within 15 min | **ON** |

`probeDead` already treats an unknown pid as *not* dead, which is the correct polarity for a
gate: every ambiguity keeps it on. A stale marker that keeps denying is annoying and
recoverable (`rm` the file, and the deny message says so). Liveness wrongly reporting
live-as-dead would drop the gate mid-build — the exact failure this control exists to prevent.

**The pid must be the orchestrator's session pid, not the writer's.** `set-run.mjs:131-133`
records this the hard way: a CLI that exits immediately leaves a pid that is dead by the next
invocation, so every probe reports "crashed" and the gate silently never fires. If `/set-build`
cannot obtain a durable session pid, it writes **no** `pid:` line and relies on the
`started:` heartbeat — an omitted pid is safe (gate stays on); a lying pid is not.

## 5a. Deny messages

Three causes with three different remedies, so one shared string is no longer adequate. Every
deny appends the existing escape:

> To push yourself, type: `!git push origin <branch>` (`!` runs in your shell — no tool call,
> no hook.)

| Case | Message |
|---|---|
| Live run | `SET blocks pushes from agents during an active build (run <run_id>). The human reviews before anything leaves the machine.` |
| Marker present, liveness ambiguous | Above, plus: `If no build is running, delete .claude/set/RUN-IN-PROGRESS.md` |
| Marker unreadable/malformed | `SET found a run marker it cannot parse, so it is failing closed. Inspect or delete .claude/set/RUN-IN-PROGRESS.md. Your own session is unaffected.` |
| Identity undetectable | existing string, unchanged |

Naming the file path is what keeps a stale marker from becoming a mystery — the remedy is
visible in the error, and it is a one-line `rm`.

`run_id` is the only interpolated value. It comes from a file that is gitignored but
human-editable, so it is **not** trusted: it is emitted only if it matches
`^[A-Za-z0-9._-]{1,64}$`, and omitted otherwise. The deny still fires either way. These
strings are printed into JSON on a fail-closed path, so no untrusted bytes may reach them.

## 6. Scope

**In scope**

- Replace the terminal identity `case` in `set-deny-push.sh` with the §3 rule.
- Marker lookup + liveness in the hook: walk up for the repo root, parse `pid`/`host`/`started`
  with grep/sed, apply §5.
- `/set-build`: write the marker at start, delete it at completion — including on the failure
  paths that end a build, not only the happy path.
- Per-case deny messages (§5a).
- `.gitignore`: `.claude/set/RUN-IN-PROGRESS.md` and `.claude/settings.local.json` (§6a).
- Table-driven tests in `plugins/set/tests/`.
- Rewrite the 1.5.0 changelog entry for the push gate (no version bump — §6b).
- Commit `.claude/settings.json` (§6a).

**Out of scope**

- The command parser (`split_segments` / `is_gated_segment`) — untouched.
- `set-guard-agent-name.sh` — untouched.
- The run store. Not read by this gate; unchanged for resume/checkpoint.
- Known bypasses already in the hook header (`eval`, aliases, `python -c`, `ssh host git push`).
  Still a heuristic over a shell string.
- Workflow-tool agents and tmux teammates. **Payload shape still unprobed** — a separate
  process may present a main-shaped payload and be allowed. Not fixed here; the header caveat
  stands and must be restated to cover the run-scoped rule.

## 6a. Settings files and ignores

`.claude/settings.json` is **committed**; `.claude/settings.local.json` is **never** committed.

Load-bearing, not just convention: `CLAUDE.md` specifies that `/set-init` and `/set-update`
append the enforcement hooks to a project's `.claude/settings.json` so they bind SET-managed
repos. This repo is SET-managed. Left untracked, a collaborator clones SET and gets **no push
gate** — the enforcement silently does not exist for them, the same failure class this control
was built to prevent. It is also why the registered command is the literal
`$HOME/.claude/set/hooks/<script>`: the committed file must resolve on the author's host, in a
devcontainer, and on a collaborator's machine.

| File | Contents | Tracked |
|---|---|---|
| `.claude/settings.json` | SET enforcement hooks — required on every clone | yes |
| `.claude/settings.local.json` | personal `permissions.allow`, throwaway probes | no |
| `.claude/set/RUN-IN-PROGRESS.md` | transient run marker | no |

`settings.local.json` is currently ignored only via the machine-global `~/.config/git/ignore`
(`**/.claude/settings.local.json`). That is **not** part of the repo — a collaborator without
an equivalent rule could commit theirs. Both it and the marker go in the repo's `.gitignore`.

**Consequence to accept deliberately:** committing `settings.json` means anyone cloning this
repo gets hooks that intercept their `git push` and `Agent` calls. That is the intent — it is
how the gate reaches SET-managed repos — but it changes what a fresh clone does, and belongs in
the changelog rather than being discovered.

## 6b. Version

Folded into **1.5.0**, not a new version. 1.5.0 is unmerged (PR #23), so the identity carve-out
has never shipped; there is no released behavior to loosen, and a changelog entry describing a
loosening would document a transition nobody experienced.

The existing 1.5.0 push-gate entry is therefore **rewritten**, not supplemented. What users see
on merge: agents cannot push during an active SET build; the human's own session can.

## 7. Risks

| Risk | Direction | Mitigation |
|---|---|---|
| `/set-build` crashes before writing the marker | **fail-open** — build runs ungated | Write the marker as the first action, before any spawn |
| Repo root unresolvable from `cwd` | **fail-open** — reads as "not in a run" | Bounded: a non-repo cwd cannot be a SET worktree |
| Marker committed by accident | fail-closed, permanently, for every clone | `.gitignore` (§6a) |
| Build crashes leaving a live-looking marker | fail-closed | pid/heartbeat staleness (§5); `rm` named in the deny |
| Marker malformed | fail-closed | Deny + path in message |
| `/set-build` exits via an unhandled path without deleting | fail-closed | Staleness self-heals within 15 min |

The first row is the one that deserves attention and is new to this design. The store-based
version could not fail this way, because `set-run init` was transactional. A marker written by
a command spec can be skipped if the build errors early. **Write it first, before any teammate
is spawned** — a marker written after the first spawn leaves a window where builders are live
and ungated.

Every other failure mode lands fail-closed and is recoverable with `rm`.

## 8. Verification

- Table-driven unit tests: every §3 row, every §5 liveness branch, malformed and absent markers.
- Absent-marker, malformed-marker, and unresolvable-root cases assert their §3 decision
  explicitly — including the two fail-open rows, so a future change that flips them fails a test.
- `/set-build` marker lifecycle: written before first spawn, deleted on success **and** on
  failure exits.
- Existing hook tests stay green: `node --test "plugins/set/tests/*.test.mjs"`. Baseline is
  **223 pass / 4 fail** — the 4 are pre-existing `cli.test.mjs` Node 22 stderr failures that also
  fail on `main`. "Green" means 4 failures and no new ones.
- **End-to-end is not covered by the suite** and no CI runs it. At minimum, manually confirm: a
  denied agent push with the marker present, an allowed one with it absent, and a human push
  working in both states. Record the result. This project has already shipped an untested gate
  once.

## 9. Cleanup

`set-store-probe.sh` is a throwaway and must never ship. The store-based design it was built to
validate is not the chosen mechanism, so it has no remaining purpose:

```bash
# unregister from .claude/settings.local.json, then:
rm -f plugins/set/hooks/set-store-probe.sh ~/.claude/set/store-probe-log.txt
```

The probe fires on **every** Bash call until unregistered. The resume plan notes the
settings.local.json write may be sandbox-blocked; if it is, the human disables it.

---

## Resolved (2026-08-16)

- **Mechanism:** marker file, sole source of truth. Run store not consulted by the gate. (§2)
- **Location:** `<worktree>/.claude/set/RUN-IN-PROGRESS.md`, found by walking up for `.git`. (§4)
- **Staleness:** pid + heartbeat, reusing `claim.mjs` polarity. (§5)
- **Version:** fold into unmerged 1.5.0; rewrite the entry, don't append. (§6b)
- **Deny messages:** per-case, naming the marker path and `run_id`. (§5a)
- **`settings.json`:** commit it; add `settings.local.json` + marker to repo `.gitignore`. (§6a)

## Unresolved questions

- `/set-build --use-workflow` and tmux teammates: marker still gates them (it is not
  identity-based), but their payloads are unprobed, so a main-shaped payload would be allowed.
  Probe now, or ship the caveat?
- Does `/set-review` write a marker too? Spec assumes build-only; review does not push.
- End-to-end check before merge — manual, or accept unit tests only?
