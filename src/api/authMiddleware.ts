import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

const JWT_SECRET = "supersecret123";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable not set");
}

export interface AuthenticatedRequest extends Request {
  userId: string;
  role: string;
  tenantId: string;
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      status: "error",
      message: "Missing or invalid Authorization header",
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (typeof decoded !== "object" || decoded === null) {
      res.status(401).json({
        status: "error",
        message: "Invalid token payload",
      });
      return;
    }

    const payload = decoded as JwtPayload & {
      userId: string;
      role: string;
      tenantId: string;
    };

    const authReq = req as AuthenticatedRequest;
    authReq.userId = payload.userId;
    authReq.role = payload.role;
    authReq.tenantId = payload.tenantId;

    next();
  } catch {
    res.status(401).json({
      status: "error",
      message: "Invalid or expired token",
    });
  }
}
