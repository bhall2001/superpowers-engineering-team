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
reference file carries the principles; seven existing files get pointed at it or
edited where they currently reward volume — spanning every pipeline stage from
project init through build-time verification, not just the per-task bundle.

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

### 7. `commands/init.md` — CLAUDE.md block and specialist scaffolding

Two separate hooks here, both confirmed by reading the file:

- **CLAUDE.md block (Step 6, lines ~407–422).** The `### Per-Task TDD Loop` block is
  copied verbatim from `references/tdd-loop.md` into every project's CLAUDE.md, and
  the comment directly below it says to read that file rather than retype the loop
  "so this block and `/set-update`'s migration stay identical." Add a parallel
  `### Testing Principles` block copied verbatim from the new
  `references/testing-principles.md`, with the same "copied verbatim, read from
  there" note. This is what makes the principles visible project-wide (any human or
  agent reading CLAUDE.md), not just injected into per-task bundles at build time.
  `/set-update`'s migration path picks this up automatically since it already
  re-syncs the TDD loop block the same way.
- **Specialist scaffolding (Step 7c, the per-agent starter template).** The
  generated agent file template has a `## Conventions` section
  ("Domain-specific conventions from CLAUDE.md or detected patterns"). Add one
  bullet there, populated for every scaffolded specialist (not just
  `qa-specialist`): "Follow `references/testing-principles.md` for any tests you
  write or review." Also fix Step 7b's routing table: `qa-specialist.md`'s "Covers"
  cell currently reads "Test strategy, **edge cases**, integration tests, spec
  compliance" — drop "edge cases" (it's the same volume-rewarding phrase flagged in
  the builder prompt) in favor of "Test strategy, lean coverage, integration tests,
  spec compliance."

`design.md` was checked and has no test-related content to update — it's pure
requirements/spec brainstorming with no mention of tests, so it's not a surface for
this change. Test shape only enters the pipeline at plan time onward.

### 8. `commands/update.md` — migrate existing projects

Confirmed by reading Step 1a: it migrates **only** the TDD-loop heading and its
numbered list, matched specifically ("that heading and its numbered list") against
the block `tdd-loop.md` defines. It has no knowledge of a Testing Principles block
and would silently skip it for projects `/set-init`'d before this change — this is
a required edit, not just a thing to confirm later. Add a companion migration step
(1a-equivalent): if `### Testing Principles` is absent from a project's CLAUDE.md,
propose adding the fenced block from `references/testing-principles.md` verbatim,
same pattern as the existing TDD-loop migration. Report it alongside the TDD-loop
migration result in Step 1d.

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
`build.md`, `init.md`, `update.md`, `enhanced-builder-prompt.md`,
`enhanced-qa-prompt.md` after editing for internal consistency (the same "lean
tests" phrasing appears at plan-time, build-time self-review, QA-time,
verifier-time, and now project-wide via CLAUDE.md and every scaffolded specialist,
all pointing at the one `testing-principles.md` source of truth) and confirm no
other file duplicates TDD loop or testing-principles text that would drift
(`tdd-loop.md`'s own header states it is cited, not copied, elsewhere — the new
file should carry the same header convention, and both files' "copied verbatim"
claims into `init.md`'s CLAUDE.md block, and `update.md`'s migration match text,
must actually match word-for-word after editing).

## Unresolved Questions

- Shard interaction: should `set-learn` be told to write lean-testing violations
  into learning shards when a builder repeatedly bloats tests? Not designed here —
  can follow naturally once `set-learn` sees the new `notes` content in practice.
