---
description: "Runs an independent four-lens review (spec compliance, security, architecture, correctness) on the build via a dynamic workflow fan-out, then synthesizes a ship/iterate/block verdict. Use after /set-build completes, when a user says 'review the code', 'run a review', 'check the build', or 'ready for review'. Add --light for a cheaper 4-subagent review on small diffs. Do NOT use mid-build or as a substitute for the builder's own self-review."
---

# SET Review — Independent Four-Lens Review

Review's entire value is being an **uncorrelated** check on the build. Independence is the design constraint, not an afterthought:

- Each lens runs as a **fresh-context agent that did NOT write the code**. Where possible, the reviewer for an area is not the specialist that authored it.
- The build's verification report (from `/set-build`) is handed in as **claims to audit**, NOT ground truth. This is the explicit counter to self-grading bias.

## What to Review

If the user provides a branch/PR/commit range with `$ARGUMENTS`, use that. Otherwise: `git diff main...HEAD`.

## Step 1: Gather Context

Check `$ARGUMENTS` for `--light`. Parse and strip `--autonomous` and `--verbose` per
`~/.claude/commands/references/autonomous-mode.md`.

**Emit phase-boundary lines on every run**, with or without `--autonomous`, in the
Verbosity Levels format from that reference: the `▶ SET review — starting` line once flags
are parsed, and the `◀ SET review — {verdict}` line once Step 3 synthesizes (or, under
`--autonomous`, once Step 3b exits its loop). Under `--autonomous` the same lines carry
the chain annotation and `[n/N]`; without it, omit both. Emit each line once per run.

```bash
git diff main...HEAD --stat
git log --oneline main..HEAD
```

Read the diff. Also read:
- The design spec from `docs/superpowers/specs/` (if one exists)
- The plan from `.claude/plans/` (if one exists)
- The build's structured verification report, if available (treat as claims to audit)

## Step 2: Run the Review

### Step 2a: Pre-load learnings (lead only — do this BEFORE any fan-out)

Both review modes spawn multiple independent agents. **They must not call `mcp__serena__*` themselves.** Serena runs as a single stdio process whose active project is one mutable field shared by every caller, with no per-caller isolation; memory reads resolve through that pointer (`Tool.memories_manager` → `self.project.memories_manager`). Reviews run against a **worktree**, where Serena often starts unactivated — so a concurrent `activate_project` anywhere can leave a lens silently reading another project's memories. Fanning out N lenses × M modules multiplies the exposure.

So load everything once, here, in the lead:

1. Read `.claude/set/taxonomy.md` and derive the domains intersecting the diff.
2. Read the matching `.claude/set/learnings/{domain}.md` shards — these are the source of truth.
3. If `serena_enabled` is true in `.claude/set/config.json`, query Serena **once** for memories relevant to the diff scope. Dedupe against shards already loaded. On failure or timeout, warn and continue — never block the review on Serena.
4. Bucket the result by lens: spec/plan context, security + validation + auth domains, architecture ("What Works"/"What Failed"), correctness ("Recurring Bugs").

Inject each lens's bucket into its prompt as **text**. Lens agents receive learnings; they never fetch them. For code navigation, lens agents use Claude Code's built-in LSP tool, which is per-session and safe under parallel agents.

The flags were already parsed and stripped in Step 1; `--light` selects the mode below.

### Step 2b: The Lens Return Contract (binding on both modes)

A lens that reviews the code but does not hand its findings back has **failed**, no matter how good the review was. Analysis left in a lens agent's own transcript is invisible to the lead, and the tokens that produced it are wasted. Every lens agent MUST return exactly this object:

```
{ lens: string, module: string, reviewed: boolean,
  findings: [ { file: string, line: string,
                severity: "critical"|"high"|"medium"|"low",
                issue: string, suggestion: string } ],
  good_patterns: string[] }
```

This schema is **mandatory and identical across both modes** — it is the seam that keeps the workflow and `--light` paths from drifting. When editing either path, preserve it exactly.

Rules that bind every lens agent:

- **A clean lens still returns.** Finding nothing is a result, not a reason to stay silent: return `reviewed: true` with `findings: []`. An empty array is a valid, expected outcome.
- **The returned object is the deliverable.** Prose written anywhere else does not count as reporting.
- **No lens may return `reviewed: false`** except when it genuinely could not read its assigned diff. If so, say why in a single `low` finding.

The lead NEVER performs a lens itself to cover for a missing return — that would destroy the independence the review exists for and re-spend the tokens the lens already burned.

### Default — Dynamic Workflow Fan-Out

SET is geared for heavy work, so the default uses the **`Workflow` tool**. Author a script that:

1. Fans out the **four lenses × affected modules** (derive modules from the diff stat). Each lens is an independent `agent()` that did not author the code, given the lens rubric below plus the diff for its module(s).
2. Calls each lens as `agent(prompt, { schema: LENS_SCHEMA })` using the Step 2b schema. Passing `schema` forces the subagent through a `StructuredOutput` tool call and returns a validated object, so a lens cannot end its turn with unstructured prose. **Do not call a lens agent without `schema`** — that is the defect this contract exists to prevent.
3. Handles a missing return per **Step 2c** before aggregating.
4. **Pre-aggregates per perspective** inside the workflow (collect each lens's findings across modules), so you receive four consolidated perspective reports — not N×4 raw transcripts.
5. Returns the four perspective reports, each carrying its per-module `reviewed` status, for synthesis in Step 3.

Keep intermediate findings in script variables; you receive only the aggregated reports.

Under `--verbose`, have the script emit `→ spawn {lens} :: {module}` at each lens `agent()`
call and `← {lens} :: {finding count}` on return, including retries from Step 2c. These
lines are reporting only — they do not replace or relax the Step 2b return contract.

### `--light` — Four Parallel Subagents

For small diffs, skip the workflow. Spawn **4 independent `Agent` subagents in a single message** (one per lens, fresh contexts), each with its lens rubric below. Same independence semantics — none of them wrote the code.

The `Agent` tool has **no `schema` parameter**, so the contract cannot be enforced by the harness here — it must be enforced by the prompt. Append this verbatim to every `--light` lens prompt:

```
Your final message IS your return value. It is parsed by the coordinating
agent, not read by a human. Emit ONLY a single JSON object matching this
shape — no preamble, no markdown fences, no commentary before or after:

{ "lens": "...", "module": "...", "reviewed": true,
  "findings": [ { "file": "...", "line": "...", "severity": "critical|high|medium|low",
                  "issue": "...", "suggestion": "..." } ],
  "good_patterns": ["..."] }

If you found no issues, return the same object with "findings": [].
Do not end your turn with a summary, a status update, or a question.
```

Under `--verbose`, emit `→ spawn {lens} :: {module}` as each of the four subagents is
spawned and `← {lens} :: {finding count}` as each returns, including Step 2c retries.
Reporting only — the prompt contract above is unchanged.

Then handle missing returns per Step 2c.

### Step 2c: Missing or Unparseable Returns

Applies to both modes. For each lens whose result is null, empty, or does not parse against the Step 2b schema:

1. **Retry that lens exactly once**, fresh context, same rubric and diff, with this line prepended to the prompt: `Your previous attempt returned no parseable findings object. Return ONLY the JSON object specified below.`
2. **If the retry also fails, mark that lens `FAILED`** and move on. Do not retry a second time.
3. Do **not** substitute your own review for a failed lens.
4. Surface every failed lens in the Step 3 summary under **Coverage**, and cap the verdict at **ITERATE** — a review missing a lens has not cleared the bar for SHIP, since the unexamined lens is exactly where an unknown risk would sit.

### Lens Rubrics

Every rubric below returns its results **only** through the Step 2b contract object. "Report" throughout means "populate `findings` in the returned object" — never prose in your own transcript.

**Spec Compliance** — READ the design spec + plan; use the spec/plan learnings injected into your prompt (Step 2a). VERIFY: every spec requirement implemented; nothing extra; matches the plan's approach; each plan task's acceptance criteria met. DO NOT trust commit messages or the build report — read the actual code. Return one finding per deviation with `file:line`. Fully compliant → `findings: []` and note what you verified in `good_patterns`.

**Security** — use the security/validation/auth learnings injected into your prompt (Step 2a), including any "Recurring Bugs". CHECK: SQL injection, XSS, CSRF, hardcoded secrets/keys, missing input validation, insecure auth, sensitive data in logs/errors, missing rate limiting, unsafe deserialization, path traversal. Return one finding per issue with file, line, severity, and suggested fix. Nothing found → `findings: []` with the areas you cleared listed in `good_patterns`.

**Architecture** — READ CLAUDE.md for conventions; use the architecture learnings injected into your prompt (Step 2a) — "What Works"/"What Failed". CHECK: pattern consistency, separation of concerns, SOLID, DRY without over-abstraction, dependency direction, testability, performance at scale, error-handling consistency. Return one finding per concern with file and suggestion. Put things done WELL in `good_patterns`.

**Correctness** — run the test suite; use the correctness learnings injected into your prompt (Step 2a) — "Recurring Bugs". CHECK: test quality (not coverage theater), edge cases (null/empty/boundary), helpful error messages, type consistency across API boundaries, race conditions, resource cleanup. Return one finding per issue with file, line, and severity. A failing suite is a `critical` finding, not a reason to abandon the return.

## Step 3: Synthesize

You own synthesis — and **only** synthesis. You dedupe, resolve cross-perspective conflicts, severity-rank, and emit a verdict over the findings the lenses returned.

You do **not** review the diff yourself. If coverage came back thin, that is a **coverage failure to report**, not a gap for you to quietly fill. Reviewing it yourself would forfeit the independence the four-lens design exists to provide — you read the build context in Step 1, so your own read is correlated with it — and would re-spend tokens the lens already burned. Report the gap; let the human decide.

Every lens must appear in the summary, including failed ones.

```markdown
## SET Review Summary

**Verdict:** SHIP / ITERATE / BLOCK

### Coverage
- Spec Compliance: ✅ returned / ⚠️ FAILED (no findings returned after retry)
- Security: ✅ returned / ⚠️ FAILED
- Architecture: ✅ returned / ⚠️ FAILED
- Correctness: ✅ returned / ⚠️ FAILED

{If any lens FAILED, verdict is capped at ITERATE and this line appears:}
⚠️ This review is incomplete — {N} of 4 lenses returned no findings. The areas
they cover are unreviewed, not clean.

### Spec Compliance
- {findings}

### Critical (must fix before merge)
- ...

### Improvements (should fix)
- ...

### Suggestions (nice to have)
- ...

### Good Patterns (add to the relevant shard via /set-learn)
- ...
```

### Optional: Adversarial Round
Only as an explicit **second** pass, AFTER independent findings are recorded above — never first, or independence is lost. Spawn agents to try to refute the recorded findings (a finding that survives refutation is high-confidence). Skip by default.

## Step 3b: The Iterate Loop (autonomous only)

Skipped entirely without `--autonomous`.

**"Halt" in this section means: stop iterating, and chain to `/set-learn` carrying the
exit condition. It NEVER means stop the chain.** `/set-learn` is the only producer of the
Autonomous Final Report, so the user gets that report on every path — including halted
ones. There is no exit from this loop that does not reach `/set-learn`.

Initialize `rounds_spent = 0`. It counts rounds **started**: increment it as a round
begins, immediately before the fix pass, never after. So `rounds_spent = 0` means no fix
pass has run yet, and the cap of 2 allows at most 2 fix passes and 2 re-reviews.

**Verdict dispatch.** Evaluate in this order, on the synthesized verdict from Step 3:

1. **BLOCK, or any lens returned `FAILED`** → halt, iterations unspent, with
   `exit_condition` = `BLOCK` or `lens FAILED`. BLOCK means something is fundamentally
   wrong; a `FAILED` lens means missing coverage, not a findings list a fix agent can act
   on. Neither is fixable by another round, and spending one produces two expensive passes
   papering over the real problem. Check this first — per Step 2c a `FAILED` lens is capped
   to a synthesized verdict of ITERATE, so it would otherwise fall through to ITERATE below.
2. Otherwise, check the **exit conditions** below. If one fires, halt with its
   `exit_condition`. **When `rounds_spent = 0` only condition 1 can fire** — condition 2
   compares against a prior round, and on the first pass there is none.
3. Otherwise (**ITERATE**) → if `rounds_spent = 2`, halt with
   `exit_condition` = `round cap`. Else increment `rounds_spent` by 1, run a fix pass
   (below), then a **fresh** re-review — a full Step 2 fan-out, not a re-read of prior
   findings — and re-enter this same dispatch at step 1 with the re-review's synthesized
   verdict.

This is the only statement of the cap. An ITERATE with `rounds_spent = 0` always reaches
step 3 and always runs a fix pass; a verdict of ITERATE is never a no-op.

### Loop exit conditions

Stop on whichever comes first:

1. **Review comes back clean** → `exit_condition` = `clean`. This requires **both**:
   all four lenses returned (no lens is `FAILED` — a `FAILED` lens is caught at dispatch
   step 1, never here) **and** the combined findings across all four lenses are empty.
   Three empty lenses plus one `FAILED` lens is NOT clean.
2. **No new findings** — **only evaluated when `rounds_spent ≥ 1`; skip it entirely when
   `rounds_spent = 0`, where "last round" does not exist and this condition can never
   fire.** Every finding this round names the same file and the **same underlying defect**
   as a finding from last round. This is a **judgment call you make**: compare what the two
   findings are actually about, not their wording. Lens agents run in fresh contexts and
   phrase the same defect differently every round, so never compare `issue` strings
   byte-for-byte. If the round surfaced no defect you had not already seen, the condition
   fires. `exit_condition` = `no new findings`. A shrinking list of known findings means the
   fix pass works but is incomplete: halt rather than spend a round on diminishing returns.

`round cap` is not listed here — dispatch step 3 is its only statement. The cap is a
ceiling, not a target; condition 2 is expected to fire more often than the cap.

### The fix pass routes findings by domain

A fix pass is **NOT** a build re-run.

1. Compile the findings into a fix brief, one entry per finding: file, line, severity,
   the lens that raised it, and the suggested fix.
2. Route each finding to the specialist that owns its domain, using the same
   specialist-matching `/set-plan` uses — **including specialists the original build
   never spawned.** A security finding in an API/sync module gets that owner even when
   the build only touched UI and database tasks. This is the point of routing by
   finding rather than handing everything back to the original builders.
3. Spawn fix agents in **fresh contexts**, each receiving only its own findings plus the
   relevant learning shards.
4. Under `--verbose`, report each finding's routing decision, and emit
   `→ spawn {specialist} :: {finding count}` at each fix agent spawn with
   `← {specialist} :: {fixed/failed}` on return.

The re-review is a fresh independent four-lens run, so a lens never reviews code it
helped fix — the independence guaranteed by the Step 2b return contract holds across
rounds.

### Every exit chains to `/set-learn`

Whichever exit fired — `clean`, `no new findings`, `round cap`, `BLOCK`, `lens FAILED` —
chain to `/set-learn` per the Chaining Contract. Carry forward: `rounds_spent`,
`exit_condition`, `remaining_findings`, the **branch and worktree location** received from
`/set-build`, and everything accumulated down the chain that the Autonomous Final Report
needs (entry phase, phases run, each phase's headline results and artifact paths).

Nothing here hands back to a human directly. `/set-learn` emits the Final Report, which is
what the human reads.

## Step 4: Route the Verdict

**Under `--autonomous`, Step 3b has already routed the verdict** — skip this step and
proceed to the chain. What you are skipping is a set of prompts that ask a human to
choose (re-run the build, fix directly, retry a failed lens, proceed to `/set-learn`);
none applies with no human at the gate. In particular, the FAILED-lens guidance below is
already handled: Step 3b's dispatch catches a `FAILED` lens first and exits with
`exit_condition` = `lens FAILED`, which `/set-learn` reports.

If critical or "should fix" issues exist:
- Large fixes → "Run `/set-build {feature}` again to fix these issues."
- Minor fixes → "These are small enough to fix directly — want me to handle them?"

If any lens FAILED → "{N} of 4 lenses returned no findings, so {areas} are unreviewed. Re-run `/set-review` to retry those lenses, or proceed knowing the gap." Do not offer `/set-learn` as if the cycle were clean — absent findings are not passing findings.

If all four lenses returned and all clean → "Run `/set-learn` to capture learnings from this cycle."

## Step 5: Finishing

**Under `--autonomous`, skip this step entirely.** The four integration options below
include pushing and opening a PR, which autonomous mode never does (see Hard
Boundaries), and cleanup destroys work no human has reviewed yet.

An autonomous run therefore does **not** clean up the build worktree — it **hands it to
the user**, who owns removing it. Carry the branch and worktree location forward to
`/set-learn`, which surfaces it in the Autonomous Final Report under **Artifacts** and as
an unchecked item under **Not done for you**. Leaking it silently is the failure mode this
prevents.

If the review is clean and the user is ready to integrate, present 4 options:
1. Merge back to base branch locally
2. Push and create a Pull Request
3. Keep the branch as-is
4. Discard this work

Execute the user's choice. (This is where a build worktree, if any, gets cleaned up.)
