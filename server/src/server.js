const http = require("http");
const { Server } = require("socket.io");
const { app } = require("./app");
const { env } = require("./config/env");
const { disconnectPrisma } = require("./config/prisma");
const { registerSockets } = require("./sockets");

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: env.clientUrl.split(",").map((origin) => origin.trim()),
    credentials: true,
  },
});

registerSockets(io);

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${env.port} is already in use. Stop the previous QuizRoom process before starting it again.`,
    );
    process.exit(1);
  }

  console.error("QuizRoom API server error:", error);
  process.exit(1);
});

server.listen(env.port, () => {
  console.log(`QuizRoom API is running on http://localhost:${env.port}`);
});

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Stopping QuizRoom API (${signal})...`);

  io.close();

  await Promise.race([
    new Promise((resolve) => server.close(resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  await disconnectPrisma();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
