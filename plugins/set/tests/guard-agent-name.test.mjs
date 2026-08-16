import { test } from "node:test";
import assert from "node:assert/strict";
import { runHook, decisionOf, reasonOf } from "./helpers/hook-harness.mjs";

const HOOK = new URL("../hooks/set-guard-agent-name.sh", import.meta.url).pathname;

// Payload shape is the probe's Q4 finding verbatim: `tool_input` = {description, prompt,
// subagent_type, name}, with `name` a top-level key of tool_input, absent when unnamed.
const BASE = {
  session_id: "419028df-7870-4e25-bf99-4f2c93d59547",
  transcript_path: "/Users/example/.claude/projects/x/419028df.jsonl",
  cwd: "/Users/example/repo",
  prompt_id: "c1a349b3-3fab-49c8-863e-fc6864bf72f8",
  permission_mode: "auto",
  effort: { level: "high" },
  hook_event_name: "PreToolUse",
  tool_name: "Agent",
  tool_use_id: "toolu_01UR1cA6iUMKi7aYuA51aLqp",
};

const spawn = (tool_input) => ({ ...BASE, tool_input });

// build.md T3 template, verbatim shape.
const VERIFIER_PROMPT = `You verify one task. You write NO code — verification only.
           Task: T-add-thing
           Context: ...
           Rubric: ...
           Return ONLY this JSON: { task, passed, tdd_followed, spec_compliant,
           lint_pass, typecheck_pass, failing_criteria, notes }`;

const SCHEMA_ONLY_PROMPT = `Check the task and return { task, passed, tdd_followed, spec_compliant, notes }`;
const NO_CODE_ONLY_PROMPT = `Look at the diff. You write NO code. Tell me if it is fine.`;

const BUILDER_PROMPT = `Task: T-add-thing
TDD steps: write the failing test first, then implement.
Done when: the endpoint returns 200.
You are a builder on a SET team. Commit when green.`;

test("named + full verifier prompt (T3 template) → deny", () => {
  const r = runHook(HOOK, spawn({ description: "verify", prompt: VERIFIER_PROMPT, subagent_type: "general-purpose", name: "verifier-1" }));
  assert.equal(decisionOf(r), "deny", r.stdout + r.stderr);
});

test("named + prompt requesting the verdict schema → deny", () => {
  const r = runHook(HOOK, spawn({ description: "verify", prompt: SCHEMA_ONLY_PROMPT, subagent_type: "general-purpose", name: "checker" }));
  assert.equal(decisionOf(r), "deny");
});

test("named + prompt stating 'you write NO code' → deny", () => {
  const r = runHook(HOOK, spawn({ description: "verify", prompt: NO_CODE_ONLY_PROMPT, name: "checker" }));
  assert.equal(decisionOf(r), "deny");
});

test("marker match is case-insensitive on 'no code'", () => {
  const r = runHook(HOOK, spawn({ description: "verify", prompt: "You write no code; verify only.", name: "checker" }));
  assert.equal(decisionOf(r), "deny");
});

test("deny message names the rule and the fix", () => {
  const r = runHook(HOOK, spawn({ description: "verify", prompt: VERIFIER_PROMPT, name: "verifier-1" }));
  assert.match(reasonOf(r), /name/);
  assert.match(reasonOf(r), /re-spawn without `name`/);
  assert.match(reasonOf(r), /mailbox receipt/);
});

test("named builder prompt (no verifier markers) → allow", () => {
  const r = runHook(HOOK, spawn({ description: "build", prompt: BUILDER_PROMPT, subagent_type: "odm-db-drizzle", name: "odm-db-drizzle-set" }));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), null, r.stdout);
});

test("unnamed + verifier-shaped prompt → allow (the correct spawn)", () => {
  const r = runHook(HOOK, spawn({ description: "verify", prompt: VERIFIER_PROMPT, subagent_type: "general-purpose" }));
  assert.equal(decisionOf(r), null, r.stdout);
});

test("unnamed + builder prompt → allow", () => {
  const r = runHook(HOOK, spawn({ description: "build", prompt: BUILDER_PROMPT, subagent_type: "general-purpose" }));
  assert.equal(decisionOf(r), null, r.stdout);
});

test("empty-string name is treated as unnamed → allow", () => {
  const r = runHook(HOOK, spawn({ description: "verify", prompt: VERIFIER_PROMPT, name: "" }));
  assert.equal(decisionOf(r), null, r.stdout);
});

test("partial schema (only 'passed') is not verifier-shaped → allow", () => {
  const r = runHook(HOOK, spawn({ description: "build", prompt: "Report back whether tests passed.", name: "builder-set" }));
  assert.equal(decisionOf(r), null, r.stdout);
});

test("non-Agent tool → allow (defensive; the matcher should prevent it)", () => {
  const r = runHook(HOOK, { ...BASE, tool_name: "Bash", tool_input: { command: "echo NO code passed spec_compliant tdd_followed" } });
  assert.equal(decisionOf(r), null, r.stdout);
});

test("malformed payload → deny, with a reason", () => {
  const r = runHook(HOOK, "{nope");
  assert.equal(decisionOf(r), "deny");
  assert.match(reasonOf(r), /payload/i);
});

test("empty payload → deny, with a reason", () => {
  const r = runHook(HOOK, "");
  assert.equal(decisionOf(r), "deny");
});

// Known heuristic limit, recorded not fixed (plan step 5): a named BUILDER whose prompt
// quotes the verdict schema — e.g. an A3 bundle that pastes the rubric — false-positives.
// Recoverable: the deny message states the fix. Kept as a test so the behaviour is
// visible and a future change to the markers is a deliberate one.
test("KNOWN LIMIT: named builder whose prompt quotes the verdict schema → deny (false positive)", () => {
  const prompt = `${BUILDER_PROMPT}\nThe verifier will later return { passed, tdd_followed, spec_compliant }.`;
  const r = runHook(HOOK, spawn({ description: "build", prompt, name: "builder-set" }));
  assert.equal(decisionOf(r), "deny");
});
