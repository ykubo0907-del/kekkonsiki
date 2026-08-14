import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import ConnectionBanner from "../components/ConnectionBanner";
import { api, ApiError } from "../lib/api";
import type { Choice, RoomState } from "../lib/types";
import { useRoomSocket } from "../lib/useRoomSocket";

// リアルタイム更新はSocket.IOが担うため、これは通信不安定時の保険としてのみ機能する
const FALLBACK_POLL_INTERVAL_MS = 8000;

function storageKey(roomCode: string, suffix: string) {
  return `wq_${roomCode}_${suffix}`;
}

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const roomCode = (code ?? "").toUpperCase();

  const [participantId, setParticipantId] = useState<string | null>(() =>
    localStorage.getItem(storageKey(roomCode, "pid")),
  );
  const [nickname, setNickname] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const [state, setState] = useState<RoomState | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [answering, setAnswering] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await api.getRoomState(roomCode, participantId ?? undefined);
      setState(s);
      if (s.participantError) {
        // サーバー側で参加情報が失われている(サーバー再起動など) → 再参加させる
        localStorage.removeItem(storageKey(roomCode, "pid"));
        setParticipantId(null);
      }
      setStateError(null);
    } catch (err) {
      setStateError(err instanceof ApiError ? err.message : "接続できません");
    }
  }, [roomCode, participantId]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, FALLBACK_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const { connected } = useRoomSocket(roomCode, refresh);

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!nickname.trim()) return;
    setJoining(true);
    setJoinError(null);
    try {
      const { participantId: pid } = await api.joinRoom(roomCode, nickname.trim());
      localStorage.setItem(storageKey(roomCode, "pid"), pid);
      localStorage.setItem(storageKey(roomCode, "nickname"), nickname.trim());
      setParticipantId(pid);
    } catch (err) {
      setJoinError(err instanceof ApiError ? err.message : "参加できませんでした");
    } finally {
      setJoining(false);
    }
  }

  async function handleAnswer(choice: Choice) {
    if (!participantId || answering) return;
    setAnswering(true);
    try {
      await api.submitAnswer(roomCode, participantId, choice);
      await refresh();
    } catch (err) {
      setStateError(err instanceof ApiError ? err.message : "回答に失敗しました");
    } finally {
      setAnswering(false);
    }
  }

  if (stateError && !state) {
    return (
      <div className="page">
        <p className="error-text">{stateError}</p>
      </div>
    );
  }

  if (!state) return <div className="page">読み込み中...</div>;

  if (!participantId || state.participantError) {
    return (
      <div className="page">
        <ConnectionBanner connected={connected} />
        <h1>{state.title || "クイズに参加"}</h1>
        <form className="card" onSubmit={handleJoin}>
          <div className="field">
            <label htmlFor="nickname">ニックネーム</label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={20}
              required
            />
          </div>
          {joinError && <p className="error-text">{joinError}</p>}
          <button type="submit" disabled={joining}>
            参加する
          </button>
        </form>
      </div>
    );
  }

  const myNickname = localStorage.getItem(storageKey(roomCode, "nickname"));

  return (
    <div className="page">
      <ConnectionBanner connected={connected} />
      <h1>{state.title}</h1>

      {state.phase === "waiting" && (
        <div className="card">
          <p>クイズの開始をお待ちください</p>
          <p className="muted">現在の参加者数: {state.participantCount}人</p>
        </div>
      )}

      {(state.phase === "question" || state.phase === "reveal") && state.question && (
        <div className="card">
          <p className="muted">
            第{state.questionNumber}問 / {state.totalQuestions}問
          </p>
          <p>{state.question.question_text}</p>
          {state.question.image_path && (
            <img className="question-image" src={state.question.image_path} alt="問題の画像" />
          )}
          <div className="choice-grid">
            {(["A", "B", "C", "D"] as Choice[]).map((c) => {
              const key = `choice_${c.toLowerCase()}` as "choice_a" | "choice_b" | "choice_c" | "choice_d";
              const label = state.question![key];
              let className = "choice-btn";
              if (state.phase === "reveal") {
                if (c === state.question!.correct_choice) className += " correct";
                else if (c === state.myChoice) className += " incorrect";
              } else if (c === state.myChoice) {
                className += " selected";
              }
              return (
                <button
                  key={c}
                  className={className}
                  disabled={state.phase === "reveal" || state.hasAnswered || answering}
                  onClick={() => handleAnswer(c)}
                >
                  {c}. {label}
                </button>
              );
            })}
          </div>
          {state.hasAnswered && state.phase === "question" && <p className="muted">回答を送信しました。結果をお待ちください</p>}
          {state.phase === "reveal" && (
            <p>
              正解は <strong>{state.question.correct_choice}</strong> でした！
              {state.myChoice === state.question.correct_choice ? " 正解です🎉" : ""}
            </p>
          )}
        </div>
      )}

      {state.phase === "finished" && state.ranking && (() => {
        const revealStage = state.rankRevealStage ?? 0;
        const distinctRanks = Array.from(new Set(state.ranking.map((r) => r.rank))).sort((a, b) => a - b);
        const topRanks = distinctRanks.slice(0, 3);
        const stagingOrder = [...topRanks].reverse();
        const revealedRanks = new Set(stagingOrder.slice(0, revealStage));

        return (
        <div className="card">
          <h2>最終ランキング</h2>
          {revealStage < stagingOrder.length && (
            <p className="muted">会場スクリーンで上位の発表中です。しばらくお待ちください</p>
          )}
          <ol>
            {state.ranking.map((r) => (
              <li key={r.nickname} style={{ fontWeight: r.nickname === myNickname ? "bold" : "normal" }}>
                {topRanks.includes(r.rank) && !revealedRanks.has(r.rank) ? (
                  <span className="muted">{r.rank}位 (発表待ち)</span>
                ) : (
                  <>
                    {r.rank}位 {r.nickname}（{r.score}点）
                  </>
                )}
              </li>
            ))}
          </ol>
        </div>
        );
      })()}

      {stateError && <p className="error-text">{stateError}</p>}
    </div>
  );
}
