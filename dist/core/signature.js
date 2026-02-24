"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signData = signData;
exports.verifySignature = verifySignature;
const crypto_1 = __importDefault(require("crypto"));
const envSecret = process.env.EVENT_SECRET;
if (!envSecret) {
    throw new Error("[CORE] EVENT_SECRET environment variable is not set. Refusing to start.");
}
const SYSTEM_SECRET = envSecret;
function signData(data) {
    return crypto_1.default.createHmac("sha256", SYSTEM_SECRET).update(data).digest("hex");
}
function verifySignature(data, signature) {
    const expected = signData(data);
    return expected === signature;
}
