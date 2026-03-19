# Specialist Agents

SET's domain specialist routing is one of its core differentiators. Instead of generic AI builders, tasks are matched to agents that have deep knowledge of their domain.

## How Agents Work

Agents are markdown files in `.claude/agents/`. Each file contains:
- Domain focus and responsibilities
- Stack-specific conventions
- Key files to know about
- Common patterns to follow
- Mistakes to avoid (populated by `/set-learn` over time)

During `/set-build`, the team lead reads each agent file and uses it as the base context for that specialist. Builders inherit domain knowledge without needing it repeated in every task.

## Scaffolded by `/set-init`

`/set-init` detects your tech stack and creates starter agents. For a TypeScript + PostgreSQL + React project, it might create:

- `db-drizzle.md` — Database queries, schema, migrations, RLS policies
- `react-ui.md` — React components, hooks, state management, MUI/Tailwind
- `api.md` — API routes, authentication, rate limiting, sync endpoints
- `qa.md` — Testing strategy, edge cases, security review
- `architect.md` — Cross-cutting concerns, patterns, dependencies

## Writing Your Own Agents

Create a file at `.claude/agents/{name}.md`:

```markdown
# Database Specialist (Drizzle + PostgreSQL)

## Domain
Server-side database layer: schema design, queries, migrations, RLS.

## Stack
- Drizzle ORM with PostgreSQL
- Database URL from environment: `DATABASE_URL`
- Migrations via custom scripts in `utility-scripts/`

## Key Files
- `src/db/schema.ts` — Table definitions
- `src/db/connection.ts` — Connection config (CRITICAL: never remove ssl)
- `src/db/index.ts` — Drizzle instance export

## Conventions
- Always enable RLS on new tables
- Use `prepare: false` on connections
- Never use raw SQL when Drizzle query builder works
- Migration pattern: custom script, not drizzle-kit (requires interactive input)

## Common Mistakes to Avoid
(populated by /set-learn over time)
```

## Task-to-Agent Matching

During `/set-plan`, each task is tagged with a specialist:

```markdown
## Task 3: Add results query with filters
Specialist: db-drizzle
```

During `/set-build`, the team lead routes the task to the matching agent.

**If a task spans multiple domains** (e.g., new API route + UI component), it's assigned to the primary domain specialist, with notes about conventions from the other domain.

**If no matching agent exists**, the task goes to a generic builder.

## The Learning Loop

`/set-learn` evaluates each agent's performance after every cycle:

- **QA rejections** — did this agent's output repeatedly fail spec compliance or quality checks?
- **Review findings** — did the security or architecture reviewer flag patterns this agent owns?
- **Ralph Loop struggles** — did this agent get stuck on the same errors repeatedly?
- **Scope violations** — did this agent add features not in the acceptance criteria?
- **Patterns done well** — what should this agent keep doing?

Based on this analysis, `/set-learn` proposes dated additions to each agent file. Example:

```markdown
## Common Mistakes to Avoid
[2025-06-15] Export endpoints need rate limiting — security review flagged this twice
[2025-06-22] Always add LIMIT/OFFSET for queries that could return >1000 rows
```

Over time, agents accumulate institutional knowledge from real cycle experience. An agent that made a mistake once won't make it again.

## Keeping Agents Project-Specific

Agent files are checked into your project's `.claude/agents/` directory, not SET itself. They evolve with your codebase and accumulate knowledge specific to your conventions, patterns, and past mistakes.

This is intentional: a React+Drizzle agent at Company A knows different things than a React+Prisma agent at Company B, even though they use the same agent framework.
