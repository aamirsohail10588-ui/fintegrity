import { Request, Response } from "express";
import { query } from "../infrastructure/db";
import crypto from "crypto";

export async function confirmMapping(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { fileId, entityId, mapping } = req.body;

    if (!fileId || !entityId || !mapping) {
      res.status(400).json({
        status: "error",
        message: "Missing required fields",
      });
      return;
    }

    const mappingVersionId = crypto.randomUUID();

    await query(
      `
      INSERT INTO ingestion_mappings (
        id,
        file_id,
        entity_id,
        mapping_json,
        created_at
      )
      VALUES ($1, $2, $3, $4, NOW())
      `,
      [mappingVersionId, fileId, entityId, JSON.stringify(mapping)],
    );

    res.status(200).json({
      status: "mapping_saved",
      mappingVersionId,
    });
  } catch {
    res.status(500).json({
      status: "error",
      message: "Failed to save mapping",
    });
    return;
  }
}
