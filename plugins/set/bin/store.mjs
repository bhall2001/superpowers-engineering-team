import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SCHEMA_VERSION = 1;

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), "schema.sql");

export class SchemaVersionError extends Error {
  constructor(found) {
    super(
      `run store schema is version ${found}, this SET understands ${SCHEMA_VERSION}. ` +
        `Update SET, or point at a different store.`,
    );
    this.name = "SchemaVersionError";
    this.found = found;
  }
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function openOnce(path) {
  const db = new DatabaseSync(path);
  // busy_timeout FIRST: the WAL switch takes an exclusive lock, and with the
  // timeout still at 0 a concurrent open fails instantly instead of waiting.
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");

  const found = db.prepare("PRAGMA user_version").get().user_version;
  if (found > SCHEMA_VERSION) {
    db.close();
    throw new SchemaVersionError(found);
  }

  db.exec(readFileSync(SCHEMA_PATH, "utf8"));
  if (found < SCHEMA_VERSION) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);

  return db;
}

/**
 * Open the run store, applying the schema on first use.
 * Throws SchemaVersionError without writing when the store is newer than this code.
 *
 * Retries on `database is locked`: several agents opening a not-yet-created
 * store race to create the file and apply the schema, and that contention is
 * not covered by busy_timeout. Transient by definition — the loser just needs
 * the winner to finish.
 */
export function openStore(path, { attempts = 6 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return openOnce(path);
    } catch (err) {
      const transient = /database is locked|database schema is locked/i.test(err.message ?? "");
      if (!transient || attempt >= attempts) throw err;
      sleepMs(25 * attempt);
    }
  }
}
