# Per-Task TDD Loop

The bar every SET builder meets, for every task. `/set-init` writes this into a
project's CLAUDE.md; `/set-update` migrates older projects onto it. Both cite this
file, so edit it here and nowhere else.

```markdown
### Per-Task TDD Loop (enforced by /set-build for every builder)
0. Read the testing standards this file names, if any, before writing a test — they govern test shape and count and override this loop
1. Write failing tests first (TDD red phase) — the task's acceptance tests are already written and read-only; add your own only for behavior they cannot reach, and confirm each fails for the RIGHT reason
2. Implement minimal code to pass (TDD green phase)
3. Refactor while keeping tests green
4. Run tests — if fail: read error, fix, retry
5. Run linter/type checker — if fail: fix and retry
6. Self-review against acceptance criteria
7. Only mark a task complete when ALL checks pass — a fresh verifier confirms the bar before the work is folded back
```

Step 7 is the load-bearing one: the builder's own pass is self-graded, so a
separate verifier that wrote none of the code confirms it before the work is
folded back.

Step 1 is not a ritual. Instructing an agent to "do TDD" has not been shown to improve
correctness, and a builder that authors both its tests and its code shares one blind spot.
So the task's acceptance tests are written first by a different agent
(`references/acceptance-tests.md`), the builder cannot edit them, and the verifier probes
beyond them. A task with no workflow to falsify (scaffolding, types, config) writes no test.
The project's own testing standard always outranks this loop.
