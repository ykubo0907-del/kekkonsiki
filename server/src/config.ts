import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, ".."); // src/.. または dist/.. → server/

// Railwayなどでは永続ボリュームのマウント先(例: /data)をDB_PATH/UPLOADS_DIRで指定する。
// 未指定時はローカル開発用にserver配下を使う。
export const dbPath = process.env.DB_PATH ?? path.join(serverRoot, "data", "quiz.db");
export const uploadsDir = process.env.UPLOADS_DIR ?? path.join(serverRoot, "uploads");
export const clientDistDir = path.join(serverRoot, "..", "client", "dist");
