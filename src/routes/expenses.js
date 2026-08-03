const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireActiveAccess } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM expenses WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json({ expenses: rows });
});

router.post('/', requireAuth, requireActiveAccess, async (req, res) => {
  const { description, amount, category, rawText } = req.body;
  if (!description || typeof amount !== 'number' || isNaN(amount)) {
    return res.status(400).json({ error: 'Descrição e valor são obrigatórios.' });
  }
  const { rows } = await pool.query(
    `INSERT INTO expenses (user_id, description, amount, category, raw_text)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.user.id, description, amount, category || 'outros', rawText || null]
  );
  res.status(201).json({ expense: rows[0] });
});

router.delete('/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM expenses WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  res.status(204).end();
});

module.exports = router;
