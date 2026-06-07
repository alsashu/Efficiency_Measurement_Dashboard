const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const logger = require('../config/logger');
const { logAudit } = require('../middleware/auditLogger');

const generateToken = (userId, role) =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '24h' });

exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }
    const result = await query(
      `SELECT u.id, u.username, u.email, u.password_hash, u.is_active, u.first_name, u.last_name,
              r.name as role, r.permissions
       FROM users u JOIN roles r ON u.role_id = r.id WHERE u.username = $1`,
      [username]
    );
    if (!result.rows.length) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const user = result.rows[0];
    if (!user.is_active) {
      return res.status(401).json({ success: false, message: 'Account is disabled' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    await query('UPDATE users SET last_login=$1 WHERE id=$2', [new Date(), user.id]);
    const token = generateToken(user.id, user.role);
    await logAudit(user.id, 'LOGIN', 'user', user.id, { username }, req.ip);
    logger.info('User logged in', { userId: user.id, username });
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          permissions: user.permissions,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.me = async (req, res) => {
  res.json({ success: true, data: req.user });
};

exports.logout = async (req, res) => {
  await logAudit(req.user.id, 'LOGOUT', 'user', req.user.id, {}, req.ip);
  res.json({ success: true, message: 'Logged out' });
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) return res.status(400).json({ success: false, message: 'Current password incorrect' });
    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.user.id]);
    await logAudit(req.user.id, 'CHANGE_PASSWORD', 'user', req.user.id, {}, req.ip);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
};
