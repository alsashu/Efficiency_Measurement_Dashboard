const { checkConnection, query } = require('../config/database');
const os = require('os');
const fs = require('fs');
const path = require('path');

exports.getHealth = async (req, res) => {
  const start = Date.now();
  let dbStatus = 'ok', dbLatency = 0;

  try {
    const dbStart = Date.now();
    await checkConnection();
    dbLatency = Date.now() - dbStart;
  } catch {
    dbStatus = 'error';
  }

  const logDir = process.env.LOG_DIR || './logs';
  let logFiles = [];
  try {
    logFiles = fs.readdirSync(logDir).map(f => {
      const stat = fs.statSync(path.join(logDir, f));
      return { name: f, size: `${(stat.size / 1024).toFixed(1)} KB`, modified: stat.mtime };
    });
  } catch {}

  const memUsage = process.memoryUsage();
  res.json({
    status: dbStatus === 'ok' ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: { status: dbStatus, latency_ms: dbLatency },
      api: { status: 'ok', latency_ms: Date.now() - start },
    },
    system: {
      platform: os.platform(),
      arch: os.arch(),
      node_version: process.version,
      memory: {
        heap_used_mb: (memUsage.heapUsed / 1024 / 1024).toFixed(2),
        heap_total_mb: (memUsage.heapTotal / 1024 / 1024).toFixed(2),
        rss_mb: (memUsage.rss / 1024 / 1024).toFixed(2),
        system_total_gb: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2),
        system_free_gb: (os.freemem() / 1024 / 1024 / 1024).toFixed(2),
      },
      cpu_cores: os.cpus().length,
      load_avg: os.loadavg(),
    },
    logs: logFiles,
  });
};

exports.getStats = async (req, res, next) => {
  try {
    const [programs, uploads, users, audits] = await Promise.all([
      query('SELECT COUNT(*) FROM programs'),
      query('SELECT COUNT(*) FROM uploaded_files'),
      query('SELECT COUNT(*) FROM users WHERE is_active=true'),
      query('SELECT COUNT(*) FROM audit_logs WHERE created_at > NOW() - INTERVAL \'24 hours\''),
    ]);
    res.json({
      success: true,
      data: {
        total_programs: parseInt(programs.rows[0].count),
        total_uploads: parseInt(uploads.rows[0].count),
        active_users: parseInt(users.rows[0].count),
        audit_events_24h: parseInt(audits.rows[0].count),
      },
    });
  } catch (err) { next(err); }
};
