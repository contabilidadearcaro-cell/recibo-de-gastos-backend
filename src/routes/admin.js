const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { accessInfo } = require('../middleware/auth');

const router = express.Router();

function requireAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Não autenticado.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.admin) return res.status(403).json({ error: 'Acesso negado.' });
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido.' });
  }
}

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Senha incorreta.' });
  }
  const token = jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token });
});

router.get('/users', requireAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
  const users = rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    createdAt: u.created_at,
    isAdmin: u.is_admin,
    access: accessInfo(u),
    asaasCustomerId: u.asaas_customer_id,
    asaasSubscriptionId: u.asaas_subscription_id,
  }));
  res.json({ users });
});

router.get('/payments', requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, u.name AS user_name, u.email AS user_email
     FROM payments p JOIN users u ON u.id = p.user_id
     ORDER BY p.created_at DESC LIMIT 200`
  );
  res.json({ payments: rows });
});

// Libera acesso manualmente (ex: cortesia, parceiro, correção de erro de cobrança)
router.post('/users/:id/grant-access', requireAdmin, async (req, res) => {
  const days = parseInt(req.body.days || '30', 10);
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await pool.query(
    `UPDATE users SET subscription_status = 'active', current_period_ends_at = $1 WHERE id = $2`,
    [until, req.params.id]
  );
  res.json({ ok: true });
});

// Revoga acesso manualmente
router.post('/users/:id/revoke-access', requireAdmin, async (req, res) => {
  await pool.query(`UPDATE users SET subscription_status = 'canceled' WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
