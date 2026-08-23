import type { QuestionInput, QuizDetail, QuizSummary, RoomState } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    credentials: "include",
  });
  if (!res.ok) {
    let message = `エラーが発生しました (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ username: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: () => request<{ username: string }>("/auth/me"),

  listQuizzes: () => request<QuizSummary[]>("/quizzes"),
  createQuiz: (title: string) =>
    request<{ id: number }>("/quizzes", { method: "POST", body: JSON.stringify({ title }) }),
  getQuiz: (id: number) => request<QuizDetail>(`/quizzes/${id}`),
  updateQuizTitle: (id: number, title: string) =>
    request<void>(`/quizzes/${id}`, { method: "PUT", body: JSON.stringify({ title }) }),
  deleteQuiz: (id: number) => request<void>(`/quizzes/${id}`, { method: "DELETE" }),
  duplicateQuiz: (id: number) => request<{ id: number }>(`/quizzes/${id}/duplicate`, { method: "POST" }),
  saveQuestions: (id: number, questions: QuestionInput[]) =>
    request<void>(`/quizzes/${id}/questions`, { method: "PUT", body: JSON.stringify({ questions }) }),
  uploadQuestionImage: (id: number, orderIndex: number, dataUrl: string) =>
    request<{ image_path: string }>(`/quizzes/${id}/questions/${orderIndex}/image`, {
      method: "PUT",
      body: JSON.stringify({ dataUrl }),
    }),
  deleteQuestionImage: (id: number, orderIndex: number) =>
    request<void>(`/quizzes/${id}/questions/${orderIndex}/image`, { method: "DELETE" }),

  createRoom: (quizId: number) =>
    request<{ roomCode: string }>("/rooms", { method: "POST", body: JSON.stringify({ quizId }) }),
  getRoomState: (code: string, participantId?: string) =>
    request<RoomState>(`/rooms/${code}/state${participantId ? `?participantId=${participantId}` : ""}`),
  joinRoom: (code: string, nickname: string) =>
    request<{ participantId: string }>(`/rooms/${code}/join`, {
      method: "POST",
      body: JSON.stringify({ nickname }),
    }),
  submitAnswer: (code: string, participantId: string, answerText: string) =>
    request<void>(`/rooms/${code}/answer`, {
      method: "POST",
      body: JSON.stringify({ participantId, answerText }),
    }),
  nextQuestion: (code: string) => request<void>(`/rooms/${code}/next`, { method: "POST" }),
  revealAnswer: (code: string) => request<void>(`/rooms/${code}/reveal`, { method: "POST" }),
  revealCorrectAnswer: (code: string) => request<void>(`/rooms/${code}/reveal-correct`, { method: "POST" }),
  advanceRankReveal: (code: string) => request<void>(`/rooms/${code}/reveal-rank`, { method: "POST" }),
  closeRoom: (code: string) => request<void>(`/rooms/${code}`, { method: "DELETE" }),
};
