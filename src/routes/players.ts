import { Router } from "express";
import type { RowDataPacket } from "mysql2/promise";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/http.js";

const router = Router();
const PUBLIC_COLS =
  "id, account_id, name, head, gender, have_tennis_space_ship, clan_id_sv1, clan_id_sv2, data_point";

router.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${PUBLIC_COLS} FROM player WHERE account_id = ?`,
      [req.user!.sub],
    );
    res.json({ items: rows });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${PUBLIC_COLS} FROM player WHERE id = ? LIMIT 1`,
      [req.params.id],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Không tìm thấy nhân vật" });
      return;
    }
    res.json(rows[0]);
  }),
);

export default router;
