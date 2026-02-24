"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthorizationError = void 0;
const AppError_1 = require("./AppError");
class AuthorizationError extends AppError_1.AppError {
    constructor(message) {
        super(message, 403, "AUTHORIZATION_ERROR");
    }
}
exports.AuthorizationError = AuthorizationError;
