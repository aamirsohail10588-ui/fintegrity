// src/core/config.ts

interface AppConfig {
  readonly JWT_SECRET: string;
  readonly EVENT_SECRET: string;
  readonly DATABASE_URL: string;
  readonly NODE_ENV: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new Error(`[CONFIG] Missing required environment variable: ${name}`);
  }

  return value;
}

export const config: AppConfig = {
  JWT_SECRET: requireEnv("JWT_SECRET"),
  EVENT_SECRET: requireEnv("EVENT_SECRET"),
  DATABASE_URL: requireEnv("DATABASE_URL"),
  NODE_ENV: process.env.NODE_ENV ?? "development",
};
