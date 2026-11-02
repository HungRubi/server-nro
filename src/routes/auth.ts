import bcrypt from "bcryptjs";
import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth, signToken } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/http.js";
import { loginRateLimit } from "../middleware/rateLimit.js";

const router = Router();

const registerSchema = z.object({
  username: z.string().trim().min(3).max(20),
  password: z.string().min(3).max(100),
  sodienthoai: z.string().max(20).optional().default(""),
});

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

async function verifyPassword(input: string, stored: string) {
  if (stored.startsWith("$2")) return bcrypt.compare(input, stored);
  return input === stored; // tài khoản legacy lưu plaintext
}

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const [exists] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM account WHERE username = ?",
      [body.username],
    );
    if (exists.length > 0) {
      res.status(409).json({ error: "Tên tài khoản đã tồn tại" });
      return;
    }
    const hash = await bcrypt.hash(body.password, 10);
    const [r] = await pool.query<ResultSetHeader>(
      "INSERT INTO account (username, password, pass2, sodienthoai, diemdanh, code, xacminh, thoigian_xacminh, money, isonline) VALUES (?, ?, '', ?, 0, 0, 0, 0, 0, 0)",
      [body.username, hash, body.sodienthoai],
    );
    const token = signToken({ sub: r.insertId, username: body.username, isAdmin: false });
    res.status(201).json({ id: r.insertId, username: body.username, token });
  }),
);

router.post(
  "/login",
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, username, password, ban, is_admin, admin FROM account WHERE username = ? LIMIT 1",
      [body.username],
    );
    const acc = rows[0];
    if (!acc || !(await verifyPassword(body.password, acc.password))) {
      res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu" });
      return;
    }
    if (acc.ban === 1) {
      res.status(403).json({ error: "Tài khoản đã bị khóa" });
      return;
    }
    const isAdmin = acc.is_admin === 1 || acc.admin === 1;
    // Rehash tài khoản legacy sang bcrypt sau khi login thành công
    if (!String(acc.password).startsWith("$2")) {
      const hash = await bcrypt.hash(body.password, 10);
      await pool.query("UPDATE account SET password = ? WHERE id = ?", [hash, acc.id]);
    }
    await pool.query(
      "UPDATE account SET isonline = 1, last_time_login = NOW(), ip_address = ? WHERE id = ?",
      [req.ip ?? null, acc.id],
    );
    const token = signToken({ sub: acc.id, username: acc.username, isAdmin });
    res.json({ id: acc.id, username: acc.username, isAdmin, token });
  }),
);

router.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    await pool.query("UPDATE account SET isonline = 0, last_time_logout = NOW() WHERE id = ?", [
      req.user!.sub,
    ]);
    res.json({ ok: true });
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, username, vnd, tongnap, coin, money, balance,
              is_admin, admin, ban, active, sodienthoai, gmail,
              create_time, last_time_login, isonline
       FROM account WHERE id = ? LIMIT 1`,
      [req.user!.sub],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Không tìm thấy tài khoản" });
      return;
    }
    res.json(rows[0]);
  }),
);

const updateMeSchema = z.object({
  sodienthoai: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9+ ]*$/, "Số điện thoại không hợp lệ")
    .optional(),
  gmail: z.string().trim().max(255).email("Gmail không hợp lệ").nullable().optional(),
});

router.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = updateMeSchema.parse(req.body);
    if (body.sodienthoai === undefined && body.gmail === undefined) {
      res.status(400).json({ error: "Không có gì để cập nhật" });
      return;
    }
    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.sodienthoai !== undefined) {
      sets.push("sodienthoai = ?");
      params.push(body.sodienthoai);
    }
    if (body.gmail !== undefined) {
      sets.push("gmail = ?");
      params.push(body.gmail);
    }
    params.push(req.user!.sub);
    await pool.query(`UPDATE account SET ${sets.join(", ")} WHERE id = ?`, params);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, username, vnd, tongnap, coin, money, balance,
              is_admin, admin, ban, active, sodienthoai, gmail,
              create_time, last_time_login, isonline
       FROM account WHERE id = ? LIMIT 1`,
      [req.user!.sub],
    );
    res.json(rows[0]);
  }),
);

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, "Nhập mật khẩu hiện tại"),
  newPassword: z.string().min(3, "Mật khẩu mới tối thiểu 3 ký tự").max(100),
});

router.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = changePasswordSchema.parse(req.body);
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT password FROM account WHERE id = ? LIMIT 1",
      [req.user!.sub],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Không tìm thấy tài khoản" });
      return;
    }
    const ok = await verifyPassword(body.oldPassword, String(rows[0].password));
    if (!ok) {
      res.status(400).json({ error: "Mật khẩu hiện tại không đúng" });
      return;
    }
    const hash = await bcrypt.hash(body.newPassword, 10);
    await pool.query("UPDATE account SET password = ? WHERE id = ?", [hash, req.user!.sub]);
    res.json({ ok: true });
  }),
);

export default router;
