#!/usr/bin/env node
// SET hook registration. Merges SET's PreToolUse hook entries into a project's
// .claude/settings.json (append-only, idempotent) and removes only SET's entries.
//
//   set-hooks.mjs install   --settings <file> --hooks-dir <dir>
//   set-hooks.mjs uninstall --settings <file> --hooks-dir <dir>
//
// --hooks-dir is written into the settings file verbatim as the command-path prefix. Use
// the literal string `$HOME/.claude/set/hooks` (single-quoted in the shell), NOT the
// expanded absolute path: <repo>/.claude/settings.json is the shared, committed project
// file, and Claude Code runs hook commands through a shell, so `$HOME` resolves on every
// machine — the host, a devcontainer with ~/.claude bind-mounted at a different absolute
// path, a collaborator's checkout. An expanded `/Users/you/...` works only on the machine
// that wrote it; everywhere else the command is not found and the hook is silently absent.
// SET's target topology is autonomous teams in devcontainers, so portability is the
// default, not an option. An absolute path is still accepted (tests, unusual layouts).
//
// Every command prints JSON on stdout. Errors print JSON on stderr and exit non-zero.
//
// The rewriting is done by jq with the filter shape the design spec verified against
// the user's real settings (the 2026-08-16 SET Phase 1 design spec under
// docs/superpowers/specs/, Section 3 "Removal" + Section 4 "Shared mechanics"):
//
//   if (.hooks.PreToolUse | type) == "array" then (.hooks.PreToolUse) |= … else . end
//   … any(.hooks[]?; …) — never .hooks[0]
//
// The naive `(.hooks.PreToolUse? // []) |=` form errors on settings lacking the key.
// Do not "simplify" it back. Never assigns to `.hooks` wholesale; SessionStart and every
// non-SET PreToolUse entry pass through untouched. Only PreToolUse is registered.

import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// Matcher per script. deny-push gates Bash; guard-agent-name gates Agent spawns.
export const SET_HOOKS = [
  { script: "set-deny-push.sh", matcher: "Bash" },
  { script: "set-guard-agent-name.sh", matcher: "Agent" },
];
const TIMEOUT = 10;
export const DEFAULT_HOOKS_DIR = "$HOME/.claude/set/hooks";

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
  const missing = names.filter((name) => flags[name] === undefined || flags[name] === true);
  if (missing.length > 0) {
    throw new Error(`missing required flag${missing.length > 1 ? "s" : ""}: --${missing.join(", --")}`);
  }
}

function jq(filter, input, args = []) {
  try {
    return execFileSync("jq", ["--indent", "2", ...args, filter], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (err) {
    if (err.code === "ENOENT") throw new Error("jq is not installed; SET hooks need jq (the hooks themselves fail closed without it)");
    throw new Error((err.stderr || err.message).toString().trim().replace(/^jq: error \(at <stdin>:\d+\): /, ""));
  }
}

function readSettingsText(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "{}\n";
}

/** install.sh's `jq | tmp | mv` idiom: never a half-written settings file. */
function writeSettingsText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

/** Trailing-slash-normalized prefix, kept verbatim otherwise (no path.join — it would not
 *  touch `$HOME`, but the intent is "string prefix", not "filesystem path"). */
function prefixOf(hooksDir) {
  return hooksDir.endsWith("/") ? hooksDir : `${hooksDir}/`;
}

/** Portable across machines: `$HOME/...` (see header), `~/...`, or an absolute path. */
export function isPortableHooksDir(dir) {
  return dir.startsWith("$HOME/") || dir.startsWith("${HOME}/") || dir.startsWith("~/") || isAbsolute(dir);
}

function entryFor(hooksDir, { script, matcher }) {
  return { matcher, hooks: [{ type: "command", command: prefixOf(hooksDir) + script, timeout: TIMEOUT }] };
}

const HAS_COMMAND = `
  def has_command($cmd):
    (.hooks.PreToolUse | type) == "array"
    and any(.hooks.PreToolUse[]; any(.hooks[]?; .command == $cmd));
`;

// A PreToolUse that exists but is not an array is the user's malformed value; refuse to
// overwrite it rather than silently replacing it.
const APPEND = `${HAS_COMMAND}
  if has_command($entry.hooks[0].command) then .
  elif (.hooks.PreToolUse | type) == "array" then (.hooks.PreToolUse) |= (. + [$entry])
  elif (.hooks.PreToolUse | type) == "null" then .hooks.PreToolUse = [$entry]
  else error("hooks.PreToolUse exists but is not an array; fix it by hand before installing SET hooks")
  end`;

// The spec's verified removal filter, with the probe's test("set-probe") swapped for the
// hooks-dir prefix.
const REMOVE = `
  if (.hooks.PreToolUse | type) == "array"
  then (.hooks.PreToolUse) |= map(select(any(.hooks[]?; .command | startswith($prefix)) | not))
  else . end`;

const COUNT = `
  if (.hooks.PreToolUse | type) == "array"
  then [.hooks.PreToolUse[] | select(any(.hooks[]?; .command | startswith($prefix)))] | length
  else 0 end`;

export function install(settingsPath, hooksDir) {
  let text = readSettingsText(settingsPath);
  const installed = [];
  const skipped = [];
  for (const spec of SET_HOOKS) {
    const entry = entryFor(hooksDir, spec);
    const cmd = entry.hooks[0].command;
    const present = jq(HAS_COMMAND + " has_command($cmd)", text, ["--arg", "cmd", cmd]).trim() === "true";
    if (present) {
      skipped.push(cmd);
      continue;
    }
    text = jq(APPEND, text, ["--argjson", "entry", JSON.stringify(entry)]);
    installed.push(cmd);
  }
  if (installed.length > 0) writeSettingsText(settingsPath, text);
  return { settings: settingsPath, installed, skipped };
}

export function uninstall(settingsPath, hooksDir) {
  if (!existsSync(settingsPath)) return { settings: settingsPath, removed: 0 };
  const prefix = prefixOf(hooksDir);
  const text = readSettingsText(settingsPath);
  const removed = Number(jq(COUNT, text, ["--arg", "prefix", prefix]).trim());
  if (removed > 0) writeSettingsText(settingsPath, jq(REMOVE, text, ["--arg", "prefix", prefix]));
  return { settings: settingsPath, removed };
}

function main(argv) {
  const { command, flags } = parseArgs(argv);
  const usage = "usage: set-hooks.mjs install|uninstall --settings <file> --hooks-dir '$HOME/.claude/set/hooks'";
  if (!command || flags.help) throw new Error(usage);
  require_(flags, "settings", "hooks-dir");
  const hooksDir = flags["hooks-dir"];
  if (!isPortableHooksDir(hooksDir)) throw new Error(`--hooks-dir must be '$HOME/...', '~/...' or an absolute path (got ${hooksDir}); project settings reference the shared scripts by a path that resolves on every machine`);
  switch (command) {
    case "install":
      return install(flags.settings, hooksDir);
    case "uninstall":
      return uninstall(flags.settings, hooksDir);
    default:
      throw new Error(`unknown command: ${command}\n${usage}`);
  }
}

// Main guard that survives symlinks (dotfiles-managed ~/.claude) and spaces in the path:
// import.meta.url is the percent-encoded realpath, argv[1] is whatever was typed. Comparing
// them naively made the CLI a silent no-op — exit 0, no output, nothing written.
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    process.stdout.write(JSON.stringify(main(process.argv.slice(2))) + "\n");
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: err.message }) + "\n");
    process.exit(1);
  }
}
