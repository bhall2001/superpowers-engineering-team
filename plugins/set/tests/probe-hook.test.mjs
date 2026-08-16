import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const PROBE = new URL("../hooks/set-probe.sh", import.meta.url).pathname;

function runProbe(payload, { agentName, log } = {}) {
  const env = { ...process.env, SET_PROBE_LOG: log };
  if (agentName === undefined) delete env.CLAUDE_CODE_AGENT_NAME;
  else env.CLAUDE_CODE_AGENT_NAME = agentName;

  const stdout = execFileSync(PROBE, {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    env,
  });
  return stdout;
}

function withLog(fn) {
  const dir = mkdtempSync(join(tmpdir(), "set-probe-"));
  try {
    return fn(join(dir, "log.txt"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("probe emits nothing on stdout — it must never gate a tool call", () => {
  withLog((log) => {
    const out = runProbe({ tool_name: "Bash", tool_input: { command: "true" } }, { log });
    assert.equal(out.trim(), "", "probe wrote to stdout; a decision could be parsed from it");
  });
});

test("probe exits 0 even on malformed input", () => {
  withLog((log) => {
    assert.doesNotThrow(() => runProbe("not json at all", { log }));
    assert.doesNotThrow(() => runProbe("", { log }));
  });
});

test("probe records the agent name when present, and its absence when not", () => {
  withLog((log) => {
    runProbe({ tool_name: "Bash", tool_input: { command: "true" } }, { log, agentName: "builder-set" });
    runProbe({ tool_name: "Bash", tool_input: { command: "true" } }, { log });

    const body = readFileSync(log, "utf8");
    assert.match(body, /AGENT_NAME=\[builder-set\]/);
    assert.match(body, /AGENT_NAME=\[UNSET\]/);
  });
});

test("probe records the full payload and its top-level keys", () => {
  withLog((log) => {
    runProbe({ tool_name: "Agent", tool_input: { name: "x-set", prompt: "hi" }, session_id: "s1" }, { log });

    const body = readFileSync(log, "utf8");
    assert.match(body, /"tool_name":"Agent"/);
    assert.match(body, /KEYS=/);
    assert.match(body, /session_id/, "top-level keys must be recorded for Q2");
  });
});

test("probe appends rather than truncating — the log is the progress marker", () => {
  withLog((log) => {
    for (let i = 0; i < 3; i++) {
      runProbe({ tool_name: "Bash", tool_input: { command: `echo ${i}` } }, { log });
    }
    const entries = readFileSync(log, "utf8").match(/^--- ENTRY/gm) ?? [];
    assert.equal(entries.length, 3, "each invocation must add exactly one labeled entry");
  });
});

test("probe creates its log directory if absent", () => {
  withLog((log) => {
    const nested = join(log, "..", "deep", "log.txt");
    runProbe({ tool_name: "Bash", tool_input: { command: "true" } }, { log: nested });
    assert.ok(existsSync(nested));
  });
});
