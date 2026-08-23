import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import type { QuizSummary } from "../lib/types";

export default function QuizListPage() {
  const { username, logout } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setQuizzes(await api.listQuizzes());
  }

  useEffect(() => {
    reload().catch((err) => setError(err instanceof ApiError ? err.message : "読み込みに失敗しました"));
  }, []);

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.createQuiz(newTitle.trim());
      setNewTitle("");
      navigate(`/admin/quizzes/${id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "作成に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("このクイズを削除しますか？")) return;
    await api.deleteQuiz(id);
    await reload();
  }

  async function handleDuplicate(id: number) {
    await api.duplicateQuiz(id);
    await reload();
  }

  async function handleHost(quiz: QuizSummary) {
    if (quiz.question_count === 0) {
      setError("問題が1問もありません。編集画面で問題を追加してください");
      return;
    }
    setError(null);
    try {
      const { roomCode } = await api.createRoom(quiz.id);
      navigate(`/admin/room/${roomCode}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "開催に失敗しました");
    }
  }

  return (
    <div className="wide-page">
      <div className="top-bar">
        <h1>クイズ一覧</h1>
        <div>
          <span className="muted">{username} でログイン中</span>{" "}
          <button className="secondary" onClick={() => logout()}>
            ログアウト
          </button>
        </div>
      </div>

      <div className="card">
        <div className="field">
          <label htmlFor="newTitle">新しいクイズのタイトル</label>
          <input
            id="newTitle"
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="例: 新郎新婦クイズ"
          />
        </div>
        <button onClick={handleCreate} disabled={busy || !newTitle.trim()}>
          新規作成
        </button>
        <p className="muted">回答形式(4択/自由記述)は問題ごとに編集画面で選べます</p>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        {quizzes.length === 0 && <p className="muted">まだクイズがありません</p>}
        {quizzes.map((q) => (
          <div className="list-item" key={q.id}>
            <div>
              <div>{q.title}</div>
              <div className="muted">問題数: {q.question_count}問</div>
            </div>
            <div className="btn-row">
              <button className="secondary" onClick={() => navigate(`/admin/quizzes/${q.id}`)}>
                編集
              </button>
              <button className="secondary" onClick={() => handleDuplicate(q.id)}>
                複製
              </button>
              <button onClick={() => handleHost(q)}>クイズを開催する</button>
              <button className="danger" onClick={() => handleDelete(q.id)}>
                削除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
