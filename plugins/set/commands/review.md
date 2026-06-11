---
description: "Runs a four-perspective review (spec compliance, security, architecture, correctness) on the current build using parallel reviewer agents. Use after /set-build completes, when a user says 'review the code', 'run a review', 'check the build', or 'ready for review'. Do NOT use mid-build or as a substitute for the builder's own self-review checklist."
---

# SET Review — Multi-Perspective + Spec Compliance Review

## What to Review

If the user provides a branch/PR/commit range with `$ARGUMENTS`, use that.
Otherwise: `git diff main...HEAD`

## Step 1: Gather Context

```bash
git diff main...HEAD --stat
git log --oneline main..HEAD
```

Read the diff. Also read:
- The design spec from `docs/superpowers/specs/` (if one exists)
- The plan from `.claude/plans/` (if one exists)

## Step 2: Spawn Review Team

```
Teammate({ operation: "spawnTeam", team_name: "review-{feature}" })
```

Create 4 tasks and spawn 4 teammates:

### Spec Compliance Reviewer Prompt

```
Review the git diff (main...HEAD) against the design spec and implementation plan.

READ FIRST:
- Design spec: {path to spec in docs/superpowers/specs/}
- Implementation plan: {path to plan in .claude/plans/}
- Use `mcp__serena__list_memories` to find shards whose domain intersects the diff scope. Use `mcp__serena__read_memory` to fetch them.

VERIFY:
- Every requirement in the design spec has been implemented
- No features added that aren't in the spec
- Implementation matches the approach in the plan
- Acceptance criteria from each plan task are met

DO NOT trust commit messages or comments — read the actual code.

Report:
- ✅ Spec compliant: all requirements met, nothing extra
- ❌ Issues: [list specifically what's missing, extra, or misinterpreted — with file:line refs]

Message team-lead with findings.
```

### Security Reviewer Prompt

```
Review the git diff (main...HEAD) for security issues.

READ FIRST: use `mcp__serena__list_memories` filtered to security/validation/auth domains. Use `mcp__serena__read_memory` to fetch "Recurring Bugs" sections.

CHECK: SQL injection, XSS, CSRF, hardcoded secrets/keys, missing input validation, insecure auth patterns, sensitive data in logs/errors, missing rate limiting, unsafe deserialization, path traversal.

Message team-lead with findings: file, line, severity (critical/high/medium/low), suggested fix.
If nothing found, confirm the changes look secure.
```

### Architecture Reviewer Prompt

```
Review the git diff (main...HEAD) for architectural quality.

READ FIRST: CLAUDE.md for project conventions. Use `mcp__serena__list_memories` to find shards intersecting the diff. Use `mcp__serena__read_memory` to fetch "What Works" / "What Failed" sections.

CHECK: Pattern consistency, separation of concerns, SOLID violations, DRY without over-abstraction, dependency direction, testability, performance at scale, error handling consistency.

Message team-lead with findings: file, concern, suggestion.
Also note things done WELL — good patterns worth documenting.
```

### Correctness Reviewer Prompt

```
Review the git diff (main...HEAD) for correctness. Also run the test suite.

READ FIRST: use `mcp__serena__list_memories` to find shards intersecting the diff. Use `mcp__serena__read_memory` to fetch "Recurring Bugs" sections.

CHECK: Test quality (not coverage theater), edge cases (null/empty/boundary), helpful error messages, type consistency across API boundaries, race conditions, resource cleanup.

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

### Good Patterns (add to the relevant shard via /set-learn)
- ...
```

## Step 4: Clean Up

Shut down all reviewers. Clean up the team.

If critical or "should fix" issues exist:
- Suggest: "Run `/set-build {feature}` again to fix these issues" (for large fixes)
- Or: "These are small enough to fix directly — want me to handle them?" (for minor fixes)

If all clean: suggest "Run `/set-learn` to capture learnings from this cycle"

## Step 5: Finishing

If review is clean and user is ready to integrate, present 4 options:
1. Merge back to base branch locally
2. Push and create a Pull Request
3. Keep the branch as-is
4. Discard this work

Execute the user's choice.
