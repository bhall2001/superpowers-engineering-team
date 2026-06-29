# Getting Started with SET

SET (Superpowers Engineering Team) turns Claude Code into a coordinated AI engineering team with TDD enforcement, spec-first discipline, and a self-improving learning loop.

## Prerequisites

### 1. Superpowers

SET requires the Superpowers Claude Code plugin:

```
/plugin marketplace add anthropics/claude-plugins-official
/plugin install superpowers@claude-plugins-official
```

### 2. Dynamic workflows

The default `/set-build` and `/set-review` paths run on Claude Code's dynamic workflows, which are built into Claude Code (Pro/Max/Team/Enterprise) — there is nothing extra to install. Pro users enable dynamic workflows once via `/config`; Max/Team/Enterprise have them on by default.

### 3. Agent Teams (optional)

The optional `/set-build --use-agent-team` mode runs an autonomous Agent Team and requires Claude Code's Agent Teams feature. The installer writes the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` env flag by default, so this is ready to go if you want it — you don't need it for the default dynamic-workflow path.

## Install SET

SET is not in an official Claude marketplace. Install via the script:

```bash
curl -sL https://raw.githubusercontent.com/bhall2001/superpowers-engineering-team/main/install.sh | bash
```

The script registers the Superpowers marketplace and installs SET commands into `~/.claude/commands/`. It also writes the Agent Teams env flag, which is only needed for the optional `/set-build --use-agent-team` mode — the default build path uses dynamic workflows and needs no flag.

## First Use

### Step 1: Initialize your project (once per project)

Open your project in Claude Code and run:

```
/set-init
```

This will:
- Check prerequisites are installed
- Confirm dynamic workflows are available (and the Agent Teams flag, if you plan to use `--use-agent-team`)
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

Compiles the plan into a build brief and fans out parallel builder subagents — one per task, routed by the task's specialist. Each builder runs the per-task TDD loop, and a fresh verifier checks each task against a rubric (spec compliance + TDD + lint/typecheck) before folding it back. All work happens in an isolated git worktree.

To run an autonomous Agent Team instead, use `/set-build --use-agent-team`.

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

Updates SET, Superpowers, and Serena to the latest versions.
