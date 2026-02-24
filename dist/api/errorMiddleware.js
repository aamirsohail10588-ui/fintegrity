"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorMiddleware = errorMiddleware;
const AppError_1 = require("../errors/AppError");
const zod_1 = require("zod");
const core_1 = require("../core");
function errorMiddleware(err, _req, res, _next) {
    // Zod validation errors
    if (err instanceof zod_1.ZodError) {
        res.status(400).json({
            status: "error",
            code: "VALIDATION_ERROR",
            message: "Invalid request payload",
            details: err.flatten(),
        });
        return;
    }
    // Custom app errors
    if (err instanceof AppError_1.AppError) {
        res.status(err.statusCode).json({
            status: "error",
            code: err.code,
            message: err.message,
        });
        return;
    }
    // Unknown errors
    core_1.logger.error({
        module: "API",
        action: "Unhandled error",
        details: String(err),
    });
    res.status(500).json({
        status: "error",
        code: "INTERNAL_ERROR",
        message: "Internal server error",
    });
}
