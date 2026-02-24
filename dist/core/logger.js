"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
function write(level, context) {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] [${level}] [${context.module}] ${context.action}${context.details ? ` - ${context.details}` : ""}`;
    // central console output (only place allowed)
    console.log(message);
}
exports.logger = {
    info(context) {
        write("INFO", context);
    },
    warn(context) {
        write("WARN", context);
    },
    error(context) {
        write("ERROR", context);
    },
};
