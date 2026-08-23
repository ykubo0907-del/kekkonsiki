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
export type QuestionType = "choice" | "freetext";
export type Phase = "waiting" | "question" | "reveal" | "finished";

export interface QuestionSnapshot {
  order_index: number;
  question_type: QuestionType;
  question_text: string;
  image_path: string | null;
  // question_type === "choice" のときのみ使う
  choice_a?: string | null;
  choice_b?: string | null;
  choice_c?: string | null;
  choice_d?: string | null;
  correct_choice?: Choice | null;
  // question_type === "freetext" のときのみ使う
  correct_answer_text?: string | null;
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
  questions: QuestionSnapshot[]; // 問題ごとにquestion_typeを持ち、4択と自由記述を混在できる
  phase: Phase;
  currentQuestionIndex: number; // -1 = 未開始
  participants: Map<string, Participant>;
  answers: Map<number, Map<string, string>>; // questionIndex -> participantId -> 回答("A"〜"D" または自由記述)
  createdAt: number;
  lastActivityAt: number;
  rankRevealStage: number; // 最終結果画面で、管理者操作により何段階目まで発表済みか(0=未発表)
  correctRevealed: boolean; // 自由記述問題のreveal中、正解とハイライトをまだ出していないか(4択では常にtrue)
}

export interface RankingEntry {
  rank: number;
  nickname: string;
  score: number;
}

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい文字(0/O/1/I)を除外
const generateRoomCode = customAlphabet(ROOM_CODE_ALPHABET, 6);
const ROOM_TTL_MS = 12 * 60 * 60 * 1000; // 12時間、安全網としての自動破棄

// 表記ゆれ(カタカナ/ひらがな、空白、大文字小文字)を吸収してから比較するための正規化。
// 自由記述の問題でのみ使う。「らーめん」と「ラーメン」を同じ扱いにする。
export function normalizeAnswer(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60)); // カタカナ→ひらがな
}

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
      rankRevealStage: 0,
      correctRevealed: false,
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

  submitAnswer(roomCode: string, participantId: string, answerText: string): { error?: string } {
    const room = this.getRoom(roomCode);
    if (!room) return { error: "ルームが見つかりません" };
    if (!room.participants.has(participantId)) return { error: "参加情報が見つかりません" };
    if (room.phase !== "question") return { error: "現在回答を受け付けていません" };

    const question = room.questions[room.currentQuestionIndex];
    let value: string;
    if (question.question_type === "choice") {
      if (!["A", "B", "C", "D"].includes(answerText)) return { error: "選択肢が不正です" };
      value = answerText;
    } else {
      const trimmed = answerText.trim().slice(0, 50);
      if (!trimmed) return { error: "回答を入力してください" };
      value = trimmed;
    }

    const qIndex = room.currentQuestionIndex;
    let answersForQuestion = room.answers.get(qIndex);
    if (!answersForQuestion) {
      answersForQuestion = new Map();
      room.answers.set(qIndex, answersForQuestion);
    }
    if (answersForQuestion.has(participantId)) {
      return { error: "既に回答済みです" };
    }
    answersForQuestion.set(participantId, value);
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
      room.rankRevealStage = 0;
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
    if (room.phase !== "question") return { error: "今は回答を表示できません" };

    room.phase = "reveal";
    // 4択は正解を即時公開、自由記述は「みんなの回答表示」→「正解発表」の2段階にする
    room.correctRevealed = room.questions[room.currentQuestionIndex].question_type === "choice";
    room.lastActivityAt = Date.now();
    roomEvents.emit("update", room.roomCode);
    return {};
  }

  revealCorrectAnswer(roomCode: string, adminId: number): { error?: string } {
    const room = this.getRoom(roomCode);
    if (!room) return { error: "ルームが見つかりません" };
    if (room.adminId !== adminId) return { error: "このルームを操作する権限がありません" };
    if (room.questions[room.currentQuestionIndex]?.question_type !== "freetext") {
      return { error: "この問題では不要な操作です" };
    }
    if (room.phase !== "reveal") return { error: "今は正解を発表できません" };
    if (room.correctRevealed) return { error: "既に正解を発表済みです" };

    room.correctRevealed = true;
    room.lastActivityAt = Date.now();
    roomEvents.emit("update", room.roomCode);
    return {};
  }

  private isCorrectAnswer(room: RoomState, qIndex: number, participantId: string): boolean {
    const answer = room.answers.get(qIndex)?.get(participantId);
    if (!answer) return false;
    const question = room.questions[qIndex];
    if (question.question_type === "choice") {
      return answer === question.correct_choice;
    }
    return normalizeAnswer(answer) === normalizeAnswer(question.correct_answer_text ?? "");
  }

  private computeAnswerCounts(room: RoomState, qIndex: number): Record<Choice, number> {
    const counts: Record<Choice, number> = { A: 0, B: 0, C: 0, D: 0 };
    const answersForQuestion = room.answers.get(qIndex);
    if (answersForQuestion) {
      for (const choice of answersForQuestion.values()) {
        counts[choice as Choice] += 1;
      }
    }
    return counts;
  }

  // 4択・自由記述が混在していても、問題ごとに正誤判定して合計するのでそのまま合算ランキングになる
  computeRanking(room: RoomState): RankingEntry[] {
    const scores = new Map<string, number>();
    for (const participant of room.participants.values()) {
      scores.set(participant.id, 0);
    }
    for (let qIndex = 0; qIndex < room.questions.length; qIndex++) {
      for (const participantId of room.participants.keys()) {
        if (this.isCorrectAnswer(room, qIndex, participantId)) {
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

  // 最終ランキングのうち、演出対象となる上位の順位値を「発表順」(3位相当→2位相当→1位相当)で返す
  private rankStagingOrder(ranking: RankingEntry[]): number[] {
    const distinctRanks = [...new Set(ranking.map((r) => r.rank))].sort((a, b) => a - b);
    const topRanks = distinctRanks.slice(0, 3);
    return [...topRanks].reverse();
  }

  advanceRankReveal(roomCode: string, adminId: number): { error?: string } {
    const room = this.getRoom(roomCode);
    if (!room) return { error: "ルームが見つかりません" };
    if (room.adminId !== adminId) return { error: "このルームを操作する権限がありません" };
    if (room.phase !== "finished") return { error: "今は順位発表できません" };

    const max = this.rankStagingOrder(this.computeRanking(room)).length;
    if (room.rankRevealStage >= max) return { error: "すべて発表済みです" };

    room.rankRevealStage += 1;
    room.lastActivityAt = Date.now();
    roomEvents.emit("update", room.roomCode);
    return {};
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
    const myAnswer =
      participantId && qIndex >= 0 ? room.answers.get(qIndex)?.get(participantId) ?? null : null;

    if (room.phase === "waiting" || !question) {
      return { ...base };
    }

    const answersForQuestion = room.answers.get(qIndex);
    const answeredCount = answersForQuestion?.size ?? 0;

    const questionPublic =
      question.question_type === "choice"
        ? {
            question_type: question.question_type,
            question_text: question.question_text,
            choice_a: question.choice_a,
            choice_b: question.choice_b,
            choice_c: question.choice_c,
            choice_d: question.choice_d,
            image_path: question.image_path,
          }
        : {
            question_type: question.question_type,
            question_text: question.question_text,
            image_path: question.image_path,
          };

    if (room.phase === "reveal") {
      if (question.question_type === "choice") {
        const answerCounts = this.computeAnswerCounts(room, qIndex);
        return {
          ...base,
          question: { ...questionPublic, correct_choice: question.correct_choice },
          answerCounts,
          answeredCount,
          hasAnswered,
          myAnswer,
          correctCount: answerCounts[question.correct_choice as Choice],
        };
      }

      // 自由記述: 誰が何と書いたかを一覧表示する(4択とは異なり匿名にしない)
      const answerList = [...room.participants.values()].map((p) => {
        const answerText = answersForQuestion?.get(p.id) ?? null;
        const isCorrect =
          room.correctRevealed && answerText !== null && this.isCorrectAnswer(room, qIndex, p.id);
        return { nickname: p.nickname, answerText, isCorrect };
      });
      const correctCount = room.correctRevealed ? answerList.filter((a) => a.isCorrect).length : undefined;
      return {
        ...base,
        question: questionPublic,
        correctRevealed: room.correctRevealed,
        correctAnswerText: room.correctRevealed ? question.correct_answer_text : undefined,
        answers: answerList,
        answeredCount,
        hasAnswered,
        myAnswer,
        correctCount,
      };
    }

    if (room.phase === "finished") {
      const ranking = this.computeRanking(room);
      const rankRevealMax = this.rankStagingOrder(ranking).length;
      return { ...base, ranking, rankRevealStage: room.rankRevealStage, rankRevealMax };
    }

    // phase === "question"
    const answerCounts = question.question_type === "choice" ? this.computeAnswerCounts(room, qIndex) : undefined;
    return {
      ...base,
      question: questionPublic,
      answerCounts,
      answeredCount,
      hasAnswered,
      myAnswer,
    };
  }
}

export const roomManager = new RoomManager();
