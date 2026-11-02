import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  API_PREFIX: z.string().default("/api"),
  MYSQL_HOST: z.string().default("127.0.0.1"),
  MYSQL_PORT: z.coerce.number().default(3306),
  MYSQL_USER: z.string().default("root"),
  MYSQL_PASSWORD: z.string().default(""),
  MYSQL_DATABASE: z.string().default("nro1"),
  DB_POOL_LIMIT: z.coerce.number().default(10),
  JWT_SECRET: z.string().min(16, "JWT_SECRET quá ngắn, hãy đặt chuỗi ngẫu nhiên >= 16 ký tự"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:5173"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
});

export const env = envSchema.parse(process.env);
export const corsOrigins = env.CORS_ORIGINS.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
