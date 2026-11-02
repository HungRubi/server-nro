import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../middleware/http.js";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: "up", time: new Date().toISOString() });
  }),
);

export default router;
