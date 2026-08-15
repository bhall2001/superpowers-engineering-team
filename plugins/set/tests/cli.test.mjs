import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const CLI = new URL("../bin/set-run.mjs", import.meta.url).pathname;

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** Invoke the CLI exactly as the orchestrator does: a subprocess, JSON on stdout. */
function cli(store, args, { cwd, expectFail = false } = {}) {
  try {
    const out = execFileSync(process.execPath, [CLI, ...args, "--store", store], {
      cwd,
      encoding: "utf8",
    });
    assert.ok(!expectFail, `expected failure but succeeded: ${out}`);
    return JSON.parse(out);
  } catch (err) {
    if (!expectFail) throw new Error(`${args[0]} failed: ${err.stderr || err.message}`);
    return { failed: true, ...JSON.parse(err.stdout || err.stderr || "{}") };
  }
}

function fixture() {
  const base = mkdtempSync(join(tmpdir(), "set-cli-"));
  const repo = join(base, "repo");
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q", ".");
  git(repo, "config", "user.email", "t@t.t");
  git(repo, "config", "user.name", "T");
  writeFileSync(join(repo, "README.md"), "base\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "base");
  git(repo, "checkout", "-q", "-b", "feat/x");
  return { base, repo, store: join(base, "runs.db") };
}

function start({ repo, store }) {
  return cli(store, [
    "init",
    "--worktree", repo,
    "--branch", "feat/x",
    "--plan", ".claude/plans/x.md",
  ]).run_id;
}

test("a full crash-and-resume cycle through the CLI", () => {
  const fx = fixture();
  try {
    const runId = start(fx);
    assert.match(runId, /^\d{8}-\d{6}-/);

    writeFileSync(join(fx.repo, "a.txt"), "a\n");
    cli(fx.store, ["task", "--run", runId, "--task", "T-alpha", "--status", "passed"]);
    writeFileSync(join(fx.repo, "b.txt"), "b\n");
    cli(fx.store, ["task", "--run", runId, "--task", "T-beta", "--status", "passed"]);

    const cp = cli(fx.store, [
      "checkpoint", "--run", runId, "--phase", "build",
      "--reason", "phase-boundary", "--files", "a.txt,b.txt",
    ]);
    assert.equal(cp.taken, true);
    assert.deepEqual(cp.tasks, ["T-alpha", "T-beta"]);

    // Verified after the checkpoint, and never committed: durable in the DB only.
    writeFileSync(join(fx.repo, "c.txt"), "c\n");
    cli(fx.store, ["task", "--run", runId, "--task", "T-gamma", "--status", "passed"]);

    const resumed = cli(fx.store, [
      "resume", "--run", runId, "--tasks", "T-alpha,T-beta,T-gamma,T-delta", "--force",
    ], { cwd: fx.repo });

    assert.deepEqual(resumed.durable, ["T-alpha", "T-beta"]);
    assert.deepEqual(resumed.redispatch.sort(), ["T-delta", "T-gamma"]);
    assert.ok(resumed.dirty_files.includes("c.txt"));
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

test("checkpoint refuses without a file scope rather than guessing", () => {
  const fx = fixture();
  try {
    const runId = start(fx);
    writeFileSync(join(fx.repo, "mine.txt"), "x\n");
    cli(fx.store, ["task", "--run", runId, "--task", "T-a", "--status", "passed"]);

    const cp = cli(fx.store, ["checkpoint", "--run", runId, "--phase", "build"]);
    assert.equal(cp.taken, false);
    assert.equal(cp.reason, "no-file-scope");
    assert.ok(cp.foreign.includes("mine.txt"));
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

test("init on a worktree held by a live run names the holder and the fix", () => {
  const fx = fixture();
  try {
    // --pid is this test process, which is alive for the duration.
    const first = cli(fx.store, [
      "init", "--worktree", fx.repo, "--branch", "feat/x",
      "--plan", ".claude/plans/x.md", "--pid", String(process.pid),
    ]).run_id;

    const second = cli(
      fx.store,
      ["init", "--worktree", fx.repo, "--branch", "feat/x", "--plan", "p.md"],
      { expectFail: true },
    );

    assert.ok(second.error.includes(first), "must name the holding run");
    assert.match(second.error, /set-run\.mjs release/, "must offer the recovery command");
    assert.doesNotMatch(second.error, /UNIQUE/, "must not leak the raw constraint violation");
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

test("init clears a demonstrably dead holder instead of erroring", () => {
  const fx = fixture();
  try {
    // A pid above pid_max: recorded, probeable, and definitively gone.
    const dead = cli(fx.store, [
      "init", "--worktree", fx.repo, "--branch", "feat/x",
      "--plan", ".claude/plans/x.md", "--pid", "4194304",
    ]).run_id;

    const fresh = start(fx);
    assert.notEqual(fresh, dead);

    const { runs } = cli(fx.store, ["list"]);
    const previous = runs.find((run) => run.run_id === dead);
    assert.equal(previous.status, "crashed", "the dead holder is marked, not deleted");
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

test("a run recorded without a pid is not treated as free to take", () => {
  const fx = fixture();
  try {
    const first = start(fx); // no --pid
    const second = cli(
      fx.store,
      ["init", "--worktree", fx.repo, "--branch", "feat/x", "--plan", "p.md"],
      { expectFail: true },
    );
    // Unknown liveness must block. A fresh heartbeat means it is not yet stale.
    assert.ok(second.error.includes(first));
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

test("release frees the worktree for the next run", () => {
  const fx = fixture();
  try {
    const first = start(fx);
    cli(fx.store, ["release", "--run", first]);
    const second = start(fx);
    assert.notEqual(second, first);
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

test("resume refuses from the wrong branch", () => {
  const fx = fixture();
  try {
    const runId = start(fx);
    git(fx.repo, "checkout", "-q", "-b", "other");

    const out = cli(fx.store, ["resume", "--run", runId, "--tasks", "T-a", "--force"], {
      cwd: fx.repo,
      expectFail: true,
    });
    assert.match(out.error, /branch/i);
    assert.equal(out.name, "ResumeRefused");
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

test("due reports the backstop against the configured window", () => {
  const fx = fixture();
  try {
    const runId = start(fx);

    const fresh = cli(fx.store, ["due", "--run", runId]);
    assert.equal(fresh.due, false);
    assert.equal(fresh.backstop, 30);

    // A zero-minute window is due immediately — proves the flag is honored.
    assert.equal(cli(fx.store, ["due", "--run", runId, "--minutes", "0"]).due, true);
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

test("declined checkpoints are recorded with a rationale", () => {
  const fx = fixture();
  try {
    const runId = start(fx);
    const declined = cli(fx.store, [
      "checkpoint", "--run", runId, "--phase", "build",
      "--decline", "--rationale", "2 trivial tasks",
    ]);
    assert.equal(declined.taken, false);
    assert.equal(declined.sequence, 1);
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

test("a missing required flag fails with a usable message, not a stack trace", () => {
  const fx = fixture();
  try {
    const out = cli(fx.store, ["task", "--run", "nope"], { expectFail: true });
    assert.match(out.error, /missing required flag/);
    assert.match(out.error, /--task/);
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

test("an unknown command exits non-zero without touching the store", () => {
  const fx = fixture();
  try {
    const out = cli(fx.store, ["frobnicate"], { expectFail: true });
    assert.match(out.error, /unknown command/);
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

test("list reports runs newest first", () => {
  const fx = fixture();
  try {
    const first = start(fx);
    cli(fx.store, ["release", "--run", first]);
    const second = start(fx);

    const { runs } = cli(fx.store, ["list"]);
    assert.equal(runs.length, 2);
    assert.equal(runs[0].run_id, second);
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});
