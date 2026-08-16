import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = new URL("../../..", import.meta.url).pathname;
const build = readFileSync(join(REPO, "plugins/set/commands/build.md"), "utf8");
const channels = readFileSync(join(REPO, "plugins/set/references/agent-return-channels.md"), "utf8");

// Gated on the probe: Q5 (suffix satisfies the name pattern) and Q6 (does not disturb
// subagent_type routing) both confirmed in
// docs/superpowers/specs/2026-08-16-hook-payload-probe-findings.md.

test("T2 builder spawn template names builders {Specialist}-set", () => {
  assert.match(build, /name: "\{Specialist\}-set"/);
  assert.doesNotMatch(build, /name: "\{Specialist\}",/, "un-suffixed builder name still present");
});

test("verifier spawn template carries no name", () => {
  // The T3 template block: from its heading to the next '###'.
  const t3 = build.slice(build.indexOf("### T3"), build.indexOf("### T4"));
  assert.ok(t3.length > 0, "T3 section not found");
  const block = t3.slice(t3.indexOf("```"), t3.indexOf("```", t3.indexOf("```") + 3));
  assert.doesNotMatch(block, /^\s*name:/m, "verifier template must stay unnamed");
});

test("agent-return-channels.md documents the -set suffix and its polarity", () => {
  assert.match(channels, /-set/);
  assert.match(channels, /corroborating evidence/i);
  assert.match(channels, /never[\s*]+(the[\s*]+)?trigger/i);
  // Absence of the marker never implies permission — stated, not implied.
  assert.match(channels, /absence[^.]*never[^.]*permission/i);
});

test("build.md verbose spawn label uses the suffixed name consistently", () => {
  assert.match(build, /→ spawn \{Specialist\}-set ::/);
});
