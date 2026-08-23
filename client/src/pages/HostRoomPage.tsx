import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ConnectionBanner from "../components/ConnectionBanner";
import { api, ApiError } from "../lib/api";
import type { RoomState } from "../lib/types";
import { useRoomSocket } from "../lib/useRoomSocket";

// リアルタイム更新はSocket.IOが担うため、これは通信不安定時の保険としてのみ機能する
const FALLBACK_POLL_INTERVAL_MS = 8000;

export default function HostRoomPage() {
  const { code } = useParams<{ code: string }>();
  const roomCode = code!;
  const navigate = useNavigate();

  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await api.getRoomState(roomCode);
      setState(s);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "状態の取得に失敗しました");
    }
  }, [roomCode]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, FALLBACK_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const { connected } = useRoomSocket(roomCode, refresh);

  async function handleNext() {
    setBusy(true);
    try {
      await api.nextQuestion(roomCode);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "操作に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleReveal() {
    setBusy(true);
    try {
      await api.revealAnswer(roomCode);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "操作に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevealCorrect() {
    setBusy(true);
    try {
      await api.revealCorrectAnswer(roomCode);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "操作に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdvanceRank() {
    setBusy(true);
    try {
      await api.advanceRankReveal(roomCode);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "操作に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    if (!confirm("ルームを閉じますか？参加者のデータは全て破棄されます")) return;
    await api.closeRoom(roomCode);
    navigate("/admin");
  }

  const joinUrl = `${window.location.origin}/play/${roomCode}`;

  if (error && !state) {
    return (
      <div className="page">
        <p className="error-text">{error}</p>
        <button className="secondary" onClick={() => navigate("/admin")}>
          一覧に戻る
        </button>
      </div>
    );
  }
  if (!state) return <div className="page">読み込み中...</div>;

  return (
    <div className="wide-page">
      <ConnectionBanner connected={connected} />
      <div className="top-bar">
        <h1>{state.title}</h1>
        <button className="danger" onClick={handleClose}>
          ルームを閉じる
        </button>
      </div>

      <div className="card">
        <p className="muted">参加用URL(ゲストはこのURLにアクセス)</p>
        <p className="room-code">{roomCode}</p>
        <p className="muted" style={{ wordBreak: "break-all" }}>
          {joinUrl}
        </p>
        <p>現在の参加者数: {state.participantCount}人</p>
        <a href={`/screen/${roomCode}`} target="_blank" rel="noreferrer">
          会場スクリーンを別タブで開く
        </a>
      </div>

      <div className="card">
        <p>
          状態: <strong>{phaseLabel(state.phase)}</strong>
          {state.phase !== "waiting" && ` (第${state.questionNumber}問/${state.totalQuestions}問)`}
        </p>

        {state.question && (
          <div>
            <p>{state.question.question_text}</p>
            <p className="muted">回答済み: {state.answeredCount ?? 0}人</p>
            {state.questionType === "choice" ? (
              <>
                {state.answerCounts && (
                  <ul>
                    <li>A: {state.answerCounts.A}人</li>
                    <li>B: {state.answerCounts.B}人</li>
                    <li>C: {state.answerCounts.C}人</li>
                    <li>D: {state.answerCounts.D}人</li>
                  </ul>
                )}
                {state.phase === "reveal" && (
                  <p>
                    正解: <strong>{state.question.correct_choice}</strong>（正解者 {state.correctCount}人）
                  </p>
                )}
              </>
            ) : (
              state.phase === "reveal" && (
                <>
                  {state.correctRevealed ? (
                    <p>
                      正解: <strong>{state.correctAnswerText}</strong>（正解者 {state.correctCount}人）
                    </p>
                  ) : (
                    <p className="muted">「正解を発表」を押すと、新郎新婦の回答と一致した人がハイライトされます</p>
                  )}
                  <ul className="answer-list">
                    {state.answers?.map((a, i) => (
                      <li key={i} className={a.isCorrect ? "answer-correct" : ""}>
                        {a.nickname}: {a.answerText ?? "(未回答)"}
                      </li>
                    ))}
                  </ul>
                </>
              )
            )}
          </div>
        )}

        {state.phase === "finished" && state.ranking && (() => {
          const revealStage = state.rankRevealStage ?? 0;
          const revealMax = state.rankRevealMax ?? 0;
          const distinctRanks = Array.from(new Set(state.ranking.map((r) => r.rank))).sort((a, b) => a - b);
          const topRanks = distinctRanks.slice(0, 3);
          const stagingOrder = [...topRanks].reverse();
          const revealedRanks = new Set(stagingOrder.slice(0, revealStage));

          return (
            <div>
              <h2>最終ランキング</h2>
              <p className="muted">
                会場スクリーンで順位を発表します。「次の順位を発表」を押すたびに、3位→2位→1位の順に表示されます。
              </p>
              <ol>
                {state.ranking.map((r) => (
                  <li key={r.nickname}>
                    {topRanks.includes(r.rank) && !revealedRanks.has(r.rank) ? (
                      <span className="muted">{r.rank}位 (未発表)</span>
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

        <div className="btn-row">
          {state.phase === "waiting" && (
            <button onClick={handleNext} disabled={busy}>
              次の問題へ
            </button>
          )}
          {state.phase === "reveal" && (state.questionType === "choice" || state.correctRevealed) && (
            <button onClick={handleNext} disabled={busy}>
              {state.questionNumber >= state.totalQuestions ? "結果を見る" : "次の問題へ"}
            </button>
          )}
          {state.phase === "question" && (
            <button onClick={handleReveal} disabled={busy}>
              {state.questionType === "choice" ? "正解発表" : "みんなの回答を表示"}
            </button>
          )}
          {state.phase === "reveal" && state.questionType === "freetext" && !state.correctRevealed && (
            <button onClick={handleRevealCorrect} disabled={busy}>
              正解を発表
            </button>
          )}
          {state.phase === "finished" && (
            <button
              onClick={handleAdvanceRank}
              disabled={busy || (state.rankRevealStage ?? 0) >= (state.rankRevealMax ?? 0)}
            >
              {(state.rankRevealStage ?? 0) >= (state.rankRevealMax ?? 0)
                ? "発表完了"
                : `次の順位を発表 (${state.rankRevealStage ?? 0}/${state.rankRevealMax ?? 0})`}
            </button>
          )}
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

function phaseLabel(phase: RoomState["phase"]): string {
  switch (phase) {
    case "waiting":
      return "待機中";
    case "question":
      return "回答受付中";
    case "reveal":
      return "回答表示中";
    case "finished":
      return "終了";
  }
}
