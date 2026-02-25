"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditCertificateService = void 0;
const PostgresEventStore_1 = require("../infrastructure/PostgresEventStore");
const core_1 = require("../core");
const state_1 = require("../state");
const db_1 = require("../infrastructure/db");
const crypto_1 = require("crypto");
const https_1 = __importDefault(require("https"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class AuditCertificateService {
    constructor() {
        this.store = new PostgresEventStore_1.PostgresEventStore();
    }
    async generate(entityId, version, tenantId) {
        // 1. Load all events
        const allEvents = await this.store.getByEntity(entityId, tenantId);
        const relevantEvents = allEvents.filter((e) => e.metadata.version <= version);
        if (relevantEvents.length === 0) {
            throw new Error("No events found for entity/version");
        }
        (0, core_1.replay)(relevantEvents, {}, state_1.accountBalanceReducer);
        // 3. Compute history root
        const historyRoot = (0, core_1.computeHistoryRoot)(relevantEvents);
        const snapshotRows = (await (0, db_1.query)(`
  SELECT merkle_root
  FROM snapshots
  WHERE entity_id = $1
  AND version = $2
  `, [entityId, version]));
        const snapshotRoot = snapshotRows.length > 0 ? snapshotRows[0].merkle_root : null;
        const certificate = {
            entityId,
            version,
            eventCount: relevantEvents.length,
            historyRoot,
            snapshotRoot,
            verifiedAt: new Date().toISOString(),
        };
        const canonical = (0, core_1.canonicalStringify)(certificate);
        const certificateHash = (0, core_1.hashString)(canonical);
        const certPath = path_1.default.join(__dirname, "../../certs");
        const requestOptions = {
            hostname: "localhost",
            port: 4000,
            path: "/sign",
            method: "POST",
            key: fs_1.default.readFileSync(path_1.default.join(certPath, "core.key")),
            cert: fs_1.default.readFileSync(path_1.default.join(certPath, "core.crt")),
            ca: fs_1.default.readFileSync(path_1.default.join(certPath, "ca.crt")),
            rejectUnauthorized: true,
            headers: {
                "Content-Type": "application/json",
            },
        };
        const signature = await new Promise((resolve, reject) => {
            const req = https_1.default.request(requestOptions, (res) => {
                let data = "";
                res.on("data", (chunk) => {
                    data += chunk;
                });
                res.on("end", () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed.signature);
                    }
                    catch (err) {
                        reject(err);
                    }
                });
            });
            req.on("error", reject);
            req.write(JSON.stringify({ hash: certificateHash }));
            req.end();
        });
        const PUBLIC_KEY_DER_BASE64 = process.env.SIGNER_PUBLIC_KEY_DER_BASE64;
        if (!PUBLIC_KEY_DER_BASE64) {
            throw new Error("Missing SIGNER_PUBLIC_KEY_DER_BASE64");
        }
        const publicKeyObject = (0, crypto_1.createPublicKey)({
            key: Buffer.from(PUBLIC_KEY_DER_BASE64, "base64"),
            format: "der",
            type: "spki",
        });
        const isValid = (0, crypto_1.verify)(null, Buffer.from(certificateHash), publicKeyObject, Buffer.from(signature, "base64"));
        if (!isValid) {
            throw new Error("Signature verification failed");
        }
        return {
            certificate,
            certificateHash,
            signature,
        };
    }
}
exports.AuditCertificateService = AuditCertificateService;
