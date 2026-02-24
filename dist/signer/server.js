"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: ".env.signer" });
const express_1 = __importDefault(require("express"));
const crypto_1 = require("crypto");
const https_1 = __importDefault(require("https"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
const PRIVATE_KEY_DER_BASE64 = process.env.SIGNER_PRIVATE_KEY_DER_BASE64;
if (!PRIVATE_KEY_DER_BASE64) {
    console.error("[SIGNER] Missing SIGNER_PRIVATE_KEY_DER_BASE64");
    process.exit(1);
}
const keyObject = (0, crypto_1.createPrivateKey)({
    key: Buffer.from(PRIVATE_KEY_DER_BASE64, "base64"),
    format: "der",
    type: "pkcs8",
});
app.post("/sign", (req, res) => {
    try {
        const { hash } = req.body;
        if (!hash || typeof hash !== "string") {
            res.status(400).json({
                error: "Invalid hash",
            });
            return;
        }
        const signature = (0, crypto_1.sign)(null, Buffer.from(hash), keyObject).toString("base64");
        res.json({ signature });
        return;
    }
    catch (err) {
        console.error("[SIGNER] Signing failed:", err);
        res.status(500).json({
            error: "Signing failed",
        });
        return;
    }
});
const PORT = 4000;
const certPath = path_1.default.join(__dirname, "../../certs");
const server = https_1.default.createServer({
    key: fs_1.default.readFileSync(path_1.default.join(certPath, "signer.key")),
    cert: fs_1.default.readFileSync(path_1.default.join(certPath, "signer.crt")),
    ca: fs_1.default.readFileSync(path_1.default.join(certPath, "ca.crt")),
    requestCert: true,
    rejectUnauthorized: true,
}, app);
server.listen(PORT, () => {
    console.log(`[SIGNER] mTLS server running on https://localhost:${PORT}`);
});
