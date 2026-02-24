import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query(
  text: string,
  params?: unknown[],
): Promise<unknown> {
  const result = await pool.query(text, params);
  return result.rows;
}

export function getPool(): Pool {
  return pool;
}
