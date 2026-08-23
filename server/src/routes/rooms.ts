import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { requireAdmin } from "../middleware/auth.js";
import { roomManager, type QuestionSnapshot } from "../rooms/RoomManager.js";

export const roomsRouter = Router();

interface QuizRow {
  id: number;
  admin_id: number;
  title: string;
}

// クイズを開催してルームを作成(管理者のみ)
const createRoomSchema = z.object({ quizId: z.number().int() });

roomsRouter.post("/", requireAdmin, (req, res) => {
  const parsed = createRoomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "quizIdが不正です" });

  const quiz = db
    .prepare("SELECT * FROM quizzes WHERE id = ? AND admin_id = ?")
    .get(parsed.data.quizId, req.admin!.adminId) as QuizRow | undefined;
  if (!quiz) return res.status(404).json({ error: "クイズが見つかりません" });

  const questions = db
    .prepare("SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index")
    .all(quiz.id) as unknown as QuestionSnapshot[];
  if (questions.length !== 10) {
    return res.status(400).json({ error: "クイズは10問揃ってから開催してください" });
  }

  const room = roomManager.createRoom({
    adminId: req.admin!.adminId,
    quizId: quiz.id,
    title: quiz.title,
    questions,
  });
  res.status(201).json({ roomCode: room.roomCode });
});

// 状態取得(ゲスト/スクリーンからも呼ばれるため認証不要)
roomsRouter.get("/:code/state", (req, res) => {
  const participantId = typeof req.query.participantId === "string" ? req.query.participantId : undefined;
  const state = roomManager.getPublicState(req.params.code, participantId);
  if ("error" in state && state.error) return res.status(404).json(state);
  res.json(state);
});

// 参加(ニックネームのみ、認証不要)
const joinSchema = z.object({ nickname: z.string().min(1).max(20) });

roomsRouter.post("/:code/join", (req, res) => {
  const parsed = joinSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "ニックネームを入力してください" });

  const result = roomManager.join(req.params.code, parsed.data.nickname);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json({ participantId: result.participantId });
});

// 回答(認証不要、participantIdで本人確認)。4択は"A"〜"D"、自由記述は入力テキストをそのまま送る。
const answerSchema = z.object({
  participantId: z.string().min(1),
  answerText: z.string().min(1).max(50),
});

roomsRouter.post("/:code/answer", (req, res) => {
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "回答を入力してください" });

  const result = roomManager.submitAnswer(req.params.code, parsed.data.participantId, parsed.data.answerText);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(204).end();
});

// 進行操作(管理者のみ)
roomsRouter.post("/:code/next", requireAdmin, (req, res) => {
  const result = roomManager.nextQuestion(req.params.code, req.admin!.adminId);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(204).end();
});

roomsRouter.post("/:code/reveal", requireAdmin, (req, res) => {
  const result = roomManager.revealAnswer(req.params.code, req.admin!.adminId);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(204).end();
});

// 正解(自由記述クイズの新郎新婦の回答)を発表し、一致した回答をハイライトする(管理者のみ)
roomsRouter.post("/:code/reveal-correct", requireAdmin, (req, res) => {
  const result = roomManager.revealCorrectAnswer(req.params.code, req.admin!.adminId);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(204).end();
});

// 最終ランキングを1段階ずつ発表(管理者のみ、3位相当→2位相当→1位相当の順)
roomsRouter.post("/:code/reveal-rank", requireAdmin, (req, res) => {
  const result = roomManager.advanceRankReveal(req.params.code, req.admin!.adminId);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(204).end();
});

roomsRouter.delete("/:code", requireAdmin, (req, res) => {
  const result = roomManager.closeRoom(req.params.code, req.admin!.adminId);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(204).end();
});
