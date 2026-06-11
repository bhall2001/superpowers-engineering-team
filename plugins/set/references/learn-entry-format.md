# Learning Entry Format

Each shard entry MUST be:
- **Dated**: `[YYYY-MM-DD]`
- **Specific**: reference actual files, functions, or error messages
- **Actionable**: future Claude should know what to DO differently

**Good entry:**
```
[2026-03-17] Shared field high-run exclusion via `grouping.py`: Pass `shared_field_numbers`
to `assign_grouped_game_groups()` and union with `time_limited_fields`. Simpler than modifying
`get_field_capacities()` — directly uses already-computed shared schedule info.
```

**Bad entry:**
```
[2026-03-17] Be careful with shared fields.
```
