import type { NextFunction, Request, Response } from "express";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { message: "Route not found" } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error("[api] Unhandled error:", err);
  const message =
    err instanceof Error && process.env.NODE_ENV !== "production"
      ? err.message
      : "Internal server error";
  res.status(500).json({ error: { message } });
}
