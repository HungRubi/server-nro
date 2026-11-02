import { Router } from "express";
import type { RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/http.js";

const router = Router();
const redeemSchema = z.object({ code: z.string().min(1) });

function parseIdList(raw: unknown): number[] {
  if (typeof raw !== "string") return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

// POST /giftcode/redeem { code } — trừ lượt, ghi nhận user id
router.post(
  "/redeem",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { code } = redeemSchema.parse(req.body);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM giftcode WHERE code = ? LIMIT 1 FOR UPDATE",
        [code],
      );
      const gc = rows[0];
      if (!gc) {
        await conn.rollback();
        res.status(404).json({ error: "Giftcode không tồn tại" });
        return;
      }
      if (gc.count_left <= 0) {
        await conn.rollback();
        res.status(410).json({ error: "Giftcode đã hết lượt" });
        return;
      }
      const used = parseIdList(gc.listIdUser);
      if (used.includes(req.user!.sub)) {
        await conn.rollback();
        res.status(409).json({ error: "Bạn đã dùng giftcode này rồi" });
        return;
      }
      used.push(req.user!.sub);
      await conn.query(
        "UPDATE giftcode SET count_left = count_left - 1, listIdUser = ? WHERE id = ?",
        [JSON.stringify(used), gc.id],
      );
      await conn.commit();
      res.json({ ok: true, detail: gc.detail, itemoption: gc.itemoption });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }),
);

export default router;
