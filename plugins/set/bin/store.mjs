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

/**
 * Open the run store, applying the schema on first use.
 * Throws SchemaVersionError without writing when the store is newer than this code.
 */
export function openStore(path) {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
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
