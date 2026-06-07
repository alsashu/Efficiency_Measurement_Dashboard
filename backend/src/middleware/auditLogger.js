const { query } = require('../config/database');
const logger = require('../config/logger');

const logAudit = async (userId, action, entityType, entityId, details, ipAddress) => {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, action, entityType, entityId, JSON.stringify(details), ipAddress]
    );
  } catch (err) {
    logger.error('Failed to write audit log', { error: err.message });
  }
};

const auditMiddleware = (action, entityType) => async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function (data) {
    if (res.statusCode < 400 && req.user) {
      const entityId = data?.data?.id || req.params.id || null;
      logAudit(
        req.user.id,
        action,
        entityType,
        entityId,
        { method: req.method, path: req.path, body: req.body },
        req.ip
      ).catch(() => {});
    }
    return originalJson(data);
  };
  next();
};

module.exports = { logAudit, auditMiddleware };
