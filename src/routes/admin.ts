import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/http.js";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const [accounts] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total, SUM(isonline = 1) AS online, SUM(ban = 1) AS banned FROM account",
    );
    const [players] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM player");
    const [posts] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM posts");
    const [topups] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total, COALESCE(SUM(vnd),0) AS vnd FROM topup WHERE trangthai = 1",
    );
    res.json({ accounts: accounts[0], players: players[0], posts: posts[0], topups: topups[0] });
  }),
);

router.get(
  "/accounts",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const q = String(req.query.q ?? "").trim();
    const where = q ? "WHERE username LIKE ?" : "";
    const params: unknown[] = q ? [`%${q}%`] : [];
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, username, ban, isonline, vnd, tongnap, coin, is_admin, admin, active, create_time
       FROM account ${where} ORDER BY id DESC LIMIT 20 OFFSET ?`,
      [...params, (page - 1) * 20],
    );
    res.json({ page, items: rows });
  }),
);

router.get(
  "/players",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const q = String(req.query.q ?? "").trim();
    const where = q ? "WHERE p.name LIKE ? OR a.username LIKE ?" : "";
    const params: unknown[] = q ? [`%${q}%`, `%${q}%`] : [];
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT p.id, p.account_id, a.username, p.name, p.gender, p.head,
              p.have_tennis_space_ship, p.clan_id_sv1, p.clan_id_sv2,
              p.create_time, p.pointPvp, p.vnd, p.violate
       FROM player p LEFT JOIN account a ON a.id = p.account_id
       ${where} ORDER BY p.id DESC LIMIT 20 OFFSET ?`,
      [...params, (page - 1) * 20],
    );
    const [count] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM player p LEFT JOIN account a ON a.id = p.account_id ${where}`,
      params,
    );
    res.json({ page, pageSize: 20, total: Number(count[0]?.total ?? 0), items: rows });
  }),
);

const banSchema = z.object({ ban: z.union([z.literal(0), z.literal(1)]) });

router.patch(
  "/accounts/:id/ban",
  asyncHandler(async (req, res) => {
    const { ban } = banSchema.parse(req.body);
    await pool.query("UPDATE account SET ban = ? WHERE id = ?", [ban, req.params.id]);
    res.json({ ok: true });
  }),
);

const giftcodeSchema = z.object({
  code: z.string().min(1),
  count_left: z.coerce.number().int().min(0),
  detail: z.string().default("[]"),
  itemoption: z.string().default("[]"),
});

router.get(
  "/giftcodes",
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, code, count_left FROM giftcode ORDER BY id DESC LIMIT 100",
    );
    res.json({ items: rows });
  }),
);

router.post(
  "/giftcodes",
  asyncHandler(async (req, res) => {
    const body = giftcodeSchema.parse(req.body);
    const [r] = await pool.query<ResultSetHeader>(
      "INSERT INTO giftcode (code, count_left, detail, itemoption, listIdUser) VALUES (?, ?, ?, ?, '[]')",
      [body.code, body.count_left, body.detail, body.itemoption],
    );
    res.status(201).json({ id: r.insertId });
  }),
);

router.get(
  "/config",
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM adminpanel LIMIT 1");
    const [version] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM small_version ORDER BY id ASC",
    );
    res.json({ adminpanel: rows[0] ?? null, version });
  }),
);

export default router;
