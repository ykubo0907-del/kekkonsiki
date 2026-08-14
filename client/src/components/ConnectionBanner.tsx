export default function ConnectionBanner({ connected }: { connected: boolean }) {
  if (connected) return null;
  return <div className="connection-banner">通信中です… 再接続しています</div>;
}
