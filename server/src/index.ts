import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { clientDistDir, uploadsDir } from "./config.js";
import "./db/index.js"; // 起動時にスキーマを適用
import { bootstrapAdminFromEnv } from "./db/bootstrapAdmin.js";
import { setupRealtime } from "./realtime/socket.js";
import { authRouter } from "./routes/auth.js";
import { quizzesRouter } from "./routes/quizzes.js";
import { roomsRouter } from "./routes/rooms.js";

bootstrapAdminFromEnv();

const app = express();
const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json({ limit: "8mb" })); // 問題画像をbase64で受け取るため
app.use(cookieParser());
app.use("/uploads", express.static(uploadsDir));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/quizzes", quizzesRouter);
app.use("/api/rooms", roomsRouter);

// client/dist が存在する場合のみ配信する(本番の単一サービス構成向け)。
// ローカル開発では別途 `npm run dev` (Vite) を使うため存在しなくてもよい。
if (fs.existsSync(path.join(clientDistDir, "index.html"))) {
  app.use(express.static(clientDistDir));
  app.get(/^(?!\/api|\/uploads|\/socket\.io).*/, (_req, res) => {
    res.sendFile(path.join(clientDistDir, "index.html"));
  });
}

const httpServer = createServer(app);
setupRealtime(httpServer, clientOrigin);

const port = Number(process.env.PORT ?? 4000);
httpServer.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});
