"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthorizationError = exports.IntegrityError = exports.ValidationError = exports.AppError = void 0;
class AppError extends Error {
    constructor(message, statusCode, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.AppError = AppError;
class ValidationError extends AppError {
    constructor(message) {
        super(message, 400, "VALIDATION_ERROR");
    }
}
exports.ValidationError = ValidationError;
class IntegrityError extends AppError {
    constructor(message) {
        super(message, 409, "INTEGRITY_VIOLATION");
    }
}
exports.IntegrityError = IntegrityError;
class AuthorizationError extends AppError {
    constructor(message) {
        super(message, 403, "FORBIDDEN");
    }
}
exports.AuthorizationError = AuthorizationError;
