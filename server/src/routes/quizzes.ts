import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { uploadsDir } from "../config.js";
import { db, runInTransaction } from "../db/index.js";
import { requireAdmin } from "../middleware/auth.js";

fs.mkdirSync(uploadsDir, { recursive: true });

export const quizzesRouter = Router();
quizzesRouter.use(requireAdmin);

interface QuizRow {
  id: number;
  admin_id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

interface QuestionRow {
  id: number;
  quiz_id: number;
  order_index: number;
  question_type: "choice" | "freetext";
  question_text: string;
  choice_a: string | null;
  choice_b: string | null;
  choice_c: string | null;
  choice_d: string | null;
  correct_choice: "A" | "B" | "C" | "D" | null;
  correct_answer_text: string | null;
  image_path: string | null;
}

function loadOwnedQuiz(quizId: number, adminId: number): QuizRow | undefined {
  return db
    .prepare("SELECT * FROM quizzes WHERE id = ? AND admin_id = ?")
    .get(quizId, adminId) as QuizRow | undefined;
}

// 一覧
quizzesRouter.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT q.id, q.title, q.updated_at,
              (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS question_count
       FROM quizzes q WHERE q.admin_id = ? ORDER BY q.updated_at DESC`,
    )
    .all(req.admin!.adminId);
  res.json(rows);
});

// 新規作成(タイトルのみ。問題は後から編集)
const createQuizSchema = z.object({ title: z.string().min(1).max(200) });

quizzesRouter.post("/", (req, res) => {
  const parsed = createQuizSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "タイトルを入力してください" });
  }
  const info = db
    .prepare("INSERT INTO quizzes (admin_id, title) VALUES (?, ?)")
    .run(req.admin!.adminId, parsed.data.title);
  res.status(201).json({ id: info.lastInsertRowid });
});

// 詳細(問題込み)
quizzesRouter.get("/:id", (req, res) => {
  const quiz = loadOwnedQuiz(Number(req.params.id), req.admin!.adminId);
  if (!quiz) return res.status(404).json({ error: "クイズが見つかりません" });

  const questions = db
    .prepare("SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index")
    .all(quiz.id) as unknown as QuestionRow[];

  res.json({ ...quiz, questions });
});

// タイトル更新
quizzesRouter.put("/:id", (req, res) => {
  const parsed = createQuizSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "タイトルを入力してください" });
  }
  const quiz = loadOwnedQuiz(Number(req.params.id), req.admin!.adminId);
  if (!quiz) return res.status(404).json({ error: "クイズが見つかりません" });

  db.prepare("UPDATE quizzes SET title = ?, updated_at = datetime('now') WHERE id = ?").run(
    parsed.data.title,
    quiz.id,
  );
  res.status(204).end();
});

// 削除
quizzesRouter.delete("/:id", (req, res) => {
  const quiz = loadOwnedQuiz(Number(req.params.id), req.admin!.adminId);
  if (!quiz) return res.status(404).json({ error: "クイズが見つかりません" });

  db.prepare("DELETE FROM quizzes WHERE id = ?").run(quiz.id);
  res.status(204).end();
});

// 複製
quizzesRouter.post("/:id/duplicate", (req, res) => {
  const quiz = loadOwnedQuiz(Number(req.params.id), req.admin!.adminId);
  if (!quiz) return res.status(404).json({ error: "クイズが見つかりません" });

  const questions = db
    .prepare("SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index")
    .all(quiz.id) as unknown as QuestionRow[];

  const newQuizId = runInTransaction(() => {
    const info = db
      .prepare("INSERT INTO quizzes (admin_id, title) VALUES (?, ?)")
      .run(quiz.admin_id, `${quiz.title}のコピー`);
    const newId = info.lastInsertRowid as number;
    const insertQuestion = db.prepare(
      `INSERT INTO questions
        (quiz_id, order_index, question_type, question_text, choice_a, choice_b, choice_c, choice_d, correct_choice, correct_answer_text, image_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const q of questions) {
      insertQuestion.run(
        newId,
        q.order_index,
        q.question_type,
        q.question_text,
        q.choice_a,
        q.choice_b,
        q.choice_c,
        q.choice_d,
        q.correct_choice,
        q.correct_answer_text,
        q.image_path,
      );
    }
    return newId;
  });

  res.status(201).json({ id: newQuizId });
});

// 問題の一括保存(常に0〜9のorder_indexで全件置き換え)。
// 問題ごとにquestion_typeを持ち、4択と自由記述を混在できる。
const choiceQuestionSchema = z.object({
  order_index: z.number().int().min(0).max(9),
  question_type: z.literal("choice"),
  question_text: z.string().min(1),
  choice_a: z.string().min(1),
  choice_b: z.string().min(1),
  choice_c: z.string().min(1),
  choice_d: z.string().min(1),
  correct_choice: z.enum(["A", "B", "C", "D"]),
});
const freetextQuestionSchema = z.object({
  order_index: z.number().int().min(0).max(9),
  question_type: z.literal("freetext"),
  question_text: z.string().min(1),
  correct_answer_text: z.string().min(1),
});
const questionSchema = z.discriminatedUnion("question_type", [choiceQuestionSchema, freetextQuestionSchema]);
const questionsPayloadSchema = z.object({ questions: z.array(questionSchema).max(10) });

quizzesRouter.put("/:id/questions", (req, res) => {
  const quiz = loadOwnedQuiz(Number(req.params.id), req.admin!.adminId);
  if (!quiz) return res.status(404).json({ error: "クイズが見つかりません" });

  const parsed = questionsPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "問題データが不正です", details: parsed.error.flatten() });
  }
  const orderIndexes = parsed.data.questions.map((q) => q.order_index);
  if (new Set(orderIndexes).size !== orderIndexes.length) {
    return res.status(400).json({ error: "問題番号が重複しています" });
  }

  runInTransaction(() => {
    // order_indexごとの既存画像は、問題文編集時にも失われないよう引き継ぐ
    const existingImages = new Map<number, string | null>();
    const oldRows = db
      .prepare("SELECT order_index, image_path FROM questions WHERE quiz_id = ?")
      .all(quiz.id) as { order_index: number; image_path: string | null }[];
    for (const row of oldRows) existingImages.set(row.order_index, row.image_path);

    db.prepare("DELETE FROM questions WHERE quiz_id = ?").run(quiz.id);
    const insert = db.prepare(
      `INSERT INTO questions
        (quiz_id, order_index, question_type, question_text, choice_a, choice_b, choice_c, choice_d, correct_choice, correct_answer_text, image_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const q of parsed.data.questions) {
      const isChoice = q.question_type === "choice";
      insert.run(
        quiz.id,
        q.order_index,
        q.question_type,
        q.question_text,
        isChoice ? q.choice_a : null,
        isChoice ? q.choice_b : null,
        isChoice ? q.choice_c : null,
        isChoice ? q.choice_d : null,
        isChoice ? q.correct_choice : null,
        isChoice ? null : q.correct_answer_text,
        existingImages.get(q.order_index) ?? null,
      );
    }
    db.prepare("UPDATE quizzes SET updated_at = datetime('now') WHERE id = ?").run(quiz.id);
  });

  res.status(204).end();
});

// 問題画像のアップロード(スマホでも見やすいよう、クライアント側でリサイズ済みのJPEGを想定)
const IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const imageUploadSchema = z.object({ dataUrl: z.string() });

quizzesRouter.put("/:id/questions/:orderIndex/image", (req, res) => {
  const orderIndex = Number(req.params.orderIndex);
  if (!Number.isInteger(orderIndex) || orderIndex < 0 || orderIndex > 9) {
    return res.status(400).json({ error: "問題番号が不正です" });
  }
  const quiz = loadOwnedQuiz(Number(req.params.id), req.admin!.adminId);
  if (!quiz) return res.status(404).json({ error: "クイズが見つかりません" });

  const question = db
    .prepare("SELECT * FROM questions WHERE quiz_id = ? AND order_index = ?")
    .get(quiz.id, orderIndex) as QuestionRow | undefined;
  if (!question) return res.status(404).json({ error: "先に問題を保存してください" });

  const parsed = imageUploadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "画像データが不正です" });

  const match = parsed.data.dataUrl.match(IMAGE_DATA_URL_PATTERN);
  if (!match) return res.status(400).json({ error: "対応していない画像形式です" });

  const [, ext, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > MAX_IMAGE_BYTES) {
    return res.status(400).json({ error: "画像サイズが大きすぎます" });
  }

  const filename = `${randomUUID()}.${ext === "jpg" ? "jpeg" : ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), buffer);

  const oldImagePath = question.image_path;
  const newImagePath = `/uploads/${filename}`;
  db.prepare("UPDATE questions SET image_path = ? WHERE id = ?").run(newImagePath, question.id);

  if (oldImagePath) {
    const oldFile = path.join(uploadsDir, path.basename(oldImagePath));
    fs.rm(oldFile, { force: true }, () => {});
  }

  res.json({ image_path: newImagePath });
});

// 問題画像の削除
quizzesRouter.delete("/:id/questions/:orderIndex/image", (req, res) => {
  const orderIndex = Number(req.params.orderIndex);
  if (!Number.isInteger(orderIndex) || orderIndex < 0 || orderIndex > 9) {
    return res.status(400).json({ error: "問題番号が不正です" });
  }
  const quiz = loadOwnedQuiz(Number(req.params.id), req.admin!.adminId);
  if (!quiz) return res.status(404).json({ error: "クイズが見つかりません" });

  const question = db
    .prepare("SELECT * FROM questions WHERE quiz_id = ? AND order_index = ?")
    .get(quiz.id, orderIndex) as QuestionRow | undefined;
  if (!question) return res.status(404).json({ error: "問題が見つかりません" });

  if (question.image_path) {
    const oldFile = path.join(uploadsDir, path.basename(question.image_path));
    fs.rm(oldFile, { force: true }, () => {});
  }
  db.prepare("UPDATE questions SET image_path = NULL WHERE id = ?").run(question.id);
  res.status(204).end();
});
