import QRCode from "qrcode";
import { useEffect, useState } from "react";

// 会場のネット環境に依存しないよう、外部サービスを使わずブラウザ内でQR画像を生成する
export default function QRCodeImage({ value, size = 260 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) return null;
  return <img src={dataUrl} width={size} height={size} alt="参加用QRコード" />;
}
