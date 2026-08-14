export type Choice = "A" | "B" | "C" | "D";

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
  question_text: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct_choice: Choice;
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
  question_text: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct_choice: Choice;
}

export type Phase = "waiting" | "question" | "reveal" | "finished";

export interface RoomQuestionPublic {
  question_text: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  image_path: string | null;
  correct_choice?: Choice;
}

export interface RankingEntry {
  rank: number;
  nickname: string;
  score: number;
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
  answeredCount?: number;
  hasAnswered?: boolean;
  myChoice?: Choice | null;
  correctCount?: number;
  ranking?: RankingEntry[];
  rankRevealStage?: number;
  rankRevealMax?: number;
  participantError?: string;
}
