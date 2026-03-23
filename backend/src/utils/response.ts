import { Response } from "express";

export class ApiResponse {
  static success<T>(res: Response, data: T, statusCode = 200): Response {
    return res.status(statusCode).json({ status: "success", data });
  }

  static error(res: Response, message: string, statusCode = 500, errors?: unknown): Response {
    return res.status(statusCode).json({
      status: "error",
      message,
      ...(errors !== undefined && { errors }),
    });
  }
}
