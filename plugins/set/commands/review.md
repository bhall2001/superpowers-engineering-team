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

Check `$ARGUMENTS` for `--light`.

### Default — Dynamic Workflow Fan-Out

SET is geared for heavy work, so the default uses the **`Workflow` tool**. Author a script that:

1. Fans out the **four lenses × affected modules** (derive modules from the diff stat). Each lens is an independent `agent()` that did not author the code, given the lens rubric below plus the diff for its module(s).
2. Has each lens agent return findings via `agent({schema})`, e.g.:
   ```
   { lens: string, module: string, findings: [
       { file: string, line: string, severity: "critical"|"high"|"medium"|"low",
         issue: string, suggestion: string } ],
     good_patterns: string[] }
   ```
3. **Pre-aggregates per perspective** inside the workflow (collect each lens's findings across modules), so you receive four consolidated perspective reports — not N×4 raw transcripts.
4. Returns the four perspective reports for synthesis in Step 3.

Keep intermediate findings in script variables; you receive only the aggregated reports.

### `--light` — Four Parallel Subagents

For small diffs, skip the workflow. Spawn **4 independent `Agent` subagents in a single message** (one per lens, fresh contexts), each with its lens rubric below. Each returns its findings as its final message. Same independence semantics — none of them wrote the code.

### Lens Rubrics

**Spec Compliance** — READ the design spec + plan; use the spec/plan learnings injected into your prompt (Step 2a). VERIFY: every spec requirement implemented; nothing extra; matches the plan's approach; each plan task's acceptance criteria met. DO NOT trust commit messages or the build report — read the actual code. Report ✅ compliant or ❌ issues with file:line.

**Security** — use the security/validation/auth learnings injected into your prompt (Step 2a), including any "Recurring Bugs". CHECK: SQL injection, XSS, CSRF, hardcoded secrets/keys, missing input validation, insecure auth, sensitive data in logs/errors, missing rate limiting, unsafe deserialization, path traversal. Report file, line, severity, suggested fix. If nothing found, confirm the changes look secure.

**Architecture** — READ CLAUDE.md for conventions; use the architecture learnings injected into your prompt (Step 2a) — "What Works"/"What Failed". CHECK: pattern consistency, separation of concerns, SOLID, DRY without over-abstraction, dependency direction, testability, performance at scale, error-handling consistency. Report file, concern, suggestion. Also note things done WELL.

**Correctness** — run the test suite; use the correctness learnings injected into your prompt (Step 2a) — "Recurring Bugs". CHECK: test quality (not coverage theater), edge cases (null/empty/boundary), helpful error messages, type consistency across API boundaries, race conditions, resource cleanup. Report findings.

## Step 3: Synthesize

You own synthesis. Dedupe, resolve cross-perspective conflicts, severity-rank, and emit a verdict.

```markdown
## SET Review Summary

**Verdict:** SHIP / ITERATE / BLOCK

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

## Step 4: Route the Verdict

If critical or "should fix" issues exist:
- Large fixes → "Run `/set-build {feature}` again to fix these issues."
- Minor fixes → "These are small enough to fix directly — want me to handle them?"

If all clean → "Run `/set-learn` to capture learnings from this cycle."

## Step 5: Finishing

If the review is clean and the user is ready to integrate, present 4 options:
1. Merge back to base branch locally
2. Push and create a Pull Request
3. Keep the branch as-is
4. Discard this work

Execute the user's choice. (This is where a build worktree, if any, gets cleaned up.)
