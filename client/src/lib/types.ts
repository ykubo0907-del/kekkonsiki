export type Choice = "A" | "B" | "C" | "D";
export type QuestionType = "choice" | "freetext";

export interface QuizSummary {
  id: number;
  title: string;
  updated_at: string;
  question_count: number;
}

export interface QuestionRow {
  id: number;
  quiz_id: number;
  order_index: number;
  question_type: QuestionType;
  question_text: string;
  choice_a: string | null;
  choice_b: string | null;
  choice_c: string | null;
  choice_d: string | null;
  correct_choice: Choice | null;
  correct_answer_text: string | null;
  image_path: string | null;
}

export interface QuizDetail {
  id: number;
  admin_id: number;
  title: string;
  created_at: string;
  updated_at: string;
  questions: QuestionRow[];
}

export interface QuestionInput {
  order_index: number;
  question_type: QuestionType;
  question_text: string;
  choice_a?: string;
  choice_b?: string;
  choice_c?: string;
  choice_d?: string;
  correct_choice?: Choice;
  correct_answer_text?: string;
}

export type Phase = "waiting" | "question" | "reveal" | "finished";

export interface RoomQuestionPublic {
  question_type: QuestionType;
  question_text: string;
  image_path: string | null;
  choice_a?: string;
  choice_b?: string;
  choice_c?: string;
  choice_d?: string;
  correct_choice?: Choice;
}

export interface RankingEntry {
  rank: number;
  nickname: string;
  score: number;
}

export interface AnswerEntry {
  nickname: string;
  answerText: string | null;
  isCorrect: boolean;
}

export interface RoomState {
  roomCode: string;
  title: string;
  phase: Phase;
  participantCount: number;
  totalQuestions: number;
  questionNumber: number;
  question?: RoomQuestionPublic;
  answerCounts?: Record<Choice, number>;
  answers?: AnswerEntry[];
  correctRevealed?: boolean;
  correctAnswerText?: string;
  answeredCount?: number;
  hasAnswered?: boolean;
  myAnswer?: string | null;
  correctCount?: number;
  ranking?: RankingEntry[];
  rankRevealStage?: number;
  rankRevealMax?: number;
  participantError?: string;
}
