const { query } = require('../config/database');

exports.getLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, action, entityType, userId, from, to } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = [];

    if (action) { params.push(`%${action}%`); conditions.push(`al.action ILIKE $${params.length}`); }
    if (entityType) { params.push(entityType); conditions.push(`al.entity_type=$${params.length}`); }
    if (userId) { params.push(parseInt(userId)); conditions.push(`al.user_id=$${params.length}`); }
    if (from) { params.push(from); conditions.push(`al.created_at >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`al.created_at <= $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit), offset);

    const result = await query(`
      SELECT al.*, u.username FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${where} ORDER BY al.created_at DESC
      LIMIT $${params.length-1} OFFSET $${params.length}`, params);

    const countResult = await query(
      `SELECT COUNT(*) FROM audit_logs al ${where}`,
      params.slice(0, params.length - 2)
    );

    res.json({
      success: true, data: result.rows,
      pagination: {
        page: parseInt(page), limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit)),
      },
    });
  } catch (err) { next(err); }
};

exports.getNotifications = async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

exports.markNotificationRead = async (req, res, next) => {
  try {
    await query('UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
};

exports.markAllRead = async (req, res, next) => {
  try {
    await query('UPDATE notifications SET is_read=true WHERE user_id=$1', [req.user.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
};
