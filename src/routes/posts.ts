import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/http.js";

const router = Router();
const PAGE_SIZE = 20;

const createPostSchema = z.object({
  tieude: z.string().min(3).max(75),
  noidung: z.string().min(1),
  theloai: z.coerce.number().int().default(0),
  image: z.string().max(255).nullable().optional(),
});

const createCommentSchema = z.object({
  nguoidung: z.string().min(1).max(255),
  traloi: z.string().min(1),
  gender: z.coerce.number().int().default(0),
  image: z.string().max(255).nullable().optional(),
});

// GET /posts?page=1 — feed diễn đàn (web-nro)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const theloai = req.query.theloai !== undefined ? Number(req.query.theloai) : undefined;
    const where = Number.isFinite(theloai) ? "WHERE theloai = ?" : "";
    const params: unknown[] = Number.isFinite(theloai) ? [theloai] : [];
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, tieude, noidung, username, created_at, theloai, ghimbai, image, trangthai
       FROM posts ${where} ORDER BY ghimbai DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    );
    res.json({ page, pageSize: PAGE_SIZE, items: rows });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM posts WHERE id = ? LIMIT 1", [
      req.params.id,
    ]);
    if (rows.length === 0) {
      res.status(404).json({ error: "Không tìm thấy bài viết" });
      return;
    }
    const [comments] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM comments WHERE post_id = ? ORDER BY id ASC",
      [req.params.id],
    );
    res.json({ ...rows[0], comments });
  }),
);

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = createPostSchema.parse(req.body);
    const [r] = await pool.query<ResultSetHeader>(
      "INSERT INTO posts (tieude, noidung, username, theloai, image) VALUES (?, ?, ?, ?, ?)",
      [body.tieude, body.noidung, req.user!.username, body.theloai, body.image ?? null],
    );
    res.status(201).json({ id: r.insertId });
  }),
);

router.post(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    const body = createCommentSchema.parse(req.body);
    const [r] = await pool.query<ResultSetHeader>(
      "INSERT INTO comments (post_id, nguoidung, traloi, gender, image) VALUES (?, ?, ?, ?, ?)",
      [req.params.id, body.nguoidung, body.traloi, body.gender, body.image ?? null],
    );
    res.status(201).json({ id: r.insertId });
  }),
);

export default router;
