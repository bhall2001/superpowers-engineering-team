# Getting Started with SET

SET (Superpowers Engineering Team) turns Claude Code into a coordinated AI engineering team with TDD enforcement, spec-first discipline, and a self-improving learning loop.

## Prerequisites

SET requires two Claude Code plugins:

### 1. Superpowers

```
/plugin marketplace add anthropics/claude-plugins-official
/plugin install superpowers@claude-plugins-official
```

### 2. Compound Teams

```
/plugin marketplace add https://github.com/tbdng/compound-teams-plugin.git
/plugin install compound-teams@compound-teams-marketplace
```

### 3. Agent Teams (Experimental)

Compound Teams requires Claude Code's experimental Agent Teams feature. Run `/set-init` — it will check this and guide you through enabling it if needed.

## Install SET

### Option A: Script

```bash
curl -sL https://raw.githubusercontent.com/bhall2001/superpowers-engineering-team/main/install.sh | bash
```

### Option B: Plugin Marketplace

```
/plugin marketplace add bhall2001/superpowers-engineering-team
/plugin install superpowers-engineering-team
```

### Option C: Manual

Copy all files from `plugins/set/commands/` to `~/.claude/commands/`.

## First Use

### Step 1: Initialize your project (once per project)

Open your project in Claude Code and run:

```
/set-init
```

This will:
- Check prerequisites are installed
- Enable Agent Teams if needed
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

Spawns an Agent Team. Builders run TDD Ralph Loops. QA does two-stage review (spec compliance + code quality). All work happens in an isolated git worktree.

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

Updates SET, Superpowers, and Compound Teams to the latest versions.
