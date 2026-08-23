-- 永続データのみ。ゲスト参加データ(ニックネーム/回答/得点)はここには一切保存しない。

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'choice' CHECK (question_type IN ('choice', 'freetext')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- question_typeが'choice'の問題はchoice_a〜d/correct_choiceを使い、
-- 'freetext'の問題はcorrect_answer_textを使う(クイズ単位で型が決まるため、1つの問題で両方使うことはない)。
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  choice_a TEXT,
  choice_b TEXT,
  choice_c TEXT,
  choice_d TEXT,
  correct_choice TEXT CHECK (correct_choice IN ('A', 'B', 'C', 'D')),
  correct_answer_text TEXT,
  image_path TEXT,
  UNIQUE(quiz_id, order_index)
);

CREATE INDEX IF NOT EXISTS idx_quizzes_admin ON quizzes(admin_id);
CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id);
