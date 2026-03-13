import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";
import { ApiResponse } from "../utils/response";

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof AppError) {
    ApiResponse.error(res, err.message, err.statusCode, err.errors);
    return;
  }

  console.error("Unhandled error:", err);
  ApiResponse.error(res, "Internal server error", 500);
};
