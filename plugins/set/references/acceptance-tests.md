# Acceptance Tests

Who writes a task's tests, and what they are. `/set-build` Phase B0 spawns one test author
per task that has Acceptance Workflows, **before** any builder starts. The builder then
implements against tests it did not write and may not edit.

Why: a builder that writes both its tests and its code carries one misreading into both, and
the bar goes green on a bug. Telling an agent to "do TDD" does not change that. A second
agent reading the same spec does. This is not a TDD ritual; it is independent authorship of
the contract.

**The project's testing standard wins.** If `CLAUDE.md` names testing docs, the test author
reads them first. They govern shape, count, location and assertion quality, and where they
differ from this file they override it. Nothing here adds a test the standard would not allow.

## Test-author prompt

Spawn **unnamed** (its result is the return value — `references/agent-return-channels.md`).
`subagent_type` = the task's `Specialist`, or omit when `generic`.

```
You write the acceptance tests for one task. You write NO production code except throwing
stubs (rule 4). You do not implement the feature.
Task: {task name}
Context: {A3 bundle}

READ FIRST: CLAUDE.md and every testing standard it names. They govern test shape, count
and location, and override this prompt where they differ.

RULES:
1. One test per entry under "Acceptance Workflows" — a test is a workflow, not an
   assertion: act, assert what changed, act again, assert again. Do not write one test per
   "Done when" line. Fewest tests the project standard allows.
2. Assert where a caller observes the value (return value, rendered output, HTTP body,
   persisted row). Never assert what the type system guarantees. Never pin config strings
   or copy.
3. Each test stands alone: setup inline, no hooks that hide setup, no shared mutable
   state. Follow the project's file location and naming conventions.
4. Import the real thing under test. If it does not exist yet, create the smallest stub for
   a file this task creates — exports and signatures only, body throws `not implemented` —
   so red fails on behavior and not on a missing import. Never put logic in a stub. A module
   another task creates already has its stub from that task's author; never stub it.
5. Run the tests. Each must FAIL, and the failure message must be about the missing
   behavior. A typo, bad import or setup crash is a wrong-reason red: fix the test.
6. Commit only your test files and stubs: `test: acceptance tests for {task name}`.
   Do not push.

Return ONLY this JSON:
{ "task": "...", "files": ["test paths"], "stubs": ["stub paths"], "commit": "<sha>",
  "red_reasons": ["one line per test: why it fails"], "notes": "..." }
```

## Sequencing

Authors for tasks with a `Blocked by` list start after the authors of those tasks have
returned, so the stubs they import exist. Independent tasks run in parallel, ceiling 4.

A task whose Acceptance Workflows are `None` (scaffolding, types, config, a refactor with
existing coverage) gets no author. Lint, typecheck and `Done when` are its bar.

If an author's red is still wrong-reason after its own fixes, retry once with the failure
message. Still wrong: the task fails per the A5 escalation policy.

## What the builder receives

Appended to the task's A3 bundle:

```
## Acceptance tests (read-only)
Files: {files}    Stubs: {stubs}    Commit: {sha}
Written for this task by someone other than you. You may not edit, delete, skip or weaken
them. Replace the stubs with the implementation. If a test looks wrong, message the lead
with why — the lead decides.
```

## What the verifier checks

- `git diff {sha}..HEAD -- {files}` is empty (the builder did not touch them).
- They pass now, and each was red for a right reason when authored.
- Throwaway probes and one guard mutation run in a detached worktree, never the shared tree
  (`commands/build.md` T3).
