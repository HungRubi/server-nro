import { pool } from "../db/pool.js";

async function main() {
  const [rows] = await pool.query("SELECT 1 AS ok");
  console.log("[db:ping] OK", rows);
  await pool.end();
}

main().catch((err) => {
  console.error("[db:ping] FAIL", err);
  process.exit(1);
});
