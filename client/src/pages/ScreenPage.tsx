import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ConnectionBanner from "../components/ConnectionBanner";
import QRCodeImage from "../components/QRCodeImage";
import { api, ApiError } from "../lib/api";
import type { Choice, RoomState } from "../lib/types";
import { useRoomSocket } from "../lib/useRoomSocket";

const FALLBACK_POLL_INTERVAL_MS = 8000;

export default function ScreenPage() {
  const { code } = useParams<{ code: string }>();
  const roomCode = (code ?? "").toUpperCase();

  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api.getRoomState(roomCode);
      setState(s);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "接続できません");
    }
  }, [roomCode]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, FALLBACK_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const { connected } = useRoomSocket(roomCode, refresh);

  const joinUrl = `${window.location.origin}/play/${roomCode}`;
  const isChoice = state?.question?.question_type === "choice";

  if (error && !state) {
    return (
      <div className="screen-page">
        <p className="screen-error">{error}</p>
      </div>
    );
  }
  if (!state) return <div className="screen-page">読み込み中...</div>;

  return (
    <div className="screen-page">
      <ConnectionBanner connected={connected} />
      {state.phase === "waiting" && (
        <div className="screen-center">
          <h1 className="screen-title">WEDDING QUIZ</h1>
          <p className="screen-participant-count">現在の参加者: {state.participantCount}人</p>
          <p className="screen-join-hint">スマホでQRコードを読み取って参加してください</p>
          <div className="screen-qr">
            <QRCodeImage value={joinUrl} />
          </div>
          <p className="screen-roomcode">{roomCode}</p>
          <p className="screen-url">{joinUrl}</p>
        </div>
      )}

      {isChoice && (state.phase === "question" || state.phase === "reveal") && state.question && (
        <div className="screen-question-view">
          <p className="screen-progress">
            第{state.questionNumber}問 / {state.totalQuestions}問（{state.question?.points ?? 1}点）
          </p>
          <h2 className="screen-question-text">{state.question.question_text}</h2>
          {state.question.image_path && (
            <img className="screen-question-image" src={state.question.image_path} alt="問題の画像" />
          )}
          <div className="screen-choice-grid">
            {(["A", "B", "C", "D"] as Choice[]).map((c) => {
              const key = `choice_${c.toLowerCase()}` as "choice_a" | "choice_b" | "choice_c" | "choice_d";
              const count = state.answerCounts?.[c] ?? 0;
              const isCorrect = state.phase === "reveal" && c === state.question!.correct_choice;
              return (
                <div key={c} className={`screen-choice-card${isCorrect ? " correct" : ""}`}>
                  <div className="screen-choice-label">
                    {c}. {state.question![key]}
                  </div>
                  <div className="screen-choice-count">{count}人</div>
                </div>
              );
            })}
          </div>
          {state.phase === "question" && (
            <p className="screen-answered-count">回答済み: {state.answeredCount ?? 0}人</p>
          )}
          {state.phase === "reveal" && (
            <p className="screen-reveal-text">
              正解は <strong>{state.question.correct_choice}</strong>！（正解者 {state.correctCount}人）
            </p>
          )}
        </div>
      )}

      {!isChoice && state.phase === "question" && state.question && (
        <div className="screen-question-view">
          <p className="screen-progress">
            第{state.questionNumber}問 / {state.totalQuestions}問（{state.question?.points ?? 1}点）
          </p>
          <h2 className="screen-question-text">{state.question.question_text}</h2>
          {state.question.image_path && (
            <img className="screen-question-image" src={state.question.image_path} alt="問題の画像" />
          )}
          <p className="screen-answered-count">回答済み: {state.answeredCount ?? 0}人</p>
        </div>
      )}

      {!isChoice && state.phase === "reveal" && state.question && (
        <div className="screen-question-view">
          <p className="screen-progress">
            第{state.questionNumber}問 / {state.totalQuestions}問（{state.question?.points ?? 1}点）
          </p>
          <h2 className="screen-question-text">{state.question.question_text}</h2>
          {state.question.image_path && (
            <img className="screen-question-image" src={state.question.image_path} alt="問題の画像" />
          )}
          {state.correctRevealed && (
            <p className="screen-reveal-text">
              正解: <strong>{state.correctAnswerText}</strong>（正解者 {state.correctCount}人）
            </p>
          )}
          <div className="screen-answer-list">
            {state.answers?.map((a, i) => (
              <div key={i} className={`screen-answer-card${a.isCorrect ? " correct" : ""}`}>
                <span className="screen-answer-nickname">{a.nickname}</span>
                <span className="screen-answer-text">{a.answerText ?? "(未回答)"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {state.phase === "finished" && state.ranking && (() => {
        const distinctRanks = Array.from(new Set(state.ranking.map((r) => r.rank))).sort((a, b) => a - b);
        const topRanks = distinctRanks.slice(0, 3); // 表示位置: 1位が一番上
        const revealOrder = [...topRanks].reverse(); // 発表順: 3位相当→2位相当→1位相当
        const rest = state.ranking.filter((r) => !topRanks.includes(r.rank));
        const revealStage = state.rankRevealStage ?? 0; // 管理者操作でサーバーが進める
        const shownRanks = new Set(revealOrder.slice(0, revealStage));

        return (
          <div className="screen-center">
            <h1 className="screen-title">最終ランキング</h1>
            <div className="screen-reveal-list">
              {topRanks.map((rank) => {
                const entries = state.ranking!.filter((r) => r.rank === rank);
                const isFirst = rank === 1;
                const shown = shownRanks.has(rank);
                return (
                  <div
                    key={rank}
                    className={`rank-reveal-item${isFirst ? " rank1" : ""}${shown ? " shown" : ""}`}
                  >
                    <div className={isFirst && shown ? "screen-rank-first" : "screen-rank-label"}>
                      {rank}位 {entries.map((e) => `${e.nickname}（${e.score}点）`).join(" / ")}
                    </div>
                  </div>
                );
              })}
            </div>
            {revealStage >= revealOrder.length && rest.length > 0 && (
              <ol className="screen-ranking screen-ranking-rest">
                {rest.map((r) => (
                  <li key={r.nickname}>
                    {r.rank}位 {r.nickname}（{r.score}点）
                  </li>
                ))}
              </ol>
            )}
          </div>
        );
      })()}
    </div>
  );
}
