const { Client } = require("pg");
require("dotenv").config();

async function main() {
  const sessionUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
  const client = new Client({
    connectionString: sessionUrl,
    ssl: false,
  });

  await client.connect();
  const result = await client.query(`
    select pid, state, wait_event_type, wait_event, left(query, 90) as query
    from pg_stat_activity
    where datname = current_database()
    order by pid
  `);
  await client.end();

  console.table(result.rows);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
