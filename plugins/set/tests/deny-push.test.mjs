import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import { runHook, decisionOf, reasonOf } from "./helpers/hook-harness.mjs";

const HOOK = new URL("../hooks/set-deny-push.sh", import.meta.url).pathname;
const MARKER_REL = ".claude/set/RUN-IN-PROGRESS.md";
const SHORT_HOST = hostname().split(".")[0];

// A gated command is denied only when BOTH conditions hold: the caller is a spawned agent
// AND a build is running in its worktree. The parser tests below exercise the first half,
// so they need the second half held true — hence a real worktree carrying a live marker.
// Without one, every "git push is recognized through sh -c" case would pass for the wrong
// reason: allowed because no build is running, not because the parser missed it.
const TMP = [];
function makeWorktree(markerBody /* string | null */) {
  const dir = mkdtempSync(join(tmpdir(), "set-wt-"));
  TMP.push(dir);
  mkdirSync(join(dir, ".git"), { recursive: true });
  if (markerBody !== null) {
    mkdirSync(join(dir, ".claude/set"), { recursive: true });
    writeFileSync(join(dir, MARKER_REL), markerBody);
  }
  return dir;
}
// This test process is unambiguously alive and owned by us, so `kill -0` succeeds outright
// rather than landing in the EPERM branch. (pid 1 would also read as alive, but only via the
// EPERM path — a weaker signal that would pass even if the ESRCH handling regressed.)
const LIVE_PID = process.pid;
const DEAD_PID = 2 ** 22; // above any real pid on macOS/Linux → ESRCH
const liveMarker = (extra = "") =>
  `# SET run in progress\n\nrun: test-run\npid: ${LIVE_PID}\nhost: ${SHORT_HOST}\nstarted: 2026-08-16T14:22:33Z\n${extra}`;

const RUNNING_WORKTREE = makeWorktree(liveMarker());
after(() => {
  for (const d of TMP) rmSync(d, { recursive: true, force: true });
});

// Payload shapes are the probe's verbatim findings
// (docs/superpowers/specs/2026-08-16-hook-payload-probe-findings.md):
// main context carries no agent_id/agent_type; every spawn carries both.
const BASE = {
  session_id: "419028df-7870-4e25-bf99-4f2c93d59547",
  transcript_path: "/Users/example/.claude/projects/x/419028df.jsonl",
  cwd: "/Users/example/repo",
  prompt_id: "c1a349b3-3fab-49c8-863e-fc6864bf72f8",
  permission_mode: "auto",
  effort: { level: "high" },
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_use_id: "toolu_01Q83DQ7HgPcxCKVxGU2eQv8",
};

// Defaults to a worktree with a LIVE marker, so these payloads exercise the command parser
// rather than the run-state gate. Pass `cwd` explicitly to test run state itself.
const agentBash = (command, extra = {}) => ({
  ...BASE,
  cwd: RUNNING_WORKTREE,
  agent_id: "abuilder-t1-set-f74239eb064f3a3d",
  agent_type: "builder-t1-set",
  tool_input: { command, description: "x" },
  ...extra,
});
const mainBash = (command) => ({ ...BASE, tool_input: { command, description: "x" } });

const DENY_COMMANDS = [
  "git push",
  "git push origin main",
  "git push --force-with-lease origin feat/x",
  "pnpm test && git push",
  'git commit -m x; git push',
  "git commit -m x || git push",
  "pnpm test | tee out && git push",
  "env FOO=1 git push",
  "FOO=1 git push",
  "sudo git push",
  "sudo -u bob git push",
  "git -C /some/repo push",
  "git -c push.default=current push",
  "(git push)",
  "gh pr create --title x",
  "gh pr merge 5",
  "gh pr merge 5 --squash",
  "cd repo\ngit push",
  'bash -c "git push"',
  "echo $(git push)",
  "echo `git push`",
  "true && { git push; }",
  "sh -lc 'cd repo && git push'",
  "bash -c 'git status; gh pr merge 3'",
  // review round 2: wrappers, keywords, separators, and quoting forms agents actually emit
  "git push&",
  "nohup git push > /dev/null 2>&1 &",
  "git push 2>&1 | tail",
  "timeout 300 git push",
  "timeout -s KILL 5 git push",
  "nice -n 10 git push",
  "xargs -n 1 -I{} git push < list",
  "caffeinate git push",
  "if git diff --quiet; then git push; fi",
  "for b in a b; do git push origin $b; done",
  "while true; do git push; done",
  "! git push",
  "git \\\npush",
  "\\git push",
  'bash -o pipefail -c "git push"',
  'bash --rcfile /dev/null -c "git push"',
  "sh -c $'git push'",
  'bash -c "cd x\ngit push"',
  "gh pr -R owner/repo create",
  "gh api -X POST repos/o/r/pulls -f title=x",
  "gh api -X PUT repos/o/r/pulls/1/merge",
  "gh api repos/o/r/pulls --method POST",
  "cat <<EOF; git push\nx\nEOF",
  "cat <<EOF\ngit push\nEOF\ngit push",
  'echo "\\\\"; git push',
];

const ALLOW_COMMANDS = [
  'git commit -m "x"',
  'git commit -m "push the fix"',
  "git status",
  "git log --grep push",
  "git fetch origin && git rebase origin/main",
  "git pull",
  "gh pr view 5",
  "gh pr list",
  "gh pr checks 5",
  "pnpm test",
  "echo git push",
  "grep -rn 'git push' docs/",
  "bash -c 'git status'",
  "bash script.sh",
  // review round 2: quoted text is data, not a command — commits must never be blocked
  'git commit -m "fix hook; git push still blocked"',
  'git commit -m "a && git push later"',
  "git commit -m 'gh pr create is denied'",
  'git commit -m "$(cat <<\'EOF\'\nfeat: hook\n\n- gh pr create is denied\n- git push blocked\nEOF\n)"',
  'git commit -m "feat: hook\n\n- git push blocked\n\nCo-Authored-By: x"',
  "cat <<EOF > notes.md\ngit push\ngh pr create\nEOF",
  "cat <<'EOF'\ngit push\nEOF",
  "cat <<-EOF\n\tgit push\n\tEOF\necho done",
  'echo "\\"; git push"',
  "echo 'a; git push'",
  'echo <<< "git push"',
  "gh api repos/o/r/pulls",
  "gh api repos/o/r/pulls/1",
  "gh pr create-foo",
  "git pushx",
  "timeout 5 npm test",
  "nice -n 10 npm test",
  "sudo -n ls",
  "echo * && git status",
];

for (const command of DENY_COMMANDS) {
  test(`agent: ${JSON.stringify(command)} → deny`, () => {
    const r = runHook(HOOK, agentBash(command));
    assert.equal(decisionOf(r), "deny", r.stdout + r.stderr);
  });
}

for (const command of ALLOW_COMMANDS) {
  test(`agent: ${JSON.stringify(command)} → allow`, () => {
    const r = runHook(HOOK, agentBash(command));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(decisionOf(r), null, r.stdout);
  });
}

test("deny message teaches the !git push escape hatch", () => {
  const r = runHook(HOOK, agentBash("git push origin feat/x"));
  assert.match(reasonOf(r), /!git push origin <branch>/);
  assert.match(reasonOf(r), /no tool call, no hook/);
});

// Identity carve-out — selected by the probe findings: the main context is the human's
// supervised session and may push; every spawn is denied.
test("main context: git push → allow (identity carve-out)", () => {
  const r = runHook(HOOK, mainBash("git push origin feat/x"));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), null, r.stdout);
});

test("main context: gh pr create → allow (identity carve-out)", () => {
  const r = runHook(HOOK, mainBash("gh pr create --fill"));
  assert.equal(decisionOf(r), null, r.stdout);
});

// A half-shaped payload still classifies as an agent — `has(agent_id) or has(agent_type)`.
// These run inside a live-marker worktree so they reach the run-state check at all; with no
// build running they would allow, which is the run-scoped rule working, not a classification
// failure. What is under test here is the identity half.
test("agent_id alone (no agent_type) → deny during a live build", () => {
  const p = { ...mainBash("git push"), cwd: RUNNING_WORKTREE, agent_id: "a3ab692a2e497df0a" };
  assert.equal(decisionOf(runHook(HOOK, p)), "deny");
});

test("agent_type alone (no agent_id) → deny during a live build", () => {
  const p = { ...mainBash("git push"), cwd: RUNNING_WORKTREE, agent_type: "general-purpose" };
  assert.equal(decisionOf(runHook(HOOK, p)), "deny");
});

test("unnamed spawn (agent_type = subagent_type) → deny", () => {
  const p = agentBash("git push", { agent_id: "a3ab692a2e497df0a", agent_type: "general-purpose" });
  assert.equal(decisionOf(runHook(HOOK, p)), "deny");
});

test("unknown identity: payload without the probed session fields → deny", () => {
  // Not the shape the probe observed. Identity is undetectable → fail closed.
  const r = runHook(HOOK, { tool_name: "Bash", tool_input: { command: "git push" } });
  assert.equal(decisionOf(r), "deny");
  assert.match(reasonOf(r), /identity/i);
});

test("unknown identity still allows non-push commands", () => {
  const r = runHook(HOOK, { tool_name: "Bash", tool_input: { command: "git status" } });
  assert.equal(decisionOf(r), null, r.stdout);
});

test("malformed JSON payload → deny, with a reason", () => {
  const r = runHook(HOOK, "{not json");
  assert.equal(decisionOf(r), "deny");
  assert.match(reasonOf(r), /payload/i);
});

test("empty payload → deny, with a reason", () => {
  const r = runHook(HOOK, "");
  assert.equal(decisionOf(r), "deny");
});

test("jq unavailable → deny, with a reason", () => {
  // A PATH holding everything the hook needs except jq.
  const bin = mkdtempSync(join(tmpdir(), "nojq-"));
  try {
    for (const tool of ["bash", "env", "sh", "cat", "sed", "grep", "tr", "head"]) {
      for (const dir of ["/bin", "/usr/bin"]) {
        const src = join(dir, tool);
        if (existsSync(src)) {
          symlinkSync(src, join(bin, tool));
          break;
        }
      }
    }
    const r = runHook(HOOK, agentBash("git push"), { env: { PATH: bin } });
    assert.equal(decisionOf(r), "deny", r.stdout + r.stderr);
    assert.match(reasonOf(r), /jq/);
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
});

test("glob characters are never expanded against the cwd (a deep glob used to push the hook past its timeout)", () => {
  const started = Date.now();
  const r = runHook(HOOK, agentBash("echo /*/*/*/*/*/* && git push"));
  assert.equal(decisionOf(r), "deny", r.stdout);
  assert.ok(Date.now() - started < 3000, `took ${Date.now() - started}ms`);
});

test("a command over the parse cap degrades to a coarse scan — still denies, still fast", () => {
  const big = "echo " + "a".repeat(200_000) + "; git push";
  const started = Date.now();
  const r = runHook(HOOK, agentBash(big));
  assert.equal(decisionOf(r), "deny", r.stdout);
  assert.ok(Date.now() - started < 3000, `took ${Date.now() - started}ms`);
  const bigOk = "echo " + "a".repeat(200_000) + "; git status";
  assert.equal(decisionOf(runHook(HOOK, agentBash(bigOk))), null);
});

test("worst case under the parse cap (tens of thousands of segments) stays well under the hook timeout", () => {
  const cmd = "git;".repeat(16_000) + " git push";
  const started = Date.now();
  const r = runHook(HOOK, agentBash(cmd));
  assert.equal(decisionOf(r), "deny", r.stdout);
  assert.ok(Date.now() - started < 6000, `took ${Date.now() - started}ms`);
});

test("non-string tool_input.command → deny, with a reason", () => {
  const r = runHook(HOOK, agentBash(["git", "push"]));
  assert.equal(decisionOf(r), "deny");
  assert.match(reasonOf(r), /payload/i);
});

test("non-Bash tool → allow (defensive; the matcher should prevent it)", () => {
  const r = runHook(HOOK, { ...BASE, tool_name: "Read", tool_input: { file_path: "/x" } });
  assert.equal(decisionOf(r), null);
});

// ---------------------------------------------------------------------------
// Run-scoped gate: a gated command is denied only when the caller is an agent AND a build
// is live in its worktree. Spec: docs/superpowers/specs/2026-08-16-run-scoped-push-gate-design.md
// ---------------------------------------------------------------------------

const at = (minsAgo) =>
  new Date(Date.now() - minsAgo * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");

test("agent push with NO marker → allow (the case this whole change exists to permit)", () => {
  const wt = makeWorktree(null);
  assert.equal(decisionOf(runHook(HOOK, agentBash("git push", { cwd: wt }))), null);
});

test("agent push with a live marker → deny, naming the run and the remedy", () => {
  const r = runHook(HOOK, agentBash("git push", { cwd: RUNNING_WORKTREE }));
  assert.equal(decisionOf(r), "deny", r.stdout);
  assert.match(reasonOf(r), /active build/i);
  assert.match(reasonOf(r), /test-run/);            // run id surfaced for inspection
  assert.match(reasonOf(r), /RUN-IN-PROGRESS\.md/); // stale-marker remedy is visible
});

test("gh pr create is gated by run state exactly like git push", () => {
  assert.equal(decisionOf(runHook(HOOK, agentBash("gh pr create --fill", { cwd: RUNNING_WORKTREE }))), "deny");
  const wt = makeWorktree(null);
  assert.equal(decisionOf(runHook(HOOK, agentBash("gh pr create --fill", { cwd: wt }))), null);
});

test("MAIN session pushes during a live build — allowed; identity short-circuits run state", () => {
  const p = { ...mainBash("git push"), cwd: RUNNING_WORKTREE };
  assert.equal(decisionOf(runHook(HOOK, p)), null);
});

test("non-gated commands are never touched, marker or not", () => {
  assert.equal(decisionOf(runHook(HOOK, agentBash("git commit -m x", { cwd: RUNNING_WORKTREE }))), null);
  assert.equal(decisionOf(runHook(HOOK, agentBash("pnpm test", { cwd: RUNNING_WORKTREE }))), null);
});

test("a build in repo A does not gate a push in repo B", () => {
  const other = makeWorktree(null);
  assert.equal(decisionOf(runHook(HOOK, agentBash("git push", { cwd: other }))), null);
  assert.equal(decisionOf(runHook(HOOK, agentBash("git push", { cwd: RUNNING_WORKTREE }))), "deny");
});

test("marker is found from a SUBDIRECTORY of the worktree, not just its root", () => {
  const sub = join(RUNNING_WORKTREE, "src/deep/nested");
  mkdirSync(sub, { recursive: true });
  assert.equal(decisionOf(runHook(HOOK, agentBash("git push", { cwd: sub }))), "deny");
});

test("the walk-up stops at the repo root — a marker ABOVE the repo does not gate it", () => {
  const outer = makeWorktree(liveMarker());            // marker here, but .git too
  const inner = join(outer, "vendor/inner");
  mkdirSync(join(inner, ".git"), { recursive: true }); // nested repo, no marker of its own
  assert.equal(decisionOf(runHook(HOOK, agentBash("git push", { cwd: inner }))), null);
});

// --- staleness: only a POSITIVE finding that the run is gone may open the gate ---

test("dead pid → allow (a crashed build self-heals instead of denying forever)", () => {
  const wt = makeWorktree(`run: r\npid: ${DEAD_PID}\nhost: ${SHORT_HOST}\nstarted: ${at(1)}\n`);
  assert.equal(decisionOf(runHook(HOOK, agentBash("git push", { cwd: wt }))), null);
});

test("dead pid on ANOTHER host → deny (liveness is never assumed across machines)", () => {
  const wt = makeWorktree(`run: r\npid: ${DEAD_PID}\nhost: some-other-box\nstarted: ${at(1)}\n`);
  assert.equal(decisionOf(runHook(HOOK, agentBash("git push", { cwd: wt }))), "deny");
});

test("no pid, fresh heartbeat → deny; no pid, stale past 15min → allow", () => {
  const fresh = makeWorktree(`run: r\nstarted: ${at(2)}\n`);
  assert.equal(decisionOf(runHook(HOOK, agentBash("git push", { cwd: fresh }))), "deny");
  const stale = makeWorktree(`run: r\nstarted: ${at(99)}\n`);
  assert.equal(decisionOf(runHook(HOOK, agentBash("git push", { cwd: stale }))), null);
});

test("unparseable pid is UNKNOWN, not dead → deny", () => {
  const wt = makeWorktree(`run: r\npid: notanumber\nhost: ${SHORT_HOST}\nstarted: ${at(1)}\n`);
  assert.equal(decisionOf(runHook(HOOK, agentBash("git push", { cwd: wt }))), "deny");
});

test("unparseable timestamp with no pid is UNKNOWN, not stale → deny", () => {
  const wt = makeWorktree("run: r\nstarted: sometime-last-tuesday\n");
  assert.equal(decisionOf(runHook(HOOK, agentBash("git push", { cwd: wt }))), "deny");
});

test("marker with no usable fields at all → deny, and says it could not parse", () => {
  const wt = makeWorktree("# SET run in progress\n\nnothing machine-readable here\n");
  const r = runHook(HOOK, agentBash("git push", { cwd: wt }));
  assert.equal(decisionOf(r), "deny", r.stdout);
  assert.match(reasonOf(r), /cannot parse/i);
});

test("run id is only echoed when it is a safe token — it comes from a human-editable file", () => {
  const wt = makeWorktree(
    `run: has spaces and "quotes" and \\backslashes\npid: ${LIVE_PID}\nhost: ${SHORT_HOST}\nstarted: ${at(1)}\n`,
  );
  const r = runHook(HOOK, agentBash("git push", { cwd: wt }));
  assert.equal(decisionOf(r), "deny", r.stdout);
  assert.ok(r.json, "output must remain valid JSON");
  assert.doesNotMatch(reasonOf(r), /quotes/);
});

test("a missing cwd cannot be resolved to a worktree → allow (documented fail-open)", () => {
  const p = agentBash("git push", { cwd: "/nonexistent/path/anywhere" });
  assert.equal(decisionOf(runHook(HOOK, p)), null);
});
