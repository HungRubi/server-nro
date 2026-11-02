import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";

async function main() {
  await pool.query("SELECT 1");
  console.log("[db] MySQL connected");
  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`[api] listening on :${env.PORT}${env.API_PREFIX}`);
  });
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
