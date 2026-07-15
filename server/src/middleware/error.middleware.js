const { env } = require("../config/env");
const { isTransientDatabaseError } = require("../utils/databaseRetry");

function notFoundMiddleware(req, _res, next) {
  const error = new Error(`Route ${req.method} ${req.originalUrl} was not found`);
  error.status = 404;
  next(error);
}

function errorMiddleware(error, req, res, _next) {
  if (req.originalUrl.startsWith("/api/auth/google/callback") && !res.headersSent) {
    const callbackUrl = new URL("/auth/callback", env.clientUrl.split(",")[0]);
    const message = isTransientDatabaseError(error)
      ? "База данных временно перегружена. Попробуйте войти ещё раз через несколько секунд."
      : error.message || "Не удалось завершить вход через Google";

    callbackUrl.searchParams.set("error", message);
    res.redirect(callbackUrl.toString());
    return;
  }

  if (isTransientDatabaseError(error)) {
    console.error(`[database] ${req.method} ${req.originalUrl}:`, error.stack || error.message);
    res.status(503).json({
      message: "База данных временно перегружена. Подождите несколько секунд и попробуйте снова.",
    });
    return;
  }

  const status = error.status || (error.name === "MulterError" ? 400 : 500);

  res.status(status).json({
    message: error.message || "Internal server error",
  });
}

module.exports = { errorMiddleware, notFoundMiddleware };
