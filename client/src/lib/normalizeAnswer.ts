// サーバー側(RoomManager.ts)と同じロジック。プレビュー画面で「一致した場合の見え方」を
// 事前確認できるようにするためだけに使う(実際の正誤判定は必ずサーバー側で行う)。
export function normalizeAnswer(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}
