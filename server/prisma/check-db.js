const { Client } = require("pg");
require("dotenv").config();

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: false,
  });

  await client.connect();
  const result = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  );
  await client.end();

  console.log(result.rows);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
