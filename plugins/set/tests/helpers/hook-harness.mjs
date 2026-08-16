import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Drive a hook exactly as Claude Code does: a subprocess, JSON on stdin, JSON on stdout.
 * Never throws on a non-zero exit — fail-closed paths must be assertable.
 *
 * @returns {{status: number, stdout: string, stderr: string, json: object|null}}
 */
export function runHook(script, payload, { env = {} } = {}) {
  const input = typeof payload === "string" ? payload : JSON.stringify(payload);
  const childEnv = { ...process.env, ...env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete childEnv[k];
  }

  try {
    const stdout = execFileSync(script, { input, encoding: "utf8", env: childEnv });
    return { status: 0, stdout, stderr: "", json: parse(stdout) };
  } catch (err) {
    return {
      status: err.status ?? 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      json: parse(err.stdout ?? ""),
    };
  }
}

function parse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** The `permissionDecision` a PreToolUse hook emitted, or null if it emitted none. */
export function decisionOf(result) {
  return result.json?.hookSpecificOutput?.permissionDecision ?? null;
}

export function reasonOf(result) {
  return result.json?.hookSpecificOutput?.permissionDecisionReason ?? "";
}

export function readSettings(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
