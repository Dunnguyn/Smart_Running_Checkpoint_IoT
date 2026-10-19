import { openDatabaseSync } from "expo-sqlite";
import type { Store } from "./port";
const db = openDatabaseSync("neu-run-student.db");
db.execSync(
  "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)",
);
export const store: Store = {
  read<T>(key: string) {
    const row = db.getFirstSync<{ value: string }>(
      "SELECT value FROM kv WHERE key=?",
      key,
    );
    return row ? (JSON.parse(row.value) as T) : undefined;
  },
  write(key, value) {
    db.runSync(
      "INSERT OR REPLACE INTO kv(key,value) VALUES (?,?)",
      key,
      JSON.stringify(value),
    );
  },
  remove(key) {
    db.runSync("DELETE FROM kv WHERE key=?", key);
  },
};
