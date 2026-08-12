# Getting Started with SET

SET (Superpowers Engineering Team) turns Claude Code into a coordinated AI engineering team with TDD enforcement, spec-first discipline, and a self-improving learning loop.

## Prerequisites

### 1. Superpowers

SET requires the Superpowers Claude Code plugin:

```
/plugin marketplace add anthropics/claude-plugins-official
/plugin install superpowers@claude-plugins-official
```

### 2. Agent Teams

`/set-build` runs as a native Agent Team by default. Agent Teams are an experimental
Claude Code feature, so they must be enabled — the installer writes the
`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` env flag for you. A session restart is required
after it is first written, because the variable is read at session start.

### 3. Dynamic workflows

`/set-review`, and `/set-build --use-workflow`, run on Claude Code's dynamic workflows,
built into Claude Code (Pro/Max/Team/Enterprise) with nothing extra to install. Pro users
enable dynamic workflows once via `/config`; Max/Team/Enterprise have them on by default.
This is also the fallback `/set-build` offers if Agent Teams are unavailable.

## Install SET

SET is not in an official Claude marketplace. Install via the script:

```bash
curl -sL https://raw.githubusercontent.com/bhall2001/superpowers-engineering-team/main/install.sh | bash
```

The script registers the Superpowers marketplace and installs SET commands into `~/.claude/commands/`. It also writes the Agent Teams env flag, which the default `/set-build` path requires.

## First Use

### Step 1: Initialize your project (once per project)

Open your project in Claude Code and run:

```
/set-init
```

This will:
- Check prerequisites are installed
- Confirm the Agent Teams flag is set (required for the default `/set-build`) and that dynamic workflows are available
- Detect your tech stack
- Scaffold domain specialist agents in `.claude/agents/`
- Augment your `CLAUDE.md` with conventions
- Create required directories

### Step 2: Design a feature

```
/set-design Add user profile editing
```

Work through the Superpowers design process. Approve each section. The spec is saved to `docs/superpowers/specs/`.

### Step 3: Plan the work

```
/set-plan
```

Transposes your design spec into a parallelizable task plan with TDD steps, self-review checklists, and specialist agent tags.

### Step 4: Build it

```
/set-build
```

Compiles the plan into a build brief, then runs it as a native Agent Team by default: builder teammates fan out — one per task, routed by the task's specialist — alongside a dedicated verifier teammate per task that writes no code. Each builder runs the per-task TDD loop, and its verifier checks the work against a rubric (spec compliance + TDD + lint/typecheck) before folding it back. All work happens in an isolated git worktree.

To run the build as a dynamic workflow instead, use `/set-build --use-workflow`.

### Step 5: Review

```
/set-review
```

Four parallel reviewers cover spec compliance, security, architecture, and correctness. Offers merge/PR/keep/discard options.

### Step 6: Capture learnings

```
/set-learn
```

Updates `CLAUDE.md` with project-level learnings and evolves specialist agent definitions. Each cycle makes the next one smarter.

## Keep SET Updated

```
/set-update
```

Updates SET and Superpowers to the latest versions, and migrates project files from earlier SET versions.
