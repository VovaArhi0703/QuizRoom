const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
require("dotenv").config();

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, "init.sql"), "utf8");
  const statements = sql
    .split(/\n(?=DO \$\$|CREATE TABLE|CREATE INDEX|CREATE UNIQUE INDEX)/)
    .map((statement) => statement.trim())
    .filter(Boolean)
    .filter((statement) => !statement.startsWith("DO $$"));
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: false,
  });
  client.on("error", (error) => {
    console.error("PostgreSQL client error:", error.message);
  });

  await client.connect();
  for (const [index, statement] of statements.entries()) {
    console.log(`Running statement ${index + 1}/${statements.length}`);
    await client.query(statement);
  }
  await client.end();

  console.log("Database schema initialized");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
