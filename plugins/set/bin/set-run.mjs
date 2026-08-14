#!/usr/bin/env node
// Durable run store CLI. The orchestrator is a model driving a slash command:
// it cannot import these modules, only shell out. This is that entry point.
//
//   set-run.mjs init      --worktree <path> --branch <b> --plan <p> [--spec <s>] [--phase build] [--pid N]
//   set-run.mjs claim     --run <id> --worktree <path>
//   set-run.mjs task      --run <id> --task <slug> --status passed|failed [--note <text>]
//   set-run.mjs checkpoint --run <id> --phase <p> --reason phase-boundary|judgment|backstop
//                          [--rationale <why>] [--decline]
//   set-run.mjs resume    --run <id> --tasks <slug,slug,...>
//   set-run.mjs heartbeat --run <id>
//   set-run.mjs release   --run <id>
//   set-run.mjs list      [--json]
//   set-run.mjs due       --run <id>        # is a backstop checkpoint due?
//
// Every command prints JSON on stdout. Errors print JSON on stderr and exit non-zero.

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { openStore } from "./store.mjs";
import { initRun, heartbeat, listRuns } from "./run.mjs";
import { claimWorktree, probeHolders, releaseRun } from "./claim.mjs";
import {
  recordVerdict,
  markRunning,
  takeCheckpoint,
  declineCheckpoint,
  minutesSinceCheckpoint,
} from "./checkpoint.mjs";
import { planResume } from "./resume.mjs";

const DEFAULT_STORE = join(homedir(), ".claude", "set-runs", "runs.db");

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i++;
    }
  }
  return { command, flags };
}

function require_(flags, ...names) {
  const missing = names.filter((name) => flags[name] === undefined);
  if (missing.length > 0) {
    throw new Error(`missing required flag${missing.length > 1 ? "s" : ""}: --${missing.join(", --")}`);
  }
}

function openAt(flags) {
  const path = flags.store ?? process.env.SET_RUN_STORE ?? DEFAULT_STORE;
  mkdirSync(dirname(path), { recursive: true });
  return openStore(path);
}

const COMMANDS = {
  init(db, flags) {
    require_(flags, "worktree", "branch", "plan");
    const runId = initRun(db, {
      projectPath: flags.project ?? flags.worktree,
      worktreePath: flags.worktree,
      branch: flags.branch,
      planPath: flags.plan,
      specPath: flags.spec ?? null,
      entryPhase: flags.phase ?? "build",
      sessionPid: flags.pid ? Number.parseInt(flags.pid, 10) : process.pid,
    });
    return { run_id: runId };
  },

  claim(db, flags) {
    require_(flags, "run", "worktree");
    const dead = probeHolders(db, flags.worktree)
      .filter((holder) => holder.dead)
      .map((holder) => ({ runId: holder.runId, updatedAt: holder.updatedAt }));
    claimWorktree(db, { worktreePath: flags.worktree, runId: flags.run, deadRunIds: dead });
    return { claimed: flags.run, cleared: dead.map((d) => d.runId) };
  },

  task(db, flags) {
    require_(flags, "run", "task", "status");
    if (flags.status === "running") {
      markRunning(db, flags.run, flags.task);
      return { task: flags.task, status: "running" };
    }
    recordVerdict(
      db,
      flags.run,
      flags.task,
      { passed: flags.status === "passed" },
      { note: flags.note ?? null },
    );
    return { task: flags.task, status: flags.status };
  },

  checkpoint(db, flags) {
    require_(flags, "run", "phase");
    if (flags.decline) {
      require_(flags, "rationale");
      const declined = declineCheckpoint(db, flags.run, {
        phase: flags.phase,
        rationale: flags.rationale,
        reason: flags.reason ?? "judgment",
      });
      return { taken: false, sequence: declined.sequence };
    }
    const run = db.prepare("SELECT worktree_path FROM run WHERE run_id = ?").get(flags.run);
    if (!run) throw new Error(`no such run: ${flags.run}`);
    return takeCheckpoint(db, flags.run, {
      phase: flags.phase,
      reason: flags.reason ?? "judgment",
      rationale: flags.rationale ?? null,
      cwd: flags.cwd ?? run.worktree_path,
    });
  },

  due(db, flags) {
    require_(flags, "run");
    const limit = Number.parseFloat(flags.minutes ?? "30");
    const elapsed = minutesSinceCheckpoint(db, flags.run);
    return { minutes_since: Math.round(elapsed * 10) / 10, backstop: limit, due: elapsed >= limit };
  },

  resume(db, flags) {
    require_(flags, "run", "tasks");
    const planTasks = String(flags.tasks)
      .split(",")
      .map((slug) => slug.trim())
      .filter(Boolean);
    const run = db.prepare("SELECT worktree_path FROM run WHERE run_id = ?").get(flags.run);
    if (!run) throw new Error(`no such run: ${flags.run}`);

    const plan = planResume(db, flags.run, {
      cwd: flags.cwd ?? run.worktree_path,
      planTasks,
      force: Boolean(flags.force),
    });
    return {
      run_id: flags.run,
      durable: [...plan.skip].sort(),
      redispatch: plan.redispatch,
      unknown: plan.unknown,
      reverted: plan.reverted,
      rewritten: plan.rewritten,
      checkpoint_sha: plan.advisory.checkpointSha,
      dirty_files: plan.advisory.files,
    };
  },

  heartbeat(db, flags) {
    require_(flags, "run");
    heartbeat(db, flags.run);
    return { run_id: flags.run, ok: true };
  },

  release(db, flags) {
    require_(flags, "run");
    releaseRun(db, flags.run, flags.status ?? "complete");
    return { run_id: flags.run, status: flags.status ?? "complete" };
  },

  list(db) {
    return { runs: listRuns(db) };
  },
};

function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (!command || flags.help || command === "help") {
    process.stdout.write(`${import.meta.filename ?? "set-run.mjs"}: ${Object.keys(COMMANDS).join(", ")}\n`);
    process.exit(command ? 0 : 2);
  }

  const handler = COMMANDS[command];
  if (!handler) {
    process.stderr.write(JSON.stringify({ error: `unknown command: ${command}` }) + "\n");
    process.exit(2);
  }

  let db;
  try {
    db = openAt(flags);
    const result = handler(db, flags);
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: err.message, name: err.name }) + "\n");
    process.exitCode = 1;
  } finally {
    db?.close();
  }
}

main();
