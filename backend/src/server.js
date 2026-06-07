require('dotenv').config();
const app = require('./app');
const logger = require('./config/logger');
const { checkConnection } = require('./config/database');
const cron = require('node-cron');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await checkConnection();
    logger.info('Database connection verified');

    // Scheduled jobs
    cron.schedule('0 8 * * 1', () => {
      logger.info('Weekly report job triggered');
    });
    cron.schedule('*/30 * * * *', async () => {
      try {
        const { query } = require('./config/database');
        const old = await query(
          "DELETE FROM sync_queue WHERE status='completed' AND processed_at < NOW() - INTERVAL '7 days' RETURNING id"
        );
        if (old.rowCount) logger.info(`Cleaned ${old.rowCount} old sync queue records`);
      } catch (err) { logger.error('Cron cleanup error', { error: err.message }); }
    });

    app.listen(PORT, () => {
      logger.info(`TC Efficiency Dashboard API running on port ${PORT}`);
      logger.info(`Swagger docs: http://localhost:${PORT}/api/docs`);
      logger.info(`Health check: http://localhost:${PORT}/api/health`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
};

process.on('unhandledRejection', (err) => logger.error('Unhandled rejection', { error: err.message }));
process.on('uncaughtException', (err) => { logger.error('Uncaught exception', { error: err.message }); process.exit(1); });

startServer();
