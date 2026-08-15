CREATE TABLE IF NOT EXISTS run (
  run_id        TEXT PRIMARY KEY,
  project_slug  TEXT NOT NULL,
  project_path  TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  branch        TEXT NOT NULL,
  plan_path     TEXT NOT NULL,
  spec_path     TEXT,
  entry_phase   TEXT NOT NULL,
  current_phase TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('running', 'crashed', 'complete')),
  session_pid   INTEGER,
  hostname      TEXT NOT NULL,
  started_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- One live run per worktree. Partial index, so crashed and complete runs
-- free the slot without being deleted.
CREATE UNIQUE INDEX IF NOT EXISTS one_live_run_per_worktree
  ON run (worktree_path) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS checkpoint (
  run_id     TEXT NOT NULL REFERENCES run (run_id),
  sequence   INTEGER NOT NULL,
  sha        TEXT,
  phase      TEXT NOT NULL,
  reason     TEXT NOT NULL CHECK (reason IN ('phase-boundary', 'judgment', 'backstop')),
  rationale  TEXT,
  taken      INTEGER NOT NULL CHECK (taken IN (0, 1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, sequence),
  CHECK (taken = 0 OR sha IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS task (
  run_id       TEXT NOT NULL REFERENCES run (run_id),
  task_id      TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('pending', 'running', 'passed', 'failed')),
  verdict_json TEXT,
  captured_seq INTEGER,
  attempts     INTEGER NOT NULL DEFAULT 0,
  note         TEXT,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (run_id, task_id)
);

-- No agent_log table: nothing writes one. An unused table in a v1 schema is a
-- migration liability, and the store holds mechanics, not aspirations. Add it
-- together with its writer if agents ever need to record their own progress.
