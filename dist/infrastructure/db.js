"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = query;
exports.getPool = getPool;
const pg_1 = require("pg");
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
});
async function query(text, params) {
    const result = await pool.query(text, params);
    return result.rows;
}
function getPool() {
    return pool;
}
