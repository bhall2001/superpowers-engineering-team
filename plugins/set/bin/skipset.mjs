import { execFileSync } from "node:child_process";

const FIELD = "\u0000";  // %x00
const RECORD = "\u0001"; // %x01

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

/**
 * Checkpoint commits for a run, newest first, read from the CURRENT branch.
 *
 * Trailer values come from %(trailers:key=…) — git's own trailer-block parser.
 * `git log --grep` matches the whole message, so a commit body quoting
 * "SET-Tasks: T-3" in prose would resolve as if it were a trailer.
 */
export function checkpointCommits(cwd, runId) {
  // Trailer separator is a comma, distinct from the NUL field delimiter — using
  // NUL for both makes field boundaries ambiguous when a key repeats.
  const format = [
    "%H",
    "%(trailers:key=SET-Run,valueonly,separator=%x2C)",
    "%(trailers:key=SET-Checkpoint,valueonly,separator=%x2C)",
    "%(trailers:key=SET-Tasks,valueonly,separator=%x2C)",
    "%b",
  ].join("%x00");

  let out;
  try {
    out = git(cwd, ["log", `--format=${format}%x01`, "HEAD"]);
  } catch {
    return []; // unborn branch / empty repo
  }

  return out
    .split(RECORD)
    .map((record) => record.replace(/^\n/, ""))
    .filter((record) => record.trim().length > 0)
    .map((record) => {
      const [sha, run, sequence, tasks, body = ""] = record.split(FIELD);
      return {
        sha: sha.trim(),
        run: run.trim(),
        sequence: Number.parseInt(sequence.trim(), 10),
        tasks: tasks
          .split(",")
          .map((slug) => slug.trim())
          .filter(Boolean),
        body,
      };
    })
    .filter((commit) => commit.run === runId && commit.tasks.length > 0);
}

/** Shas named by `This reverts commit <sha>.` anywhere on the branch. */
export function revertedShas(cwd) {
  let out;
  try {
    out = git(cwd, ["log", "--format=%H%x00%b%x01", "HEAD"]);
  } catch {
    return new Set();
  }

  const reverted = new Set();
  for (const record of out.split(RECORD)) {
    const [, body = ""] = record.replace(/^\n/, "").split(FIELD);
    for (const match of body.matchAll(/This reverts commit ([0-9a-f]{7,40})/g)) {
      reverted.add(match[1]);
    }
  }
  return reverted;
}

function isAncestor(cwd, sha) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", sha, "HEAD"], { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function expand(cwd, sha) {
  try {
    return git(cwd, ["rev-parse", sha]).trim();
  } catch {
    return sha;
  }
}

/**
 * Tasks durable for this run.
 *
 * Membership comes from trailers on the current branch, NOT from stored shas:
 * amend, rebase, and squash rewrite shas while preserving trailers, and premise
 * 4 hands commits to the human. A stale stored sha is advisory (`rewritten`),
 * never a refusal.
 *
 * A reverted checkpoint keeps its commit reachable and its trailer intact while
 * its work is gone from the tree, so reverted checkpoints are subtracted.
 */
export function resolveSkipSet(cwd, runId, { knownShas = [] } = {}) {
  const commits = checkpointCommits(cwd, runId);
  const reverted = revertedShas(cwd);

  const skip = new Set();
  const counted = [];
  const revertedCheckpoints = [];

  for (const commit of commits) {
    if (!isAncestor(cwd, commit.sha)) continue; // off this branch — abandoned run
    const wasReverted = [...reverted].some((short) => commit.sha.startsWith(short));
    if (wasReverted) {
      revertedCheckpoints.push(commit.sha);
      continue;
    }
    counted.push(commit);
    for (const slug of commit.tasks) skip.add(slug);
  }

  const live = new Set(counted.map((commit) => commit.sha));
  const rewritten = knownShas
    .map((sha) => expand(cwd, sha))
    .filter((sha) => !live.has(sha) && !revertedCheckpoints.includes(sha));

  return { skip, checkpoints: counted, reverted: revertedCheckpoints, rewritten };
}
