import { execFileSync } from "node:child_process";
import { canonicalPath } from "./run.mjs";
import { probeHolders } from "./claim.mjs";
import { resolveSkipSet } from "./skipset.mjs";

const ADVISORY_FILE_CAP = 200;

export class ResumeRefused extends Error {
  constructor(message, reason) {
    super(message);
    this.name = "ResumeRefused";
    this.reason = reason;
  }
}

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function currentBranch(cwd) {
  const branch = git(cwd, ["branch", "--show-current"]);
  return branch.length > 0 ? branch : null; // empty means detached HEAD
}

/**
 * Assert the session is standing where the run left off.
 *
 * Without this, a user who crashed, cd'd back to the main repo, and resumed
 * would get builders dispatched onto whatever branch they happen to be on.
 */
export function assertLocation(run, cwd) {
  let toplevel;
  try {
    toplevel = canonicalPath(git(cwd, ["rev-parse", "--show-toplevel"]));
  } catch {
    throw new ResumeRefused(`not inside a git repository: ${cwd}`, "not-a-repo");
  }

  if (toplevel !== canonicalPath(run.worktree_path)) {
    throw new ResumeRefused(
      `wrong worktree: run ${run.run_id} belongs to ${run.worktree_path}, but this is ${toplevel}`,
      "wrong-worktree",
    );
  }

  const branch = currentBranch(cwd);
  if (branch === null) {
    throw new ResumeRefused(
      `HEAD is detached (mid-rebase or bisect?). Check out ${run.branch} before resuming.`,
      "detached-head",
    );
  }
  if (branch !== run.branch) {
    throw new ResumeRefused(
      `wrong branch: run ${run.run_id} is on ${run.branch}, but ${branch} is checked out`,
      "wrong-branch",
    );
  }
}

/**
 * Files changed since the last checkpoint. Advisory only — it briefs
 * re-dispatched agents and never drives a skip decision.
 *
 * `git diff` alone misses newly created files, which is the common case for a
 * builder that added a module or a test and never committed.
 */
export function advisoryDiff(cwd, sinceSha) {
  const files = new Set();
  try {
    if (sinceSha) {
      for (const line of git(cwd, ["diff", "--name-only", sinceSha]).split("\n")) {
        if (line.trim()) files.add(line.trim());
      }
    }
    for (const line of git(cwd, ["ls-files", "--others", "--exclude-standard"]).split("\n")) {
      if (line.trim()) files.add(line.trim());
    }
  } catch (err) {
    // A crashed run may leave a huge untracked tree (an interrupted install is
    // the expected case). This briefing is advisory, so degrade rather than
    // take the whole resume down with it.
    return { checkpointSha: sinceSha, files: [], truncated: true, error: err.code ?? err.message };
  }

  // This briefing goes into an agent's prompt. 14k paths from an interrupted
  // install is not context, it is a denial of service on the context window.
  const sorted = [...files].sort();
  return {
    checkpointSha: sinceSha,
    files: sorted.slice(0, ADVISORY_FILE_CAP),
    total: sorted.length,
    truncated: sorted.length > ADVISORY_FILE_CAP,
  };
}

/**
 * Compute what a resume would do. Pure inspection — writes nothing, moves
 * nothing, and never touches the working tree.
 *
 * `force` skips the liveness refusal; the caller owns claiming the worktree.
 */
export function planResume(db, runId, { cwd, planTasks, force = false }) {
  const run = db.prepare("SELECT * FROM run WHERE run_id = ?").get(runId);
  if (!run) throw new ResumeRefused(`no such run: ${runId}`, "unknown-run");

  assertLocation(run, cwd);

  if (!force) {
    const live = probeHolders(db, run.worktree_path).filter(
      (holder) => !holder.dead && holder.runId !== runId,
    );
    if (live.length > 0) {
      throw new ResumeRefused(
        `worktree is held by live run ${live[0].runId}`,
        "worktree-held",
      );
    }
  }

  const { skip, checkpoints, reverted, rewritten } = resolveSkipSet(cwd, runId);

  const planned = new Set(planTasks);
  const redispatch = planTasks.filter((task) => !skip.has(task));
  const unknown = [...skip].filter((slug) => !planned.has(slug)).sort();

  const latest = checkpoints.length > 0 ? checkpoints[0].sha : null;

  return {
    run,
    skip,
    redispatch,
    unknown,
    reverted,
    rewritten,
    checkpoints,
    advisory: advisoryDiff(cwd, latest),
  };
}
