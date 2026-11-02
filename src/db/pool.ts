import mysql from "mysql2/promise";
import { env } from "../config/env.js";

export const pool = mysql.createPool({
  host: env.MYSQL_HOST,
  port: env.MYSQL_PORT,
  user: env.MYSQL_USER,
  password: env.MYSQL_PASSWORD,
  database: env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: env.DB_POOL_LIMIT,
  charset: "utf8mb4_unicode_ci",
  timezone: "+00:00",
});
