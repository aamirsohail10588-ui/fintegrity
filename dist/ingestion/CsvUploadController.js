"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadMiddleware = void 0;
exports.handleCsvUpload = handleCsvUpload;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const csv_parse_1 = require("csv-parse");
const HeaderScorer_1 = require("./HeaderScorer");
const uploadDir = path_1.default.join(__dirname, "../../uploads");
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir);
}
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        const uniqueName = Date.now() + "-" + file.originalname;
        cb(null, uniqueName);
    },
});
exports.uploadMiddleware = (0, multer_1.default)({ storage });
async function handleCsvUpload(req, res) {
    try {
        if (!req.file) {
            res.status(400).json({
                status: "error",
                message: "No file uploaded",
            });
            return;
        }
        const filePath = req.file.path;
        const headers = await new Promise((resolve, reject) => {
            const headerList = [];
            fs_1.default.createReadStream(filePath)
                .pipe((0, csv_parse_1.parse)({
                to_line: 1,
            }))
                .on("data", (row) => {
                row.forEach((h) => headerList.push(h));
            })
                .on("end", () => resolve(headerList))
                .on("error", reject);
        });
        const suggestions = (0, HeaderScorer_1.suggestHeaderMapping)(headers);
        res.status(200).json({
            status: "awaiting_mapping",
            fileId: req.file.filename,
            headers,
            suggestions,
        });
    }
    catch (error) {
        console.error("[CSV UPLOAD ERROR]", error);
        res.status(400).json({
            status: "error",
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
}
