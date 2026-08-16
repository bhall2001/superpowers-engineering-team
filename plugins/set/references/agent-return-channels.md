# Agent Return Channels

Cited by `/set-build` and `/set-review`. How a spawned agent's output reaches the
orchestrator — and the one calling mistake that silently discards it.

## The rule

**Name an agent only when you intend to `SendMessage` it. Never name one whose result you
need.**

The `Agent` tool has two return modes, selected by the presence of `name`:

| Spawn | Tool result | Use for |
|---|---|---|
| no `name` | the agent's final message | one-shot workers: verifiers, review lenses, fix agents |
| `name: "x"` | `Spawned successfully … will receive instructions via mailbox` | long-lived teammates you message and track |

A named spawn's work product **never appears in the tool result**. The receipt is not a
truncation or a delay — the value is not delivered through that channel at all.

## The `-set` suffix on named spawns

Every SET-spawned **named** agent carries a `-set` name suffix — `build.md` T2 spawns
`odm-db-drizzle-set`, not `odm-db-drizzle`. Verifiers stay unnamed, per the rule above.
`[SET]` cannot be used: the `name` pattern (`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`) excludes
brackets. The suffix does not disturb `subagent_type` routing (probe-verified).

Why: it is a marker SET **controls** rather than observes. Hook subprocesses never see
`$CLAUDE_CODE_AGENT_NAME`; what a PreToolUse payload does carry is `agent_type`, which for
a named spawn is the `name` verbatim. So `-set` makes "this is a SET teammate" structural
in hook payloads, transcripts and logs — useful during autonomous-run review.

**Polarity — read this twice.** The marker is **corroborating evidence for a denial, never
the trigger for one**. A hook that denied only on seeing `-set` would allow everything
unmarked: any non-SET agent, any truncated name, any future spawn path that forgets the
convention. That is fail-open on a push gate. **The absence of the marker never implies
permission.** SET's push gate keys on the presence of *any* agent identity in the payload
(`agent_id` / `agent_type`), and on the payload's shape; unknown identity denies.

## Why a named result is unrecoverable

There is no supported retrieval path:

- `TaskOutput` is **documented as deprecated for agent tasks**, which say to use the
  `Agent` tool result directly.
- Its `.output` file is a symlink to the full subagent transcript (JSONL). Reading it
  overflows the orchestrator's context — the tool's own description warns against this.
- `SendMessage` can ask the agent to repeat itself, but that is an async round-trip that
  resumes the agent from its transcript: an extra turn and a second billing of its
  context, to retrieve something an unnamed spawn returns instantly.

So the cost of naming a one-shot agent is not "slightly slower" — it is the entire result,
or an expensive recovery that may still not arrive.

## How to tell this happened

The tool result begins:

```
Spawned successfully. (This tool result is internal metadata — never quote or paste …)
agent_id: {name}@session-{id}
name: {name}
The agent is now running and will receive instructions via mailbox.
```

If you are waiting on findings or a verdict and see that, stop waiting. Re-spawn unnamed.

**Do not misread it as a stalled or failed agent.** The agent very likely completed its
work correctly; only the delivery was misrouted. Retrying with a sterner prompt, extending
a poll timeout, or marking the lens `FAILED` all treat a caller defect as an agent defect
and none of them fix it.

## Which path this governs

This rule binds the **Agent Team path only** — `/set-build` Phase B-team and `/set-review`
`--light`, both of which call the `Agent` tool directly.

The **workflow path is unaffected and was never broken.** `agent(prompt, {schema})` forces
a `StructuredOutput` tool call and returns a validated object; there is no `name` parameter
to get wrong. A `--use-workflow` build or a default `/set-review` fan-out therefore does
**not** exercise this fix — a green run on those paths says nothing about it either way.

Consequence when reading a report: "the lenses all returned" is evidence only when you
know which path produced it. A run that fell back to the workflow path (see the Agent Team
Availability Gate in `build.md`) proves nothing about the Agent Team path's return channel,
and must not be cited as validating it.

## Corroborating channel

Builders commit atomically, so git independently records what a teammate accomplished.
When a return is missing, `git log` on the build branch answers "did the work land?" even
when the agent's own report did not arrive. Prefer deriving state from the repository over
trusting an agent's claim — the same principle the checkpoint design applies to resume.
