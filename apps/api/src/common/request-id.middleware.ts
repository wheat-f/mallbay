import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";

export type RequestWithId = Request & {
  requestId?: string;
};

export function requestIdMiddleware(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  const incoming = req.headers["x-request-id"];
  const requestId = Array.isArray(incoming) ? incoming[0] : incoming;

  req.requestId = requestId || `req_${randomUUID()}`;
  res.setHeader("x-request-id", req.requestId);
  next();
}

