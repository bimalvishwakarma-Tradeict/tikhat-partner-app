/**
 * PM2 ecosystem — Tikhat Partner backend
 *
 * Cluster mode: 2 instances, auto-restart, dedicated logs.
 * Start (from backend/):
 *   pm2 start ecosystem.config.js --env production
 * Persist across reboot:
 *   pm2 save && pm2 startup
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ecosystem = {
  apps: [
    {
      name: 'tikhat-backend',
      script: path.join(__dirname, 'server.js'),
      cwd: __dirname,
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_restarts: 20,
      min_uptime: '10s',
      max_memory_restart: '1G',
      kill_timeout: 5000,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      error_file: path.join(__dirname, 'logs', 'pm2-error.log'),
      out_file: path.join(__dirname, 'logs', 'pm2-out.log'),
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss IST',
    },
  ],
};

export default ecosystem;
