export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface LogContext {
  module: string;
  action: string;
  details?: string;
}

function write(level: LogLevel, context: LogContext): void {
  const timestamp: string = new Date().toISOString();

  const message: string = `[${timestamp}] [${level}] [${context.module}] ${context.action}${
    context.details ? ` - ${context.details}` : ""
  }`;

  // central console output (only place allowed)
  console.log(message);
}

export const logger = {
  info(context: LogContext): void {
    write("INFO", context);
  },

  warn(context: LogContext): void {
    write("WARN", context);
  },

  error(context: LogContext): void {
    write("ERROR", context);
  },
};
