const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { logAudit } = require('../middleware/auditLogger');

exports.getUsers = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.is_active, u.last_login, u.created_at,
             r.name as role, r.id as role_id
      FROM users u LEFT JOIN roles r ON u.role_id = r.id ORDER BY u.created_at DESC`);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

exports.createUser = async (req, res, next) => {
  try {
    const { username, email, password, roleId, firstName, lastName } = req.body;
    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (username, email, password_hash, role_id, first_name, last_name)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, username, email, first_name, last_name, is_active, created_at`,
      [username, email, hash, roleId, firstName, lastName]
    );
    await logAudit(req.user.id, 'CREATE_USER', 'users', result.rows[0].id, { username, email }, req.ip);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

exports.updateUser = async (req, res, next) => {
  try {
    const { email, roleId, firstName, lastName, isActive, password } = req.body;
    let passwordClause = '';
    const params = [email, roleId, firstName, lastName, isActive];
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      params.push(hash);
      passwordClause = `, password_hash=$${params.length}`;
    }
    params.push(req.params.id);
    const result = await query(
      `UPDATE users SET email=$1, role_id=$2, first_name=$3, last_name=$4, is_active=$5${passwordClause}, updated_at=NOW()
       WHERE id=$${params.length} RETURNING id, username, email, first_name, last_name, is_active`,
      params
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'User not found' });
    await logAudit(req.user.id, 'UPDATE_USER', 'users', parseInt(req.params.id), { email, roleId }, req.ip);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

exports.deleteUser = async (req, res, next) => {
  try {
    if (req.params.id == req.user.id) return res.status(400).json({ success: false, message: 'Cannot delete own account' });
    const result = await query('DELETE FROM users WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'User not found' });
    await logAudit(req.user.id, 'DELETE_USER', 'users', parseInt(req.params.id), {}, req.ip);
    res.json({ success: true, message: 'User deleted' });
  } catch (err) { next(err); }
};

exports.getRoles = async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM roles ORDER BY name');
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};
