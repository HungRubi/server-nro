import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";
import { env } from "../config/env.js";

// Usage:
//   npm run db:import                        (báo lỗi nếu DB đã có bảng)
//   npm run db:import -- --force              (drop + import lại từ nro1.sql)
//   npm run db:import -- --file="D:/nro/nro1.sql" --force

const force = process.argv.includes("--force");

function getFileArg(): string | undefined {
  const hit = process.argv.find((a) => a.startsWith("--file="));
  return hit?.slice("--file=".length).replace(/^["']|["']$/g, "");
}

function resolveSqlFile(): string {
  const candidates = [
    getFileArg(),
    path.resolve(process.cwd(), "../nro1.sql"),
    path.resolve(process.cwd(), "nro1.sql"),
  ].filter((p): p is string => Boolean(p));
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  console.error("[db:import] Không tìm thấy file SQL. Đã thử:");
  for (const p of candidates) console.error(`  - ${p}`);
  console.error('Gợi ý: npm run db:import -- --file="D:/nro/nro1.sql"');
  process.exit(1);
}

// Tách statements theo dấu ; ngoài quote/comment.
// Dump phpMyAdmin không có PROCEDURE/TRIGGER nên splitter này đủ.
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let single = false;
  let dquote = false;
  let backtick = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const next = sql[i + 1] ?? "";
    const next2 = sql[i + 2] ?? "";
    if (lineComment) {
      cur += c;
      if (c === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      cur += c;
      if (c === "*" && next === "/") {
        cur += next;
        i++;
        blockComment = false;
      }
      continue;
    }
    if (single) {
      cur += c;
      if (c === "\\") {
        cur += next;
        i++;
        continue;
      }
      if (c === "'") single = false;
      continue;
    }
    if (dquote) {
      cur += c;
      if (c === "\\") {
        cur += next;
        i++;
        continue;
      }
      if (c === '"') dquote = false;
      continue;
    }
    if (backtick) {
      cur += c;
      if (c === "`") backtick = false;
      continue;
    }
    if (c === "#" || (c === "-" && next === "-" && /[\s]/.test(next2))) {
      lineComment = true;
      cur += c;
      continue;
    }
    if (c === "/" && next === "*") {
      blockComment = true;
      cur += c;
      continue;
    }
    if (c === "'") {
      single = true;
      cur += c;
      continue;
    }
    if (c === '"') {
      dquote = true;
      cur += c;
      continue;
    }
    if (c === "`") {
      backtick = true;
      cur += c;
      continue;
    }
    if (c === ";") {
      cur += c;
      if (cur.trim().length > 0) out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim().length > 0) out.push(cur);
  return out;
}

// MySQL 8 khác MariaDB 10.4, phải sanitize CREATE TABLE trước khi chạy:
// 1. Cột TEXT/BLOB/JSON không được DEFAULT literal ('[]', '0', ...).
// 2. Cột DATE/DATETIME không được DEFAULT current_timestamp() (chỉ TIMESTAMP được).
function sanitizeCreateTable(stmt: string): string {
  let out = stmt.replace(
    /((?:TINY|MEDIUM|LONG)?TEXT|(?:TINY|MEDIUM|LONG)?BLOB|JSON)(\s+NOT\s+NULL)?\s+DEFAULT\s+('(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.)*"|[^\s,)]+)/gi,
    (_m, colType: string, notNull: string | undefined) =>
      notNull ? `${colType}${notNull}` : `${colType} DEFAULT NULL`,
  );
  out = out.replace(
    /(`[^`]+`\s+(?:DATE|DATETIME)(?:\s*\([^)]*\))?)\s+DEFAULT\s+current_timestamp\(\)/gi,
    "$1 DEFAULT NULL",
  );
  return out;
}

function extractTableNames(sql: string): string[] {
  const names: string[] = [];
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`([^`]+)`/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    if (!names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

async function main() {
  const file = resolveSqlFile();
  const stat = fs.statSync(file);
  console.log(`[db:import] File: ${file} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  console.log(
    `[db:import] Target: ${env.MYSQL_USER}@${env.MYSQL_HOST}:${env.MYSQL_PORT}/${env.MYSQL_DATABASE}`,
  );

  const raw = fs.readFileSync(file, "utf8");
  const statements = splitStatements(raw);
  console.log(`[db:import] ${statements.length} statements${force ? " (force)" : ""}`);

  const admin = await mysql.createConnection({
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
  });
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${env.MYSQL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`,
  );
  await admin.end();

  const db = await mysql.createConnection({
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    database: env.MYSQL_DATABASE,
  });

  try {
    const [existing] = await db.query<RowDataPacket[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'",
    );
    if (existing.length > 0 && !force) {
      console.error(`[db:import] DB đã có ${existing.length} bảng. Bỏ qua để tránh trùng dữ liệu.`);
      console.error("[db:import] Muốn import lại từ đầu: npm run db:import -- --force");
      return;
    }
    if (force) {
      const tables = extractTableNames(raw);
      console.log(`[db:import] Drop ${tables.length} bảng cũ...`);
      await db.query("SET FOREIGN_KEY_CHECKS=0");
      for (const t of tables) {
        await db.query(`DROP TABLE IF EXISTS \`${t}\``);
      }
    }

    await db.query("SET FOREIGN_KEY_CHECKS=0");
    await db.query("SET NAMES utf8mb4");
    let ok = 0;
    for (let i = 0; i < statements.length; i++) {
      let stmt = statements[i];
      if (/CREATE\s+TABLE/i.test(stmt)) stmt = sanitizeCreateTable(stmt);
      try {
        await db.query(stmt);
        ok++;
      } catch (err) {
        const code = (err as { code?: string })?.code ?? "UNKNOWN";
        console.error(`[db:import] Lỗi statement ${i + 1}/${statements.length} (${code}):`);
        console.error(`  ${stmt.slice(0, 160).replace(/\s+/g, " ")}...`);
        throw err;
      }
      if ((i + 1) % 100 === 0) console.log(`[db:import] ${i + 1}/${statements.length}...`);
    }
    await db.query("SET FOREIGN_KEY_CHECKS=1");
    console.log(`[db:import] Xong ${ok}/${statements.length} statements`);

    const [tables] = await db.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'",
    );
    console.log(`[db:import] Tổng số bảng: ${tables[0].n}`);
    for (const t of ["account", "player", "posts"]) {
      try {
        const [rows] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM \`${t}\``);
        console.log(`[db:import] ${t}: ${rows[0].n} rows`);
      } catch {
        console.log(`[db:import] ${t}: (không có bảng)`);
      }
    }
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  const code = (err as { code?: string })?.code;
  if (code === "ECONNREFUSED") {
    console.error(
      "[db:import] ECONNREFUSED — MySQL chưa chạy. Khởi động Docker Desktop rồi: docker compose up -d",
    );
  } else if (code === "ER_ACCESS_DENIED_ERROR") {
    console.error("[db:import] Sai user/password. Kiểm tra MYSQL_* trong .env.");
    console.error(
      "[db:import] Nếu vừa đổi MYSQL_PASSWORD sau lần up đầu: docker compose down -v && docker compose up -d",
    );
  } else {
    console.error("[db:import] FAIL", err);
  }
  process.exit(1);
});
