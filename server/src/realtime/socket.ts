import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { roomEvents } from "../rooms/RoomManager.js";

// Socket.IOは「状態そのもの」を配信するのではなく、
// 「ルームの状態が変わったので再取得してください」という軽量な合図のみを送る。
// 実際の状態組み立ては既存の REST (/api/rooms/:code/state) の
// RoomManager#getPublicState に一本化し、二重管理を避ける。
// これにより再接続時の復帰も通常の更新と全く同じ経路(再取得)で処理できる。

export function setupRealtime(httpServer: HttpServer, clientOrigin: string) {
  const io = new Server(httpServer, {
    cors: { origin: clientOrigin, credentials: true },
  });

  io.on("connection", (socket) => {
    socket.on("subscribe", (roomCode: unknown) => {
      if (typeof roomCode !== "string" || !roomCode) return;
      socket.join(roomCode.toUpperCase());
    });

    socket.on("unsubscribe", (roomCode: unknown) => {
      if (typeof roomCode !== "string" || !roomCode) return;
      socket.leave(roomCode.toUpperCase());
    });
  });

  roomEvents.on("update", (roomCode: string) => {
    io.to(roomCode).emit("update");
  });

  return io;
}
