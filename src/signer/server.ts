import dotenv from "dotenv";
dotenv.config({ path: ".env.signer" });
import express from "express";
import { createPrivateKey, sign } from "crypto";
import https from "https";
import fs from "fs";
import path from "path";

const app = express();
app.use(express.json());

const PRIVATE_KEY_DER_BASE64 = process.env.SIGNER_PRIVATE_KEY_DER_BASE64;

if (!PRIVATE_KEY_DER_BASE64) {
  console.error("[SIGNER] Missing SIGNER_PRIVATE_KEY_DER_BASE64");
  process.exit(1);
}

const keyObject = createPrivateKey({
  key: Buffer.from(PRIVATE_KEY_DER_BASE64, "base64"),
  format: "der",
  type: "pkcs8",
});

app.post("/sign", (req, res): void => {
  try {
    const { hash } = req.body;

    if (!hash || typeof hash !== "string") {
      res.status(400).json({
        error: "Invalid hash",
      });
      return;
    }

    const signature = sign(null, Buffer.from(hash), keyObject).toString(
      "base64",
    );

    res.json({ signature });
    return;
  } catch (err) {
    console.error("[SIGNER] Signing failed:", err);
    res.status(500).json({
      error: "Signing failed",
    });
    return;
  }
});

const PORT = 4000;

const certPath = path.join(__dirname, "../../certs");

const server = https.createServer(
  {
    key: fs.readFileSync(path.join(certPath, "signer.key")),
    cert: fs.readFileSync(path.join(certPath, "signer.crt")),
    ca: fs.readFileSync(path.join(certPath, "ca.crt")),
    requestCert: true,
    rejectUnauthorized: true,
  },
  app,
);

server.listen(PORT, () => {
  console.log(`[SIGNER] mTLS server running on https://localhost:${PORT}`);
});
