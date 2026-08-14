import { EventEmitter } from "node:events";
import { customAlphabet, nanoid } from "nanoid";

// このファイルが扱うデータは全てメモリ上のみに存在し、ディスク(DB)には一切書き込まない。
// クイズ開催中のゲスト参加データ(ニックネーム・回答・得点)を永続化しないという要件を
// 「実装上不可能にする」ことで担保するための設計。

// ルームの状態が変化した際に roomCode を通知するイベントバス。
// Socket.IO層はこれを購読して「更新があったので再取得してください」という
// 軽量なシグナルをクライアントへブロードキャストするだけに徹する。
// (公開状態の組み立てロジックを二重管理しないための設計)
export const roomEvents = new EventEmitter();
roomEvents.setMaxListeners(0);

export type Choice = "A" | "B" | "C" | "D";
export type Phase = "waiting" | "question" | "reveal" | "finished";

export interface QuestionSnapshot {
  order_index: number;
  question_text: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct_choice: Choice;
  image_path: string | null;
}

interface Participant {
  id: string;
  nickname: string;
  joinedAt: number;
}

interface RoomState {
  roomCode: string;
  adminId: number;
  quizId: number;
  title: string;
  questions: QuestionSnapshot[];
  phase: Phase;
  currentQuestionIndex: number; // -1 = 未開始
  participants: Map<string, Participant>;
  answers: Map<number, Map<string, Choice>>; // questionIndex -> participantId -> choice
  createdAt: number;
  lastActivityAt: number;
}

export interface RankingEntry {
  rank: number;
  nickname: string;
  score: number;
}

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい文字(0/O/1/I)を除外
const generateRoomCode = customAlphabet(ROOM_CODE_ALPHABET, 6);
const ROOM_TTL_MS = 12 * 60 * 60 * 1000; // 12時間、安全網としての自動破棄

class RoomManager {
  private rooms = new Map<string, RoomState>();

  constructor() {
    setInterval(() => this.sweepStaleRooms(), 30 * 60 * 1000).unref();
  }

  private sweepStaleRooms() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (now - room.lastActivityAt > ROOM_TTL_MS) {
        this.rooms.delete(code);
      }
    }
  }

  createRoom(params: {
    adminId: number;
    quizId: number;
    title: string;
    questions: QuestionSnapshot[];
  }): RoomState {
    let roomCode = generateRoomCode();
    while (this.rooms.has(roomCode)) {
      roomCode = generateRoomCode();
    }
    const room: RoomState = {
      roomCode,
      adminId: params.adminId,
      quizId: params.quizId,
      title: params.title,
      questions: params.questions,
      phase: "waiting",
      currentQuestionIndex: -1,
      participants: new Map(),
      answers: new Map(),
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    this.rooms.set(roomCode, room);
    return room;
  }

  getRoom(roomCode: string): RoomState | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  closeRoom(roomCode: string, adminId: number): { error?: string } {
    const room = this.getRoom(roomCode);
    if (!room) return { error: "ルームが見つかりません" };
    if (room.adminId !== adminId) return { error: "このルームを操作する権限がありません" };
    this.rooms.delete(room.roomCode);
    roomEvents.emit("update", room.roomCode);
    return {};
  }

  join(roomCode: string, nickname: string): { participantId?: string; error?: string } {
    const room = this.getRoom(roomCode);
    if (!room) return { error: "ルームが見つかりません" };
    if (room.phase === "finished") return { error: "このクイズは既に終了しています" };

    const trimmed = nickname.trim().slice(0, 20);
    if (!trimmed) return { error: "ニックネームを入力してください" };

    const participantId = nanoid(12);
    room.participants.set(participantId, {
      id: participantId,
      nickname: trimmed,
      joinedAt: Date.now(),
    });
    room.lastActivityAt = Date.now();
    roomEvents.emit("update", room.roomCode);
    return { participantId };
  }

  submitAnswer(
    roomCode: string,
    participantId: string,
    choice: Choice,
  ): { error?: string } {
    const room = this.getRoom(roomCode);
    if (!room) return { error: "ルームが見つかりません" };
    if (!room.participants.has(participantId)) return { error: "参加情報が見つかりません" };
    if (room.phase !== "question") return { error: "現在回答を受け付けていません" };

    const qIndex = room.currentQuestionIndex;
    let answersForQuestion = room.answers.get(qIndex);
    if (!answersForQuestion) {
      answersForQuestion = new Map();
      room.answers.set(qIndex, answersForQuestion);
    }
    if (answersForQuestion.has(participantId)) {
      return { error: "既に回答済みです" };
    }
    answersForQuestion.set(participantId, choice);
    room.lastActivityAt = Date.now();
    roomEvents.emit("update", room.roomCode);
    return {};
  }

  nextQuestion(roomCode: string, adminId: number): { error?: string } {
    const room = this.getRoom(roomCode);
    if (!room) return { error: "ルームが見つかりません" };
    if (room.adminId !== adminId) return { error: "このルームを操作する権限がありません" };
    if (room.phase !== "waiting" && room.phase !== "reveal") {
      return { error: "今は次の問題に進めません" };
    }

    const isLastQuestion = room.currentQuestionIndex >= room.questions.length - 1;
    if (room.phase === "reveal" && isLastQuestion) {
      room.phase = "finished";
    } else {
      room.currentQuestionIndex += 1;
      room.phase = "question";
    }
    room.lastActivityAt = Date.now();
    roomEvents.emit("update", room.roomCode);
    return {};
  }

  revealAnswer(roomCode: string, adminId: number): { error?: string } {
    const room = this.getRoom(roomCode);
    if (!room) return { error: "ルームが見つかりません" };
    if (room.adminId !== adminId) return { error: "このルームを操作する権限がありません" };
    if (room.phase !== "question") return { error: "今は正解発表できません" };

    room.phase = "reveal";
    room.lastActivityAt = Date.now();
    roomEvents.emit("update", room.roomCode);
    return {};
  }

  private computeAnswerCounts(room: RoomState, qIndex: number): Record<Choice, number> {
    const counts: Record<Choice, number> = { A: 0, B: 0, C: 0, D: 0 };
    const answersForQuestion = room.answers.get(qIndex);
    if (answersForQuestion) {
      for (const choice of answersForQuestion.values()) {
        counts[choice] += 1;
      }
    }
    return counts;
  }

  computeRanking(room: RoomState): RankingEntry[] {
    const scores = new Map<string, number>();
    for (const participant of room.participants.values()) {
      scores.set(participant.id, 0);
    }
    for (let qIndex = 0; qIndex < room.questions.length; qIndex++) {
      const correct = room.questions[qIndex].correct_choice;
      const answersForQuestion = room.answers.get(qIndex);
      if (!answersForQuestion) continue;
      for (const [participantId, choice] of answersForQuestion) {
        if (choice === correct) {
          scores.set(participantId, (scores.get(participantId) ?? 0) + 1);
        }
      }
    }

    const sorted = [...room.participants.values()]
      .map((p) => ({ nickname: p.nickname, score: scores.get(p.id) ?? 0 }))
      .sort((a, b) => b.score - a.score);

    const ranking: RankingEntry[] = [];
    let lastScore: number | null = null;
    let lastRank = 0;
    sorted.forEach((entry, index) => {
      if (entry.score !== lastScore) {
        lastRank = index + 1;
        lastScore = entry.score;
      }
      ranking.push({ rank: lastRank, nickname: entry.nickname, score: entry.score });
    });
    return ranking;
  }

  getPublicState(roomCode: string, participantId?: string) {
    const room = this.getRoom(roomCode);
    if (!room) return { error: "ルームが見つかりません" as const };

    const qIndex = room.currentQuestionIndex;
    const question = qIndex >= 0 ? room.questions[qIndex] : undefined;

    const base = {
      roomCode: room.roomCode,
      title: room.title,
      phase: room.phase,
      participantCount: room.participants.size,
      totalQuestions: room.questions.length,
      questionNumber: qIndex >= 0 ? qIndex + 1 : 0,
    };

    if (participantId && !room.participants.has(participantId)) {
      return { ...base, participantError: "参加情報が見つかりません。再参加してください" };
    }

    const hasAnswered =
      participantId && qIndex >= 0
        ? room.answers.get(qIndex)?.has(participantId) ?? false
        : false;
    const myChoice =
      participantId && qIndex >= 0 ? room.answers.get(qIndex)?.get(participantId) ?? null : null;

    if (room.phase === "waiting" || !question) {
      return { ...base };
    }

    const answerCounts =
      room.phase === "question" || room.phase === "reveal"
        ? this.computeAnswerCounts(room, qIndex)
        : undefined;
    const answeredCount = answerCounts
      ? answerCounts.A + answerCounts.B + answerCounts.C + answerCounts.D
      : undefined;

    const questionPublic = {
      question_text: question.question_text,
      choice_a: question.choice_a,
      choice_b: question.choice_b,
      choice_c: question.choice_c,
      choice_d: question.choice_d,
      image_path: question.image_path,
    };

    if (room.phase === "reveal") {
      return {
        ...base,
        question: { ...questionPublic, correct_choice: question.correct_choice },
        answerCounts,
        answeredCount,
        hasAnswered,
        myChoice,
        correctCount: answerCounts ? answerCounts[question.correct_choice] : 0,
      };
    }

    if (room.phase === "finished") {
      return { ...base, ranking: this.computeRanking(room) };
    }

    // phase === "question"
    return {
      ...base,
      question: questionPublic,
      answerCounts,
      answeredCount,
      hasAnswered,
      myChoice,
    };
  }
}

export const roomManager = new RoomManager();
