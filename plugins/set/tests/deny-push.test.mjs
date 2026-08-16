import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHook, decisionOf, reasonOf } from "./helpers/hook-harness.mjs";

const HOOK = new URL("../hooks/set-deny-push.sh", import.meta.url).pathname;

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

const agentBash = (command, extra = {}) => ({
  ...BASE,
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

test("agent_id alone (no agent_type) → deny", () => {
  const p = mainBash("git push");
  p.agent_id = "a3ab692a2e497df0a";
  assert.equal(decisionOf(runHook(HOOK, p)), "deny");
});

test("agent_type alone (no agent_id) → deny", () => {
  const p = mainBash("git push");
  p.agent_type = "general-purpose";
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
