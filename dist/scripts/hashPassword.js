"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcrypt_1 = __importDefault(require("bcrypt"));
async function run() {
    const password = "Admin@123"; // change later
    const hash = await bcrypt_1.default.hash(password, 10);
    console.log("HASH:", hash);
}
run();
