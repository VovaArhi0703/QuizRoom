const TRANSIENT_DATABASE_MESSAGES = [
  "max client connections reached",
  "connection terminated",
  "connection timeout",
  "server has closed the connection",
  "can't reach database server",
  "connection refused",
  "query read timeout",
  "query timeout",
  "statement timeout",
  "lock timeout",
  "canceling statement due to statement timeout",
  "canceling statement due to lock timeout",
  "timeout exceeded",
  "econnreset",
  "etimedout",
];

const TRANSIENT_DATABASE_CODES = new Set([
  "DATABASE_COOLDOWN",
  "DATABASE_QUEUE_TIMEOUT",
  "P1001",
  "P1017",
  "ECONNRESET",
  "ETIMEDOUT",
  "EMAXCONN",
  "57014",
  "55P03",
]);

const DATABASE_COOLDOWN_MS = 5_000;
const DATABASE_QUEUE_TIMEOUT_MS = 15_000;
let unavailableUntil = 0;
let lastTransientError = null;
let databaseQueue = Promise.resolve();
let activeOperations = 0;
let queuedOperations = 0;

function createCooldownError() {
  const error = new Error("Database connection is cooling down after a temporary failure");
  error.code = "DATABASE_COOLDOWN";
  error.cause = lastTransientError;
  return error;
}

function isTransientDatabaseError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  const code = error?.code || error?.cause?.code || error?.meta?.code;

  return TRANSIENT_DATABASE_CODES.has(code) || TRANSIENT_DATABASE_MESSAGES.some((item) => message.includes(item));
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function openCooldown(error) {
  lastTransientError = error;
  unavailableUntil = Date.now() + DATABASE_COOLDOWN_MS;
}

async function runQueued(operation) {
  const queuedAt = Date.now();
  const previousOperation = databaseQueue;
  let releaseQueue;

  databaseQueue = new Promise((resolve) => {
    releaseQueue = resolve;
  });
  queuedOperations += 1;

  await previousOperation;
  queuedOperations -= 1;
  activeOperations = 1;

  try {
    if (Date.now() < unavailableUntil) {
      throw createCooldownError();
    }

    if (Date.now() - queuedAt > DATABASE_QUEUE_TIMEOUT_MS) {
      const error = new Error("Database request waited too long in the local queue");
      error.code = "DATABASE_QUEUE_TIMEOUT";
      openCooldown(error);
      throw error;
    }

    return await operation();
  } finally {
    activeOperations = 0;
    releaseQueue();
  }
}

async function withDatabaseRetry(operation, options = {}) {
  if (Date.now() < unavailableUntil) {
    throw createCooldownError();
  }

  return runQueued(async () => {
    const attempts = Math.min(options.attempts || 2, 2);
    const baseDelayMs = options.baseDelayMs || 400;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const result = await operation();
        unavailableUntil = 0;
        lastTransientError = null;
        return result;
      } catch (error) {
        if (!isTransientDatabaseError(error) || attempt === attempts) {
          if (isTransientDatabaseError(error)) {
            openCooldown(error);
          }

          throw error;
        }

        const jitter = Math.floor(Math.random() * 150);
        await wait(Math.min(baseDelayMs * 2 ** (attempt - 1) + jitter, 1_500));
      }
    }

    return undefined;
  });
}

function getDatabaseRetryStats() {
  return {
    coolingDown: Date.now() < unavailableUntil,
    retryAfterMs: Math.max(0, unavailableUntil - Date.now()),
    activeOperations,
    queuedOperations,
  };
}

module.exports = { getDatabaseRetryStats, isTransientDatabaseError, withDatabaseRetry };
