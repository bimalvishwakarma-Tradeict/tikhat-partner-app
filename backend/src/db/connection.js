import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
});

pool.on('connect', () => {
  logger.info('PostgreSQL pool: new client connected');
});

pool.on('error', (err) => {
  logger.error(`PostgreSQL pool error: ${err.message}`, { error: err });
});

export const query = async (text, params) => {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;

  logger.debug('Executed query', {
    text,
    duration,
    rows: result.rowCount,
  });

  return result;
};

export const getClient = async () => {
  const client = await pool.connect();
  return client;
};

export { pool };
