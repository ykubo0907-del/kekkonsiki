// 管理者アカウントを作成するCLIスクリプト。
// 使い方: npm run create-admin -- --username taro --password xxxxxxxx
import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../src/db/index.js";

function readArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const username = readArg("username");
const password = readArg("password");

if (!username || !password) {
  console.error("使い方: npm run create-admin -- --username <name> --password <password>");
  process.exit(1);
}

if (password.length < 8) {
  console.error("パスワードは8文字以上にしてください");
  process.exit(1);
}

const existing = db.prepare("SELECT id FROM admins WHERE username = ?").get(username);
if (existing) {
  console.error(`ユーザー名 "${username}" は既に存在します`);
  process.exit(1);
}

const passwordHash = bcrypt.hashSync(password, 10);
db.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").run(username, passwordHash);

console.log(`管理者アカウント "${username}" を作成しました`);
