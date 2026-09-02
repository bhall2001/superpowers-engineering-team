# Lean Testing Principles

Adapted from Kent C. Dodds's `testing-principles.md`
(https://github.com/kentcdodds/kody/blob/main/docs/contributing/testing-principles.md).
`/set-init` writes this into a project's CLAUDE.md; `/set-update` migrates older
projects onto it. Injected into every builder's per-task bundle and into every
scaffolded specialist's conventions. Both cite this file, so edit it here and
nowhere else.

```markdown
### Testing Principles (enforced by /set-build for every builder)
1. Fewer, longer tests — one test per behavior/workflow, not one per assertion.
   Multiple related assertions in one test is expected, not a smell.
2. No shared mutable setup hooks (`beforeEach`/`afterEach`, pytest fixtures,
   `@BeforeEach`, etc.) — inline setup per test. Extract a shared plain
   function only after real duplication pain across many tests.
3. No tautological assertions — an assertion needs an independent oracle.
   Reject identity predicates, constant-to-self pins, algorithm echoes
   (rebuilding `expected` with the same logic as the code under test), and
   self-equality checks.
4. High bar to add a test, especially slow/integration ones — default to
   not adding one; add only when it falsifies real behavior a faster test
   can't reach.
5. No regression tests for improbable bugs unless the flow's importance
   justifies the ongoing maintenance cost.
6. No prose/copy-pinning — don't assert on incidental strings (descriptions,
   warnings). Test behavior and contracts, not copy.
7. Absence assertions only when state flips (present → action → absent) —
   not as a lone post-deletion check.
8. Pick the lightest test flavor that can falsify the behavior — unit
   before integration before end-to-end.
```
