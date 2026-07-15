const path = require("path");
const express = require("express");
const cors = require("cors");
const { env } = require("./config/env");
const { getDatabasePoolStats } = require("./config/prisma");
const { getDatabaseRetryStats } = require("./utils/databaseRetry");
const { authRoutes } = require("./routes/auth.routes");
const { quizRoutes } = require("./routes/quiz.routes");
const { roomRoutes } = require("./routes/room.routes");
const { uploadRoutes } = require("./routes/upload.routes");
const { userRoutes } = require("./routes/user.routes");
const { errorMiddleware, notFoundMiddleware } = require("./middleware/error.middleware");

const app = express();
const corsOrigins = env.clientUrl.split(",").map((origin) => origin.trim());

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(path.resolve(__dirname, "..", env.uploadsDir)));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "quizroom-api",
    timestamp: new Date().toISOString(),
    databasePool: getDatabasePoolStats(),
    databaseRetry: getDatabaseRetryStats(),
    imageStorage: env.supabaseUrl && env.supabaseSecretKey ? "configured" : "not-configured",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/profile", userRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = { app };
