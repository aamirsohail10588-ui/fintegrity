"use strict";
// src/core/config.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
function requireEnv(name) {
    const value = process.env[name];
    if (!value || value.trim() === "") {
        throw new Error(`[CONFIG] Missing required environment variable: ${name}`);
    }
    return value;
}
exports.config = {
    JWT_SECRET: requireEnv("JWT_SECRET"),
    EVENT_SECRET: requireEnv("EVENT_SECRET"),
    DATABASE_URL: requireEnv("DATABASE_URL"),
    NODE_ENV: process.env.NODE_ENV ?? "development",
};
