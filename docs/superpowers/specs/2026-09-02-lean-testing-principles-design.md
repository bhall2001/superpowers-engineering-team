# Lean testing principles for SET's TDD contract

## Problem

SET's TDD loop (`references/tdd-loop.md`) mandates tests but gives no signal on
shape or volume. `/set-plan`'s task template puts an open-ended `Tests` field on
every task, `enhanced-builder-prompt.md` step 10 explicitly asks builders to cover
"happy path AND at least one edge case" per task, and the build-time verifier grades
`tdd_followed` as a bare boolean. Nothing pushes back on quantity or structure.

In practice this produces high test counts per task — many single-assertion tests,
shared `beforeEach`-style fixtures, edge-case tests for improbable failure modes —
which is slow to run (materially so for JS/TS suites) and slow to review, without
buying proportional confidence.

Kent C. Dodds (`kentcdodds/kody/docs/contributing/testing-principles.md`,
`end-to-end-testing.md`, and his blog/podcast on the same theme) has published a
concrete, opinionated answer to this exact failure mode in AI-agent-authored test
suites: fewer, longer, workflow-shaped tests; no tautological assertions; a high bar
to add a test at all; pick the lightest test flavor that can falsify the behavior.
His reasoning is about test semantics, not JS syntax — confirmed language-agnostic
in scope, so this applies across all SET projects, not just JS/TS.

## Approach

Treat this as a constraint layer on the existing TDD loop, not a redesign. One new
reference file carries the principles; four existing files get pointed at it or
edited where they currently reward volume.

### 1. New file: `plugins/set/references/testing-principles.md`

A SET-adapted, attributed condensation of Kent's rules, phrased language-agnostically:

- **Fewer, longer tests.** One test per behavior/workflow, not one test per
  assertion. Multiple related assertions in one test is expected, not a smell.
- **No shared mutable setup hooks** (`beforeEach`/`afterEach` in JS, fixtures in
  pytest, `@BeforeEach` in JUnit, etc. — named generically as "setup hooks").
  Inline setup per test. Extract a shared helper only after real duplication pain
  across many tests, as a plain function — never a hook.
- **No tautological assertions** — an assertion must have an independent oracle.
  Reject: identity predicates, constant-to-self pins, "algorithm echo" (test
  reimplements the code under test to build its own expected value), self-equality.
- **High bar to add a test, especially slow/integration ones.** Default to not
  adding a new test; add one only when it falsifies real behavior a faster test
  can't reach.
- **No regression tests for improbable bugs** unless the flow's importance justifies
  the ongoing maintenance cost.
- **No prose/copy-pinning** — don't assert on incidental strings (descriptions,
  warnings). Test behavior/contracts, not copy.
- **Absence assertions only when state flips** (present → action → absent), not as
  a lone post-deletion check.
- **Pick the lightest test flavor that can falsify the behavior** — unit before
  integration before end-to-end.

Each rule is one line, matching the style of `tdd-loop.md` and this repo's
no-prose-in-comments convention. Source attribution (link to Kent's docs) goes at
the top of the file, once.

### 2. `references/tdd-loop.md`

Add a line to the loop pointing at the new file:

> 1. Write failing tests first (TDD red phase) — one test per workflow/behavior,
>    per `references/testing-principles.md`, not one per assertion

No structural change to the 7-step loop itself; this is a phrasing tightening on
step 1 plus a pointer.

### 3. `commands/plan.md` task template

- `Tests` field guidance: ask for workflow-shaped test descriptions ("one test
  covering X end-to-end") rather than an implicit list of cases.
- Self-Review Checklist: replace "Tests cover happy path AND edge cases" (rewards
  volume) with "Tests are workflow-shaped per `testing-principles.md` — no
  redundant or tautological cases, lightest flavor that falsifies the behavior."

### 4. `references/enhanced-builder-prompt.md`

- Step 5 (write failing tests): add a pointer to `testing-principles.md`.
- Step 10 self-review bullet "Do my tests cover happy path AND at least one edge
  case?" → replace with the same lean-testing bullet as the plan template, so the
  builder is graded consistently at self-review time and at verification time.

### 5. `references/enhanced-qa-prompt.md`

Stage 2 (code quality) bullet `g` currently says "test quality, edge cases,
architecture patterns...". Add: test suite is lean per `testing-principles.md` —
QA should flag (not just architecture/security) test bloat, shared-fixture
overuse, and tautological assertions as quality findings.

### 6. `commands/build.md` verifier (A4 rubric + T3 spawn)

No verdict schema change — schema is a stability seam shared by the Agent Team and
workflow paths, and this doesn't need a new field. Instead:

- A4 rubric gains a bullet: "Tests are lean per `testing-principles.md` — flag
  bloat, shared-fixture setup, and tautological assertions in `notes`."
- T3's verifier spawn prompt already carries `{A4 rubric}` verbatim, so no separate
  edit needed there beyond A4 itself.

This makes verifier feedback on test quality **advisory** (surfaced in `notes` for
the human review/`/set-review` pass) rather than a new blocking gate — consistent
with the "no hard numeric ceiling" decision below.

## Explicitly out of scope

- **No numeric ceiling** (e.g. "max N tests per task"). Kent's own material never
  gives a fixed ratio — only qualitative rules plus periodic review (his "Keep
  Tests Tight" cleanup pass). A number invites gaming (one giant test to dodge the
  count). SET's verifier flags qualitative bloat in `notes` instead.
- **No new verdict schema field.** Keeps the Agent Team / workflow parity seam
  untouched.
- **No periodic cleanup automation** (Kent's daily "delete low-signal tests" agent
  job). Out of scope for this change — SET has no scheduled-agent primitive today;
  could be a future `/set-learn` extension if this proves valuable, but not part of
  this design.
- **No changes to `/set-review`'s four-lens review.** Test leanness is a build-time
  concern (verifier `notes`) and a QA concern (Stage 2), not a new review lens.

## Testing

This is a documentation/prompt-spec change — no executable code changes, so no
automated test suite applies. Verification is: re-read `tdd-loop.md`, `plan.md`,
`build.md`, `enhanced-builder-prompt.md`, `enhanced-qa-prompt.md` after editing for
internal consistency (the same "lean tests" phrasing appears at plan-time,
build-time self-review, QA-time, and verifier-time, all pointing at the one
`testing-principles.md` source of truth) and confirm no other file duplicates TDD
loop text that would drift (`tdd-loop.md`'s own header states it is cited, not
copied, elsewhere — confirm that still holds after edits).

## Unresolved Questions

- Shard interaction: should `set-learn` be told to write lean-testing violations
  into learning shards when a builder repeatedly bloats tests? Not designed here —
  can follow naturally once `set-learn` sees the new `notes` content in practice.
- Whether `/set-init`-scaffolded specialist agents should also get a pointer to
  `testing-principles.md` in their own definitions, vs. relying solely on the
  per-task A3 bundle injection. Leaning "injection is enough" but not confirmed.
