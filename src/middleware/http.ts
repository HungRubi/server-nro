import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues[0]?.message ?? "Dữ liệu không hợp lệ" });
    return;
  }
  console.error(err);
  const message = err instanceof Error ? err.message : "Lỗi máy chủ nội bộ";
  const status = (err as { status?: number })?.status ?? 500;
  res.status(status).json({ error: message });
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Không tìm thấy tài nguyên" });
}
