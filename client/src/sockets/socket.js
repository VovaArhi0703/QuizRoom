import { io } from "socket.io-client";

export function createSocket() {
  const token = localStorage.getItem("quizroom_token");

  return io(import.meta.env.VITE_SOCKET_URL || "http://localhost:5000", {
    autoConnect: false,
    auth: {
      token,
    },
  });
}
