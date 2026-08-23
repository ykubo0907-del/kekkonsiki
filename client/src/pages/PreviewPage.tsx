import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import QRCodeImage from "../components/QRCodeImage";
import { api, ApiError } from "../lib/api";
import { normalizeAnswer } from "../lib/normalizeAnswer";
import type { Choice, QuestionRow, QuizDetail } from "../lib/types";

type PreviewPhase = "waiting" | "question" | "reveal" | "finished";

const MOCK_RANKING = [
  { rank: 1, nickname: "ゲスト1(例)", score: 9 },
  { rank: 2, nickname: "ゲスト2(例)", score: 7 },
  { rank: 3, nickname: "ゲスト3(例)", score: 7 },
];

const MOCK_OTHER_ANSWERS = ["ゲストA(例)", "ゲストB(例)"];

// 本番のRoomManagerには一切触れず、クライアント側だけで画面遷移を模擬する。
// 本番開催の状態とは完全に独立しているため、実際の参加者やルームに影響しない。
export default function PreviewPage() {
  const { id } = useParams<{ id: string }>();
  const quizId = Number(id);
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<"guest" | "screen">("guest");
  const [phase, setPhase] = useState<PreviewPhase>("waiting");
  const [index, setIndex] = useState(0);
  const [simulatedChoice, setSimulatedChoice] = useState<Choice | null>(null);
  const [simulatedAnswer, setSimulatedAnswer] = useState("");

  useEffect(() => {
    api
      .getQuiz(quizId)
      .then(setQuiz)
      .catch((err) => setError(err instanceof ApiError ? err.message : "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, [quizId]);

  if (loading) return <div className="wide-page">読み込み中...</div>;
  if (error || !quiz) {
    return (
      <div className="wide-page">
        <p className="error-text">{error ?? "クイズが見つかりません"}</p>
        <button className="secondary" onClick={() => navigate(`/admin/quizzes/${quizId}`)}>
          編集画面に戻る
        </button>
      </div>
    );
  }

  const questions = [...quiz.questions].sort((a, b) => a.order_index - b.order_index);
  const question: QuestionRow | undefined = questions[index];
  const isChoice = question?.question_type === "choice";
  const joinUrl = `${window.location.origin}/play/PREVIEW`;
  const isMatch = question
    ? normalizeAnswer(simulatedAnswer) === normalizeAnswer(question.correct_answer_text ?? "")
    : false;

  function reset() {
    setPhase("waiting");
    setIndex(0);
    setSimulatedChoice(null);
    setSimulatedAnswer("");
  }

  function handleNext() {
    if (phase === "waiting") {
      setPhase("question");
      setSimulatedChoice(null);
      setSimulatedAnswer("");
    } else if (phase === "reveal") {
      if (index >= questions.length - 1) {
        setPhase("finished");
      } else {
        setIndex((i) => i + 1);
        setPhase("question");
        setSimulatedChoice(null);
        setSimulatedAnswer("");
      }
    }
  }

  function handleReveal() {
    if (phase === "question") setPhase("reveal");
  }

  return (
    <div className="wide-page">
      <div className="top-bar">
        <h1>プレビュー: {quiz.title}</h1>
        <button className="secondary" onClick={() => navigate(`/admin/quizzes/${quizId}`)}>
          編集画面に戻る
        </button>
      </div>

      <div className="card">
        <p className="muted">
          これは本番開催とは独立したプレビューです。ここでの操作は実際の参加者には送信されません。
        </p>
        <div className="btn-row">
          <button className={viewMode === "guest" ? "" : "secondary"} onClick={() => setViewMode("guest")}>
            ゲスト画面
          </button>
          <button className={viewMode === "screen" ? "" : "secondary"} onClick={() => setViewMode("screen")}>
            会場スクリーン画面
          </button>
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          {(phase === "waiting" || phase === "reveal") && questions.length > 0 && (
            <button onClick={handleNext}>
              {phase === "reveal" && index >= questions.length - 1 ? "結果を見る" : "次の問題へ"}
            </button>
          )}
          {phase === "question" && (
            <button onClick={handleReveal}>{isChoice ? "正解発表" : "みんなの回答を表示"}</button>
          )}
          {phase !== "waiting" && (
            <button className="secondary" onClick={reset}>
              最初から
            </button>
          )}
        </div>
        {questions.length === 0 && (
          <p className="error-text">問題が1問もないため、プレビューは待機画面のみ表示されます</p>
        )}
      </div>

      <div className="card">
        {viewMode === "guest" ? (
          <div className="page" style={{ padding: 0 }}>
            <h2>{quiz.title}</h2>
            {phase === "waiting" && (
              <div>
                <p>クイズの開始をお待ちください</p>
                <p className="muted">現在の参加者数: 0人(プレビュー)</p>
              </div>
            )}
            {isChoice && (phase === "question" || phase === "reveal") && question && (
              <div>
                <p className="muted">
                  第{index + 1}問 / {questions.length}問（{question?.points ?? 1}点）
                </p>
                <p>{question.question_text}</p>
                {question.image_path && (
                  <img className="question-image" src={question.image_path} alt="問題の画像" />
                )}
                <div className="choice-grid">
                  {(["A", "B", "C", "D"] as Choice[]).map((c) => {
                    const key = `choice_${c.toLowerCase()}` as "choice_a" | "choice_b" | "choice_c" | "choice_d";
                    let className = "choice-btn";
                    if (phase === "reveal") {
                      if (c === question.correct_choice) className += " correct";
                      else if (c === simulatedChoice) className += " incorrect";
                    } else if (c === simulatedChoice) {
                      className += " selected";
                    }
                    return (
                      <button
                        key={c}
                        className={className}
                        disabled={phase === "reveal"}
                        onClick={() => setSimulatedChoice(c)}
                      >
                        {c}. {question[key]}
                      </button>
                    );
                  })}
                </div>
                <p className="muted">(選択肢をクリックすると回答時の見え方を確認できます)</p>
                {phase === "reveal" && (
                  <p>
                    正解は <strong>{question.correct_choice}</strong> でした！
                  </p>
                )}
              </div>
            )}
            {!isChoice && phase === "question" && question && (
              <div>
                <p className="muted">
                  第{index + 1}問 / {questions.length}問（{question?.points ?? 1}点）
                </p>
                <p>{question.question_text}</p>
                {question.image_path && (
                  <img className="question-image" src={question.image_path} alt="問題の画像" />
                )}
                <div className="field">
                  <input
                    type="text"
                    value={simulatedAnswer}
                    onChange={(e) => setSimulatedAnswer(e.target.value)}
                    placeholder="回答を入力(プレビュー用)"
                  />
                </div>
                <p className="muted">(実際に入力すると回答時の見え方を確認できます)</p>
              </div>
            )}
            {!isChoice && phase === "reveal" && question && (
              <div>
                <p className="muted">
                  第{index + 1}問 / {questions.length}問（{question?.points ?? 1}点）
                </p>
                <p>{question.question_text}</p>
                <p>
                  正解: <strong>{question.correct_answer_text}</strong>
                </p>
                <p>
                  あなたの回答: 「{simulatedAnswer || "(未回答)"}」
                  {isMatch ? " 正解です🎉" : ""}
                </p>
              </div>
            )}
            {phase === "finished" && (
              <div>
                <h3>最終ランキング(例)</h3>
                <ol>
                  {MOCK_RANKING.map((r) => (
                    <li key={r.nickname}>
                      {r.rank}位 {r.nickname}（{r.score}点）
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ) : (
          <div className="screen-page" style={{ minHeight: 480, borderRadius: 12 }}>
            {phase === "waiting" && (
              <div className="screen-center">
                <h1 className="screen-title">WEDDING QUIZ</h1>
                <p className="screen-participant-count">現在の参加者: 0人(プレビュー)</p>
                <p className="screen-join-hint">スマホでQRコードを読み取って参加してください</p>
                <div className="screen-qr">
                  <QRCodeImage value={joinUrl} size={180} />
                </div>
                <p className="screen-url">(プレビュー用のダミーURLです)</p>
              </div>
            )}
            {isChoice && (phase === "question" || phase === "reveal") && question && (
              <div className="screen-question-view">
                <p className="screen-progress">
                  第{index + 1}問 / {questions.length}問（{question?.points ?? 1}点）
                </p>
                <h2 className="screen-question-text">{question.question_text}</h2>
                {question.image_path && (
                  <img className="screen-question-image" src={question.image_path} alt="問題の画像" />
                )}
                <div className="screen-choice-grid">
                  {(["A", "B", "C", "D"] as Choice[]).map((c) => {
                    const key = `choice_${c.toLowerCase()}` as "choice_a" | "choice_b" | "choice_c" | "choice_d";
                    const isCorrect = phase === "reveal" && c === question.correct_choice;
                    return (
                      <div key={c} className={`screen-choice-card${isCorrect ? " correct" : ""}`}>
                        <div className="screen-choice-label">
                          {c}. {question[key]}
                        </div>
                        <div className="screen-choice-count">0人</div>
                      </div>
                    );
                  })}
                </div>
                {phase === "reveal" && (
                  <p className="screen-reveal-text">
                    正解は <strong>{question.correct_choice}</strong>！
                  </p>
                )}
              </div>
            )}
            {!isChoice && phase === "question" && question && (
              <div className="screen-question-view">
                <p className="screen-progress">
                  第{index + 1}問 / {questions.length}問（{question?.points ?? 1}点）
                </p>
                <h2 className="screen-question-text">{question.question_text}</h2>
                {question.image_path && (
                  <img className="screen-question-image" src={question.image_path} alt="問題の画像" />
                )}
                <p className="screen-answered-count">回答済み: {simulatedAnswer ? 1 : 0}人(プレビュー)</p>
              </div>
            )}
            {!isChoice && phase === "reveal" && question && (
              <div className="screen-question-view">
                <p className="screen-progress">
                  第{index + 1}問 / {questions.length}問（{question?.points ?? 1}点）
                </p>
                <h2 className="screen-question-text">{question.question_text}</h2>
                <p className="screen-reveal-text">
                  正解: <strong>{question.correct_answer_text}</strong>
                </p>
                <div className="screen-answer-list">
                  {MOCK_OTHER_ANSWERS.map((name) => (
                    <div key={name} className="screen-answer-card">
                      <span className="screen-answer-nickname">{name}</span>
                      <span className="screen-answer-text">(例)</span>
                    </div>
                  ))}
                  {simulatedAnswer && (
                    <div className={`screen-answer-card${isMatch ? " correct" : ""}`}>
                      <span className="screen-answer-nickname">あなた</span>
                      <span className="screen-answer-text">{simulatedAnswer}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {phase === "finished" && (
              <div className="screen-center">
                <h1 className="screen-title">最終ランキング(例)</h1>
                <ol className="screen-ranking">
                  {MOCK_RANKING.map((r) => (
                    <li key={r.nickname} className={r.rank === 1 ? "screen-rank-first" : ""}>
                      {r.rank}位 {r.nickname}（{r.score}点）
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
