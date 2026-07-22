import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "migrations");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  const pool = new pg.Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query(
      `create table if not exists _migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`,
    );
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      const { rows } = await client.query("select 1 from _migrations where name = $1", [file]);
      if (rows.length > 0) {
        console.log(`skip (already applied): ${file}`);
        continue;
      }
      const sqlText = readFileSync(join(migrationsDir, file), "utf8");
      console.log(`applying: ${file}`);
      await client.query("begin");
      try {
        await client.query(sqlText);
        await client.query("insert into _migrations (name) values ($1)", [file]);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
    }
    console.log("migrations up to date");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
