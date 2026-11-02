import { Router } from "express";
import type { RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/http.js";

const router = Router();

const topupSchema = z.object({
  seri: z.string().min(1).max(40),
  code: z.string().min(1).max(50),
  loaithe: z.string().min(1).max(50),
  sotien: z.coerce.number().int().positive().optional(),
});

// POST /topup/card — tạo yêu cầu nạp thẻ (trạng thái chờ duyệt)
router.post(
  "/card",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = topupSchema.parse(req.body);
    const requestId = `${Date.now()}${req.user!.sub}`;
    await pool.query(
      "INSERT INTO topup (request_id, trangthai, vnd, username, seri, code, loaithe) VALUES (?, 0, 0, ?, ?, ?, ?)",
      [requestId, req.user!.username, body.seri, body.code, body.loaithe],
    );
    res.status(201).json({ requestId, status: "pending" });
  }),
);

// GET /topup/history — lịch sử nạp của chính user
router.get(
  "/history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT request_id, trangthai, vnd, time, seri, loaithe FROM topup WHERE username = ? ORDER BY time DESC LIMIT 50",
      [req.user!.username],
    );
    res.json({ items: rows });
  }),
);

export default router;
