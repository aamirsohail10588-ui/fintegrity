"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmMapping = confirmMapping;
const db_1 = require("../infrastructure/db");
const crypto_1 = __importDefault(require("crypto"));
async function confirmMapping(req, res) {
    try {
        const { fileId, entityId, mapping } = req.body;
        if (!fileId || !entityId || !mapping) {
            res.status(400).json({
                status: "error",
                message: "Missing required fields",
            });
            return;
        }
        const mappingVersionId = crypto_1.default.randomUUID();
        await (0, db_1.query)(`
      INSERT INTO ingestion_mappings (
        id,
        file_id,
        entity_id,
        mapping_json,
        created_at
      )
      VALUES ($1, $2, $3, $4, NOW())
      `, [mappingVersionId, fileId, entityId, JSON.stringify(mapping)]);
        res.status(200).json({
            status: "mapping_saved",
            mappingVersionId,
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({
            status: "error",
            message: "Failed to save mapping",
        });
        return;
    }
}
