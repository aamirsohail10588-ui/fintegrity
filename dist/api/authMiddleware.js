"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = "supersecret123";
if (!JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable not set");
}
function requireAuth(req, res, next) {
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
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (typeof decoded !== "object" || decoded === null) {
            res.status(401).json({
                status: "error",
                message: "Invalid token payload",
            });
            return;
        }
        const payload = decoded;
        const authReq = req;
        authReq.userId = payload.userId;
        authReq.role = payload.role;
        authReq.tenantId = payload.tenantId;
        next();
    }
    catch {
        res.status(401).json({
            status: "error",
            message: "Invalid or expired token",
        });
    }
}
