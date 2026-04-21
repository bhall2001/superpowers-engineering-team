---
description: "Final holistic review combining Compound Teams multi-perspective review with Superpowers spec compliance. Fourth step: /set-design → /set-plan → /set-build → /set-review → /set-learn"
---

# SET Review — Multi-Perspective + Spec Compliance Review

Final review of all changes from the build phase. Combines Compound Teams' multi-perspective review with Superpowers' spec compliance discipline.

## What to Review

If the user provides a branch/PR/commit range with `$ARGUMENTS`, use that.
Otherwise, review changes from the most recent build: `git diff main...HEAD`

## Step 1: Gather Context

```bash
git diff main...HEAD --stat
git log --oneline main..HEAD
```

Read the diff. Also read:
- The design spec from `docs/superpowers/specs/` (if one exists for this feature)
- The plan from `.claude/plans/` (if one exists)

## Step 2: Spawn Review Team

```
Teammate({ operation: "spawnTeam", team_name: "review-{feature}" })
```

Create 4 tasks (one per reviewer lens) and spawn 4 teammates:

### Spec Compliance Reviewer Prompt:

```
Review the git diff (main...HEAD) against the design spec and implementation plan.

READ FIRST:
- Design spec: {path to spec in docs/superpowers/specs/}
- Implementation plan: {path to plan in .claude/plans/}
- `.claude/set/taxonomy.md` (if it exists) and relevant shards under `.claude/set/learnings/` — prior patterns and failures that may indicate risk areas. Load shards whose domain intersects with the diff's scope.

VERIFY:
- Every requirement in the design spec has been implemented
- No features were added that aren't in the spec
- The implementation matches the approach described in the plan
- Acceptance criteria from each plan task are met

DO NOT trust commit messages or comments — read the actual code.

Report:
- ✅ Spec compliant: all requirements met, nothing extra
- ❌ Issues: [list specifically what's missing, extra, or misinterpreted — with file:line refs]

Message team-lead with findings.
```

### Security Reviewer Prompt:

```
Review the git diff (main...HEAD) for security issues.

READ FIRST: scan `.claude/set/learnings/*.md` — especially any security / validation / auth related shards — for "Recurring Bugs" patterns previously documented. Legacy `.claude/set/learnings.md` if present.

CHECK: SQL injection, XSS, CSRF, hardcoded secrets/keys, missing input validation, insecure auth patterns, sensitive data in logs/errors, missing rate limiting, unsafe deserialization, path traversal.

Message team-lead with findings: file, line, severity (critical/high/medium/low), suggested fix.
If nothing found, confirm the changes look secure.
```

### Architecture Reviewer Prompt:

```
Review the git diff (main...HEAD) for architectural quality. Read CLAUDE.md first for project conventions, and the shards under `.claude/set/learnings/` whose domains intersect the diff (use `.claude/set/taxonomy.md` as the index) for accumulated "What Works" / "What Failed" patterns.

CHECK: Pattern consistency, separation of concerns, SOLID violations, DRY without over-abstraction, dependency direction, testability, performance at scale, error handling consistency.

Message team-lead with findings: file, concern, suggestion.
Also note things done WELL — good patterns worth documenting.
```

### Correctness Reviewer Prompt:

```
Review the git diff (main...HEAD) for correctness. Also run the test suite.

READ FIRST: the shards under `.claude/set/learnings/` whose domains intersect the diff — "Recurring Bugs" sections list prior error patterns worth verifying against.

CHECK: Test quality (not coverage theater), edge cases (null/empty/boundary), helpful error messages, type consistency across API boundaries, race conditions, resource cleanup (connections closed, listeners removed).

Message team-lead with findings.
```

## Step 3: Synthesize

Collect all findings. Present unified review:

```markdown
## SET Review Summary

### Spec Compliance
- {findings from spec reviewer}

### Critical (must fix before merge)
- ...

### Improvements (should fix)
- ...

### Suggestions (nice to have)
- ...

### Good Patterns (add to the relevant shard under `.claude/set/learnings/` via /set-learn)
- ...
```

## Step 4: Clean Up

Shut down all reviewers. Clean up the team.

If critical or "should fix" issues exist:
- Suggest: "Run `/set-build {feature}` again to fix these issues" (for large fixes)
- Or: "These are small enough to fix directly — want me to handle them?" (for minor fixes)

If all clean:
- Suggest: "Run `/set-learn` to capture learnings from this cycle"

## Step 5: Finishing

If the review is clean and user is ready to integrate:
- Present the 4 options from Superpowers' finishing-a-development-branch:
  1. Merge back to base branch locally
  2. Push and create a Pull Request
  3. Keep the branch as-is
  4. Discard this work

Execute the user's choice.
