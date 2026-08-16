import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO = new URL("../../..", import.meta.url).pathname;

/**
 * Files SET ships. Two exclusions, both deliberate:
 * - CHANGELOG.md is history, not a live reference.
 * - update.md's reconcile step must name the bookkeeping it deletes; it is checked
 *   separately below, where the mentions are required rather than forbidden.
 */
function shippedFiles() {
  const out = [join(REPO, "install.sh"), join(REPO, "CLAUDE.md"), join(REPO, "README.md")];
  for (const sub of ["commands", "references"]) {
    const dir = join(REPO, "plugins/set", sub);
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".md") && f !== "update.md") out.push(join(dir, f));
    }
  }
  return out;
}

function countMatches(file, re) {
  const lines = readFileSync(file, "utf8").split("\n");
  return lines.filter((l) => re.test(l)).length;
}

test("no shipped file mentions serena", () => {
  const offenders = shippedFiles()
    .map((f) => [f.replace(REPO, ""), countMatches(f, /serena/i)])
    .filter(([, n]) => n > 0);

  assert.deepEqual(
    offenders,
    [],
    `serena still referenced in:\n${offenders.map(([f, n]) => `  ${f}: ${n}`).join("\n")}`,
  );
});

test("no shipped file references serena bookkeeping keys", () => {
  const offenders = shippedFiles()
    .map((f) => [f.replace(REPO, ""), countMatches(f, /serena_enabled|\.serena-migrated/)])
    .filter(([, n]) => n > 0);

  assert.deepEqual(offenders, [], `bookkeeping keys still referenced in:\n${offenders.join("\n")}`);
});

test("build.md A2 retrieval has no conditional branch", () => {
  const body = readFileSync(join(REPO, "plugins/set/commands/build.md"), "utf8");
  const a2 = body.slice(body.indexOf("### A2:"), body.indexOf("### A3:"));

  assert.ok(a2.length > 0, "A2 section not found");
  assert.doesNotMatch(a2, /serena/i, "A2 still mentions serena");
  assert.doesNotMatch(a2, /^\*\*Otherwise\b/im, "A2 still reads as one arm of a deleted branch");
});

test("CHANGELOG.md is left alone", () => {
  const n = countMatches(join(REPO, "CHANGELOG.md"), /serena/i);
  assert.ok(n > 0, "CHANGELOG should retain its historical serena mentions");
});

test("update.md mentions serena only to clean it up", () => {
  const body = readFileSync(join(REPO, "plugins/set/commands/update.md"), "utf8");

  assert.match(body, /del\(\.serena_enabled\)/, "must delete the serena_enabled key");
  assert.match(body, /rm -f \.claude\/set\/\.serena-migrated/, "must delete the sentinel");
  assert.match(body, /left untouched/, "must state that .serena/memories/ is left alone");

  // The removed integrations must not creep back in.
  assert.doesNotMatch(body, /plugin install serena/, "must not install serena");
  assert.doesNotMatch(body, /del\(\.mcpServers\.serena\)/, "must not edit the user's MCP config");
  assert.doesNotMatch(body, /rm .*\.serena\/memories|del\(\.serena\)/, "must not touch Serena's own data");
});
