const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");
const { Pool } = require("pg");
const { env } = require("./env");

const databaseUrl = new URL(env.databaseUrl);
const isLocalDatabase = ["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname);
const useSsl = env.databaseSsl === "true" || (env.databaseSsl === "auto" && !isLocalDatabase);

databaseUrl.searchParams.set("application_name", "quizroom-api");
databaseUrl.searchParams.set("connect_timeout", "10");

const pool = new Pool({
  connectionString: databaseUrl.toString(),
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  // Supabase's shared pool is the scarce resource. A single API process does not
  // need multiple permanent database sessions for this MVP; requests wait in
  // this local pool instead of opening more remote connections.
  max: 1,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 10_000,
  query_timeout: 15_000,
  options: "-c statement_timeout=15000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=10000",
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  allowExitOnIdle: true,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.message);
});

const adapter = new PrismaPg(pool, {
  disposeExternalPool: true,
});

const prisma = new PrismaClient({
  adapter,
});

async function disconnectPrisma() {
  let timeoutId;
  const disconnect = prisma.$disconnect().then(
    () => true,
    (error) => {
      console.warn("Could not close the PostgreSQL pool cleanly:", error.message);
      return true;
    },
  );
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(false), 2_500);
  });
  const didDisconnect = await Promise.race([disconnect, timeout]);
  clearTimeout(timeoutId);

  if (!didDisconnect) {
    console.warn("PostgreSQL pool shutdown timed out; the process will release it on exit.");
  }
}

function getDatabasePoolStats() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

module.exports = { disconnectPrisma, getDatabasePoolStats, prisma };
