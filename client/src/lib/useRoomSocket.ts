import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

// サーバーは状態そのものを配信せず「更新があった」という合図のみ送ってくる。
// 合図を受けたら呼び出し側が REST の状態取得(refresh)を実行する。
// 接続時・再接続時にも購読し直した上で必ず一度refreshするため、
// 通信断からの復帰時も「取りこぼしなく最新状態を取得する」動きになる。
// 戻り値のconnectedは「通信中です」等のバナー表示に使う。
export function useRoomSocket(roomCode: string, onUpdate: () => void): { connected: boolean } {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket: Socket = io({ transports: ["websocket", "polling"] });

    function subscribeAndRefresh() {
      setConnected(true);
      socket.emit("subscribe", roomCode);
      callbackRef.current();
    }

    socket.on("connect", subscribeAndRefresh);
    socket.on("disconnect", () => setConnected(false));
    socket.on("update", () => callbackRef.current());

    return () => {
      socket.emit("unsubscribe", roomCode);
      socket.disconnect();
    };
  }, [roomCode]);

  return { connected };
}
