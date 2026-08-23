import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dbPath } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// スキーマを非互換に変更した際の復旧用。trueにすると既存の全データを削除して作り直す。
// 適用後は必ず削除するかfalseに戻すこと(ADMIN_FORCE_RESETと同様の運用)。
if (process.env.DB_RESET === "true") {
  db.exec("DROP TABLE IF EXISTS questions");
  db.exec("DROP TABLE IF EXISTS quizzes");
  db.exec("DROP TABLE IF EXISTS admins");
  console.log("DB_RESET=true: dropped all tables for schema migration");
}

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
db.exec(schema);

export function runInTransaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
