import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { resizeImageFile } from "../lib/imageResize";
import type { Choice, QuestionInput, QuestionType } from "../lib/types";

const MAX_QUESTIONS = 30;

function emptyQuestion(orderIndex: number, type: QuestionType, points = 1): QuestionInput {
  if (type === "choice") {
    return {
      order_index: orderIndex,
      question_type: "choice",
      question_text: "",
      choice_a: "",
      choice_b: "",
      choice_c: "",
      choice_d: "",
      correct_choice: "A",
      points,
    };
  }
  return {
    order_index: orderIndex,
    question_type: "freetext",
    question_text: "",
    correct_answer_text: "",
    points,
  };
}

export default function QuizEditPage() {
  const { id } = useParams<{ id: string }>();
  const quizId = Number(id);
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<QuestionInput[]>([]);
  // order_index -> 保存済みか(画像はDBの問題行にひもづくため、未保存の問題には添付できない)
  const [savedIndexes, setSavedIndexes] = useState<Set<number>>(new Set());
  const [images, setImages] = useState<(string | null)[]>([]);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadQuiz = useCallback(async () => {
    const quiz = await api.getQuiz(quizId);
    setTitle(quiz.title);
    const sorted = [...quiz.questions].sort((a, b) => a.order_index - b.order_index);
    const loaded: QuestionInput[] =
      sorted.length > 0
        ? sorted.map((found, i) => ({
            order_index: i,
            question_type: found.question_type,
            question_text: found.question_text,
            choice_a: found.choice_a ?? undefined,
            choice_b: found.choice_b ?? undefined,
            choice_c: found.choice_c ?? undefined,
            choice_d: found.choice_d ?? undefined,
            correct_choice: found.correct_choice ?? undefined,
            correct_answer_text: found.correct_answer_text ?? undefined,
            points: found.points,
          }))
        : [emptyQuestion(0, "choice")];
    setQuestions(loaded);
    setImages(sorted.length > 0 ? sorted.map((q) => q.image_path) : [null]);
    setSavedIndexes(new Set(sorted.map((_, i) => i)));
  }, [quizId]);

  useEffect(() => {
    loadQuiz()
      .catch((err) => setError(err instanceof ApiError ? err.message : "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, [loadQuiz]);

  function updateQuestion(index: number, patch: Partial<QuestionInput>) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function handleQuestionTypeChange(index: number, type: QuestionType) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === index ? { ...emptyQuestion(q.order_index, type, q.points), question_text: q.question_text } : q,
      ),
    );
  }

  function handleAddQuestion() {
    setQuestions((prev) => [...prev, emptyQuestion(prev.length, "choice")]);
    setImages((prev) => [...prev, null]);
  }

  function handleRemoveQuestion(index: number) {
    if (!confirm(`第${index + 1}問を削除しますか？`)) return;
    setQuestions((prev) => prev.filter((_, i) => i !== index).map((q, i) => ({ ...q, order_index: i })));
    setImages((prev) => prev.filter((_, i) => i !== index));
    // 削除後は問題番号がずれるため、保存し直すまで画像添付を一旦不可にする(誤った問題に画像が紐付くのを防ぐ)
    setSavedIndexes(new Set());
  }

  const allFilled = questions.every((q) =>
    q.question_type === "choice"
      ? q.question_text.trim() &&
        q.choice_a?.trim() &&
        q.choice_b?.trim() &&
        q.choice_c?.trim() &&
        q.choice_d?.trim()
      : q.question_text.trim() && q.correct_answer_text?.trim(),
  );

  async function handleSaveTitle() {
    setError(null);
    try {
      await api.updateQuizTitle(quizId, title);
      setMessage("タイトルを保存しました");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "保存に失敗しました");
    }
  }

  async function handleSaveQuestions() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.saveQuestions(quizId, questions);
      await loadQuiz();
      setMessage("問題を保存しました");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleImageSelect(index: number, file: File) {
    setUploadingIndex(index);
    setError(null);
    try {
      const dataUrl = await resizeImageFile(file);
      const { image_path } = await api.uploadQuestionImage(quizId, index, dataUrl);
      setImages((prev) => prev.map((v, i) => (i === index ? image_path : v)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "画像のアップロードに失敗しました");
    } finally {
      setUploadingIndex(null);
    }
  }

  async function handleImageRemove(index: number) {
    setError(null);
    try {
      await api.deleteQuestionImage(quizId, index);
      setImages((prev) => prev.map((v, i) => (i === index ? null : v)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "画像の削除に失敗しました");
    }
  }

  if (loading) return <div className="wide-page">読み込み中...</div>;

  return (
    <div className="wide-page">
      <div className="top-bar">
        <h1>クイズ編集</h1>
        <div className="btn-row">
          <button className="secondary" onClick={() => navigate(`/admin/quizzes/${quizId}/preview`)}>
            プレビュー
          </button>
          <button className="secondary" onClick={() => navigate("/admin")}>
            一覧に戻る
          </button>
        </div>
      </div>

      <div className="card">
        <div className="field">
          <label htmlFor="title">クイズタイトル</label>
          <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <button onClick={handleSaveTitle}>タイトルを保存</button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      {questions.map((q, i) => (
        <div className="card" key={i}>
          <div className="top-bar">
            <strong>第{i + 1}問</strong>
            <button type="button" className="danger" onClick={() => handleRemoveQuestion(i)}>
              この問題を削除
            </button>
          </div>
          <div className="field">
            <label>回答形式</label>
            <div className="btn-row">
              <button
                type="button"
                className={q.question_type === "choice" ? "" : "secondary"}
                onClick={() => handleQuestionTypeChange(i, "choice")}
              >
                4択
              </button>
              <button
                type="button"
                className={q.question_type === "freetext" ? "" : "secondary"}
                onClick={() => handleQuestionTypeChange(i, "freetext")}
              >
                自由記述
              </button>
            </div>
          </div>
          <div className="field">
            <label>配点</label>
            <input
              type="number"
              min={1}
              max={100}
              value={q.points}
              onChange={(e) => updateQuestion(i, { points: Math.max(1, Number(e.target.value) || 1) })}
              style={{ width: 100 }}
            />
            <p className="muted">簡単な問題は1点、難しい問題は3点など自由に設定できます</p>
          </div>
          <div className="field">
            <label>問題文</label>
            <input
              type="text"
              value={q.question_text}
              onChange={(e) => updateQuestion(i, { question_text: e.target.value })}
            />
          </div>

          {q.question_type === "choice" ? (
            <>
              {(["A", "B", "C", "D"] as Choice[]).map((c) => {
                const key = `choice_${c.toLowerCase()}` as keyof QuestionInput;
                return (
                  <div className="field" key={c}>
                    <label>選択肢{c}</label>
                    <input
                      type="text"
                      value={(q[key] as string) ?? ""}
                      onChange={(e) => updateQuestion(i, { [key]: e.target.value } as Partial<QuestionInput>)}
                    />
                  </div>
                );
              })}
              <div className="field">
                <label>正解</label>
                <div className="btn-row">
                  {(["A", "B", "C", "D"] as Choice[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={q.correct_choice === c ? "" : "secondary"}
                      onClick={() => updateQuestion(i, { correct_choice: c })}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="field">
              <label>正解(新郎新婦の実際の回答)</label>
              <input
                type="text"
                value={q.correct_answer_text ?? ""}
                onChange={(e) => updateQuestion(i, { correct_answer_text: e.target.value })}
                placeholder="例: らーめん"
              />
              <p className="muted">
                ひらがな・カタカナの違いは自動で吸収されます(「ラーメン」でも「らーめん」でも一致とみなされます)
              </p>
            </div>
          )}

          <div className="field">
            <label>問題画像(任意)</label>
            {!savedIndexes.has(i) ? (
              <p className="muted">先にこの問題を保存すると画像を添付できます</p>
            ) : (
              <>
                {images[i] && (
                  <div>
                    <img src={images[i]!} alt={`第${i + 1}問の画像`} style={{ maxWidth: 200, borderRadius: 8 }} />
                    <div>
                      <button type="button" className="secondary" onClick={() => handleImageRemove(i)}>
                        画像を削除
                      </button>
                    </div>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingIndex === i}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageSelect(i, file);
                    e.target.value = "";
                  }}
                />
                {uploadingIndex === i && <span className="muted">アップロード中...</span>}
              </>
            )}
          </div>
        </div>
      ))}

      <div className="card">
        <button type="button" onClick={handleAddQuestion} disabled={questions.length >= MAX_QUESTIONS}>
          + 問題を追加
        </button>
        <p className="muted">
          現在{questions.length}問(最大{MAX_QUESTIONS}問まで)
        </p>
      </div>

      <button onClick={handleSaveQuestions} disabled={!allFilled || saving}>
        {questions.length}問すべて保存
      </button>
      {!allFilled && <p className="muted">全ての問題文・正解を入力すると保存できます</p>}
    </div>
  );
}
