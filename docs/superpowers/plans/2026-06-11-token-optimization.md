# SET Token Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce per-invocation token cost by 30–40% by making Serena a hard requirement, rewriting agents to use Serena for targeted context loading, and stripping explanatory prose from all command files.

**Architecture:** Serena becomes a required install-time dependency (no more lazy detection branching). Commands are rewritten with terse directives. Build/review/learn agents load context via Serena symbolic tools instead of whole-file reads. Shard files remain the canonical store; Serena memories are the index used at runtime.

**Tech Stack:** Bash (install.sh), Markdown (command specs), jq (JSON editing in install.sh), Serena MCP tools (`mcp__serena__*`)

---

## File Map

| File | Change |
|------|--------|
| `install.sh` | Add Serena install + settings.json entry |
| `plugins/set/commands/init.md` | Remove Serena detection (Steps 3a–3c), add hard Serena check, make `.serena/project.yml` unconditional, prose reduction |
| `plugins/set/commands/build.md` | Remove Step 0 Serena detection, replace shard file-reads with Serena memory queries, prose reduction |
| `plugins/set/commands/review.md` | Replace shard file-reads with Serena memory queries, prose reduction |
| `plugins/set/commands/learn.md` | Remove Step 0 Serena detection, make Serena mirror unconditional, add shard migration logic, prose reduction |

---

## Task 1: Update install.sh — Serena as hard requirement

**Files:**
- Modify: `install.sh`

- [ ] **Step 1: Read install.sh to understand current structure**

```bash
cat -n install.sh | head -80
```

Find where plugin checks happen and where `settings.json` is written. Note line numbers.

- [ ] **Step 2: Add uv check near the top of install.sh (after existing prereq checks)**

Locate the section that checks for dependencies (search for `command -v` patterns). After the last existing check, add:

```bash
# Check for uv (required for Serena)
if ! command -v uv &>/dev/null; then
  echo "❌ uv is required to install Serena. Install it from https://docs.astral.sh/uv/ then re-run install.sh"
  exit 1
fi
```

- [ ] **Step 3: Add Serena install step after uv check**

```bash
# Install Serena MCP server
echo "→ Installing Serena MCP server..."
if command -v serena &>/dev/null; then
  echo "  ✓ Serena already installed"
else
  if uv tool install serena-agent; then
    echo "  ✓ Serena installed"
  else
    echo "❌ Failed to install serena-agent. Ensure Python 3.11+ is available and retry."
    exit 1
  fi
fi
```

- [ ] **Step 4: Detect serena binary path and write mcpServers entry to ~/.claude/settings.json**

After the Serena install step, add:

```bash
# Write Serena MCP entry to ~/.claude/settings.json
SERENA_BIN="$(command -v serena)"
SETTINGS_FILE="$HOME/.claude/settings.json"

if [ ! -f "$SETTINGS_FILE" ]; then
  echo "{}" > "$SETTINGS_FILE"
fi

# Check if serena entry already exists
if jq -e '.mcpServers.serena' "$SETTINGS_FILE" &>/dev/null; then
  echo "  ✓ Serena already in settings.json"
else
  TMP=$(mktemp)
  jq --arg bin "$SERENA_BIN" \
    '.mcpServers.serena = {"command": $bin, "args": ["start-mcp-server", "--context=claude-code"]}' \
    "$SETTINGS_FILE" > "$TMP" && mv "$TMP" "$SETTINGS_FILE"
  echo "  ✓ Serena written to ~/.claude/settings.json"
fi
```

- [ ] **Step 5: Update install summary output to include Serena status**

Find the final summary `echo` block. Add a line:

```bash
echo "  Serena MCP:    ✓ installed and configured"
```

- [ ] **Step 6: Run install.sh to verify it succeeds without errors**

```bash
bash install.sh 2>&1 | tail -20
```

Expected: no errors, Serena lines appear in output.

- [ ] **Step 7: Commit**

```bash
git add install.sh
git commit -m "feat: make Serena a hard requirement in install.sh"
```

---

## Task 2: Rewrite init.md — remove Serena detection, add hard check

**Files:**
- Modify: `plugins/set/commands/init.md`

- [ ] **Step 1: Replace Step 3 (Serena detection) with hard Serena check**

Remove the current Step 3 (lines 54–92 of init.md: "Detect Serena MCP", 3a/3b/3c). Replace with:

```markdown
## Step 3: Verify Serena MCP

Serena is required. Verify it is available:

1. Check that `mcp__serena__initial_instructions` (or any `mcp__serena__*` tool) is listed in available tools.
2. If NOT available: print the following and stop:
   > "Serena MCP is required by SET. Run `bash install.sh` from the SET repository to install it, then restart Claude Code and try again."
3. If available: initialize `.serena/project.yml` for this project (create `.serena/` if it doesn't exist):
   ```yaml
   project_name: "{project-name-from-git-or-dirname}"
   languages: []  # user should fill in their primary languages
   ignore_all_files_in_gitignore: true
   ```
   Show the user the file before writing. Get confirmation.
```

- [ ] **Step 2: Remove config.json serena_enabled references from init.md**

Find and remove any line that writes `serena_enabled` to `.claude/set/config.json`. Serena is always enabled now — no config key needed.

Update Step 8 directory structure: remove `.claude/set/config.json` from the files created list in the summary.

- [ ] **Step 3: Update Step 9 summary block**

Replace:
```
Serena MCP: [enabled / disabled / not detected]
```
With:
```
Serena MCP: ✓ required and verified
```

Remove the line:
```
  .claude/set/config.json         — SET config (includes serena_enabled)
```

- [ ] **Step 4: Tighten prose — reduce explanatory paragraphs to directives**

Apply these specific rewrites:

- Opening paragraph (lines 7–9): cut to one line: `Initialize this project for the SET workflow.`
- Step 1 intro sentence: cut "Verify both required plugins are installed:" → keep as-is (already terse)
- Step 2 intro: "Before changing anything, understand what exists:" → cut entirely, keep the bash block
- Step 6 intro paragraphs: cut "**NEVER overwrite existing CLAUDE.md.** Check if SET sections already exist." down to: `Append missing sections only. NEVER overwrite.`
- Step 7 intro (lines 188–196): cut the explanation paragraph, keep the table and sub-steps
- "Why This Matters" / rationale paragraphs: remove any paragraph explaining WHY a step exists — keep only WHAT to do

Target: reduce init.md from 319 lines to ~190 lines.

- [ ] **Step 5: Verify no remaining references to `serena_enabled` or `config.json`**

```bash
grep -n "serena_enabled\|config\.json" plugins/set/commands/init.md
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add plugins/set/commands/init.md
git commit -m "feat: Serena hard required in /set-init, remove lazy detection"
```

---

## Task 3: Rewrite build.md — remove Serena detection, Serena-first context loading

**Files:**
- Modify: `plugins/set/commands/build.md`

- [ ] **Step 1: Remove Step 0 "Resolve Serena State (Lazy Detection)" entirely (lines 11–25)**

Delete the entire "### 0. Resolve Serena State (Lazy Detection)" block. The next section becomes the first thing after "## Before Starting".

- [ ] **Step 2: Remove config.json check in "Subsequent Steps" (line 32)**

Remove:
```
4. Read `.claude/set/config.json` to determine if Serena is enabled (`serena_enabled`). Read `.claude/set/taxonomy.md`...
```

Replace with:
```
4. Use `mcp__serena__list_memories` to discover available domain shards. Read `.claude/set/taxonomy.md` to confirm domain names.
```

- [ ] **Step 3: Rewrite Step 3b — make Serena query unconditional**

Replace the current Step 3b (lines 135–143):

```markdown
### 3b: Query Serena for relevant memories

Use Serena to fetch memories relevant to this task:

- Tool: `mcp__serena__find_referencing_symbols` or `mcp__serena__read_memory`
- Query signal: the task's `What` + `Done when` text
- Cap results at top 5 by relevance
- Dedupe against shard domains already loaded in 3a
```

Remove the "If `serena_enabled: true`" conditional wrapper and the fallback "If Serena call fails" note.

- [ ] **Step 4: Rewrite builder prompt — replace shard file-read instruction with Serena memory read**

In the Enhanced Builder Prompt (around line 220), replace:

```
The task description already includes the relevant learning shards ("Relevant Learnings" section) and any Serena matches — apply them before coding. Do NOT load `.claude/set/learnings/*.md` yourself; the team lead scoped them to this task.
```

With:

```
The task description includes "Relevant Learnings" — apply them. If you need additional domain context, use `mcp__serena__list_memories` and `mcp__serena__read_memory`. Do NOT read `.claude/set/learnings/*.md` files directly.
```

- [ ] **Step 5: Rewrite QA prompt — replace shard file-reads with Serena**

In the Enhanced QA Prompt (around line 273), replace:

```
- For each task you review: the shards referenced in the task's `Shards` field (read `.claude/set/learnings/{domain}.md`) — you need these to verify compliance with accumulated patterns
```

With:

```
- Use `mcp__serena__list_memories` to find domain shards relevant to the task under review. Use `mcp__serena__read_memory` to fetch them.
```

- [ ] **Step 6: Prose reduction — tighten all explanatory paragraphs**

Apply these cuts:

- "## Resolve Worktree Mode" intro paragraph: cut to terse directive
- Step 1 sub-steps intro sentences: cut any sentence that restates what the bash block already says
- "### Using Project Agents" explanation paragraphs: reduce to the table + sub-steps only
- "### Team Scaling" intro: already terse, keep as-is
- Step 5 bullet list: already terse, keep as-is

Target: reduce build.md from 351 lines to ~200 lines.

- [ ] **Step 7: Verify no remaining references to `serena_enabled` or `config.json`**

```bash
grep -n "serena_enabled\|config\.json" plugins/set/commands/build.md
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add plugins/set/commands/build.md
git commit -m "feat: Serena-first context in /set-build, remove lazy detection"
```

---

## Task 4: Rewrite review.md — replace shard file-reads with Serena

**Files:**
- Modify: `plugins/set/commands/review.md`

- [ ] **Step 1: Update Spec Compliance Reviewer prompt — replace shard file-read with Serena**

Replace (lines 40–42):

```
- `.claude/set/taxonomy.md` (if it exists) and relevant shards under `.claude/set/learnings/` — prior patterns and failures that may indicate risk areas. Load shards whose domain intersects with the diff's scope.
```

With:

```
- Use `mcp__serena__list_memories` to find domain shards relevant to the diff scope. Use `mcp__serena__read_memory` to fetch them.
```

- [ ] **Step 2: Update Security Reviewer prompt — replace shard file-reads with Serena**

Replace (lines 63–64):

```
READ FIRST: scan `.claude/set/learnings/*.md` — especially any security / validation / auth related shards — for "Recurring Bugs" patterns previously documented. Legacy `.claude/set/learnings.md` if present.
```

With:

```
READ FIRST: use `mcp__serena__list_memories` filtered to security/validation/auth domains. Use `mcp__serena__read_memory` to fetch "Recurring Bugs" sections.
```

- [ ] **Step 3: Update Architecture Reviewer prompt — replace shard file-reads with Serena**

Replace (lines 74–75):

```
Read CLAUDE.md first for project conventions, and the shards under `.claude/set/learnings/` whose domains intersect the diff (use `.claude/set/taxonomy.md` as the index) for accumulated "What Works" / "What Failed" patterns.
```

With:

```
Read CLAUDE.md for conventions. Use `mcp__serena__list_memories` to find shards intersecting the diff. Use `mcp__serena__read_memory` to fetch "What Works" / "What Failed" sections.
```

- [ ] **Step 4: Update Correctness Reviewer prompt — replace shard file-reads with Serena**

Replace (lines 87–88):

```
READ FIRST: the shards under `.claude/set/learnings/` whose domains intersect the diff — "Recurring Bugs" sections list prior error patterns worth verifying against.
```

With:

```
READ FIRST: use `mcp__serena__list_memories` to find shards intersecting the diff. Fetch "Recurring Bugs" sections via `mcp__serena__read_memory`.
```

- [ ] **Step 5: Prose reduction**

- Remove the "Final review of all changes from the build phase. Combines Compound Teams' multi-perspective review with Superpowers' spec compliance discipline." opening paragraph — the frontmatter description already says this.
- Tighten Step 3 synthesis template intro sentences.

Target: reduce review.md from 137 lines to ~90 lines.

- [ ] **Step 6: Commit**

```bash
git add plugins/set/commands/review.md
git commit -m "feat: Serena-first context in /set-review reviewer prompts"
```

---

## Task 5: Rewrite learn.md — remove Serena detection, make mirror unconditional, add shard migration to Serena

**Files:**
- Modify: `plugins/set/commands/learn.md`

- [ ] **Step 1: Remove Step 0 "Resolve Serena State (Lazy Detection)" entirely (lines 19–33)**

Delete the entire "### 0. Resolve Serena State (Lazy Detection)" block.

- [ ] **Step 2: Make Step 3f unconditional (remove `if serena_enabled` check)**

Replace the current Step 3f (lines 174–191):

```markdown
#### 3f: Mirror to Serena memories

For each new learning, write a Serena memory using `mcp__serena__write_memory`:
- Name/slug: short kebab-case from the learning's key concept (e.g. `shared-field-high-run-exclusion`)
- Frontmatter:
  ```
  domains: [{domain1}, {domain2}]
  date: {YYYY-MM-DD}
  source: .claude/set/learnings/{domain1}.md
  ```
- Body: the full learning text

Cross-domain learnings get ONE memory with multiple `domains:` tags. Shards remain the source of truth; Serena is the runtime index.
```

Remove the "Read `.claude/set/config.json`" check and all conditional wrapping.

- [ ] **Step 3: Add shard migration step at start of Step 3 (lazy migration for existing users)**

After Step 3's intro line, add a new sub-step 3a (shifting existing 3a→3b, etc.):

```markdown
#### 3a: Migrate existing shards to Serena memories (one-time, lazy)

Before writing new learnings, check whether existing shard files have already been mirrored to Serena:

1. Run `mcp__serena__list_memories` — get the list of existing memory slugs.
2. For each `.md` file in `.claude/set/learnings/`:
   - Derive expected slugs from the file's entries (kebab-case key concept).
   - If a slug is NOT in the Serena memory list, write it using `mcp__serena__write_memory`.
3. Log: "Migrated N existing shard entries to Serena memories." (or "Serena memories already up to date.")

This runs silently on every `/set-learn` invocation — it is a no-op once all shards are mirrored.
```

- [ ] **Step 4: Update Step 1 "Gather Context" — replace full file reads with Serena where possible**

Replace:
```bash
# Current CLAUDE.md
cat CLAUDE.md
```
With a note to read CLAUDE.md normally (it's auto-loaded, no bash read needed).

Replace "Also read: The design spec (if one exists)... The plan (if one exists)..." with:

```
Use `git diff HEAD~{N}..HEAD` scoped to this cycle's commits (not full history). Read the most recent spec from `docs/superpowers/specs/` and plan from `.claude/plans/` by name — do not cat every file.
```

- [ ] **Step 5: Prose reduction — cut "Why This Phase Matters" section entirely**

Remove lines 283–291 ("## Why This Phase Matters" block). This rationale belongs in the spec, not the runtime prompt.

Also cut the opening motivational paragraph (lines 7–10) — replace with one line: `Extract and persist learnings from the most recent SET cycle.`

- [ ] **Step 6: Remove all remaining `serena_enabled` / `config.json` references**

```bash
grep -n "serena_enabled\|config\.json" plugins/set/commands/learn.md
```

Expected: no output. Fix any remaining occurrences.

- [ ] **Step 7: Verify no remaining `serena_enabled` / `config.json` across all commands**

```bash
grep -rn "serena_enabled\|config\.json" plugins/set/commands/
```

Expected: no output.

Target: reduce learn.md from 290 lines to ~160 lines.

- [ ] **Step 8: Commit**

```bash
git add plugins/set/commands/learn.md
git commit -m "feat: Serena-first in /set-learn, unconditional mirror, lazy migration"
```

---

## Task 6: Update CLAUDE.md — add shared definitions, remove them from commands

**Files:**
- Modify: `plugins/set/commands/plan.md` (minor)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add shared definitions section to project CLAUDE.md**

Append to `/Users/bobhall/develop/superpowers-engineering-team/CLAUDE.md`:

```markdown

## SET Shared Definitions

**Shard format:** `.claude/set/learnings/{domain}.md` — frontmatter with `domain:` + `description:`, then `## What Works` / `## What Failed` / `## Recurring Bugs` sections. Each entry dated `[YYYY-MM-DD]`.

**Taxonomy:** `.claude/set/taxonomy.md` — one line per domain: `- name: short description`. Free-form, project-specific names.

**Serena memories:** Runtime index of shard entries. Slugs are kebab-case key concepts. Frontmatter includes `domains:`, `date:`, `source:` fields. Written/read via `mcp__serena__*` tools.

**Pipeline:** `/set-init` → `/set-design` → `/set-plan` → `/set-build` → `/set-review` → `/set-learn`
```

- [ ] **Step 2: Remove redundant shard/taxonomy definitions from plan.md**

In `plugins/set/commands/plan.md`, find any block that explains the shard format or taxonomy structure (the "what is a shard" explanation). Replace with: `(Shard format and taxonomy defined in CLAUDE.md.)`

```bash
grep -n "shard\|taxonomy\|learnings\/" plugins/set/commands/plan.md | head -20
```

Review output and remove explanatory prose that duplicates what's now in CLAUDE.md.

- [ ] **Step 3: Update Ralph Loop references in init.md and plan.md**

In `plugins/set/commands/init.md`, the Ralph Loop is written out in full in Step 6's CLAUDE.md append block. That's correct — it lives in CLAUDE.md. Verify it's not duplicated elsewhere in init.md.

In `plugins/set/commands/plan.md`, find any full Ralph Loop restatement. Replace with: `Builders follow the Ralph Loop defined in CLAUDE.md under SET Workflow.`

```bash
grep -n "Ralph Loop\|TDD Steps\|red phase\|green phase" plugins/set/commands/plan.md
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md plugins/set/commands/plan.md plugins/set/commands/init.md
git commit -m "chore: consolidate shared SET definitions into CLAUDE.md"
```

---

## Task 7: End-to-end verification

**Files:** None modified

- [ ] **Step 1: Verify no Serena detection code remains in any command**

```bash
grep -rn "serena_enabled\|Lazy Detection\|grep.*serena\|ls .serena" plugins/set/commands/
```

Expected: no output.

- [ ] **Step 2: Verify no config.json serena references remain**

```bash
grep -rn "config\.json" plugins/set/commands/
```

Expected: no output (or only the Step 8 directory structure line in init.md if kept).

- [ ] **Step 3: Count lines — verify targets met**

```bash
wc -l plugins/set/commands/build.md plugins/set/commands/learn.md plugins/set/commands/review.md plugins/set/commands/init.md
```

Expected:
- build.md: ≤210 lines
- learn.md: ≤170 lines
- review.md: ≤95 lines
- init.md: ≤200 lines

- [ ] **Step 4: Run install.sh and verify Serena setup**

```bash
bash install.sh 2>&1 | grep -E "Serena|serena|✓|❌"
```

Expected: Serena lines present, no `❌` errors.

- [ ] **Step 5: Verify settings.json has Serena entry**

```bash
jq '.mcpServers.serena' ~/.claude/settings.json
```

Expected: object with `command` and `args` fields.

- [ ] **Step 6: Final commit — bump plugin version**

```bash
# Read current version
cat plugins/set/.claude-plugin/plugin.json | jq '.version'
```

Update the patch version (e.g., `1.0.0` → `1.1.0`) in `plugins/set/.claude-plugin/plugin.json`.

```bash
git add plugins/set/.claude-plugin/plugin.json
git commit -m "chore: bump version for token optimization release"
```

---

## Unresolved Questions

None — all open questions from spec resolved before plan was written.
