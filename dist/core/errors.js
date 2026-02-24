"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
class AppError extends Error {
    constructor(module, code, message) {
        super(message);
        this.module = module;
        this.code = code;
        Object.setPrototypeOf(this, AppError.prototype);
    }
    toJSON() {
        return {
            module: this.module,
            code: this.code,
            message: this.message,
        };
    }
}
exports.AppError = AppError;
