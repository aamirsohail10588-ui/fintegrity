import { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { parseCsvFile } from "./CsvParser";
import { parse } from "csv-parse";
import { suggestHeaderMapping } from "./HeaderScorer";
import { logger } from "../core";

const uploadDir = path.join(__dirname, "../../uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});

export const uploadMiddleware = multer({ storage });

export async function handleCsvUpload(req: Request, res: Response) {
  try {
    if (!req.file) {
      res.status(400).json({
        status: "error",
        message: "No file uploaded",
      });
      return;
    }

    const filePath = req.file.path;

    const headers = await new Promise<string[]>((resolve, reject) => {
      const headerList: string[] = [];

      fs.createReadStream(filePath)
        .pipe(
          parse({
            to_line: 1,
          }),
        )
        .on("data", (row: string[]) => {
          row.forEach((h) => headerList.push(h));
        })
        .on("end", () => resolve(headerList))
        .on("error", reject);
    });

    const suggestions = suggestHeaderMapping(headers);

    res.status(200).json({
      status: "awaiting_mapping",
      fileId: req.file.filename,
      headers,
      suggestions,
    });
  } catch (error) {
    console.error("[CSV UPLOAD ERROR]", error);

    res.status(400).json({
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
