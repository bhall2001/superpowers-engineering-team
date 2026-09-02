# Per-Task TDD Loop

The bar every SET builder meets, for every task. `/set-init` writes this into a
project's CLAUDE.md; `/set-update` migrates older projects onto it. Both cite this
file, so edit it here and nowhere else.

```markdown
### Per-Task TDD Loop (enforced by /set-build for every builder)
1. Write failing tests first (TDD red phase) — one test per workflow/behavior,
   per `references/testing-principles.md`, not one per assertion
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
