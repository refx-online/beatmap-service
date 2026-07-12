import mysql from "mysql2/promise";
import { config } from "./config.js";

export const pool = mysql.createPool({
  host: config.mysql.host,
  port: config.mysql.port,
  user: config.mysql.user,
  password: config.mysql.password,
  database: config.mysql.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export async function fetchOne<T>(
  query: string,
  params?: any[]
): Promise<T | null> {
  const [rows] = await pool.execute(query, params);
  const records = rows as T[];
  return records.length > 0 ? records[0] : null;
}

export async function fetchAll<T>(query: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.execute(query, params);
  return rows as T[];
}
