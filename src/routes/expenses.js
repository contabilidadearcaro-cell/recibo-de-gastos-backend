const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireActiveAccess } = require('../middleware/auth');

const router = express.Router();

// GET /expenses?from=2026-01-01&to=2026-01-31
// "from"/"to" são opcionais (formato YYYY-MM-DD). Sem eles, retorna tudo.
router.get('/', requireAuth, async (req, res) => {
  const { from, to } = req.query;
  const params = [req.user.id];
  let where = 'user_id = $1';

  if (from) {
    params.push(from);
    where += ` AND created_at >= $${params.length}`;
  }
  if (to) {
    // inclui o dia inteiro do "to"
    params.push(to);
    where += ` AND created_at < ($${params.length}::date + interval '1 day')`;
  }

  const { rows } = await pool.query(
    `SELECT * FROM expenses WHERE ${where} ORDER BY created_at DESC`,
    params
  );
  res.json({ expenses: rows });
});

router.post('/', requireAuth, requireActiveAccess, async (req, res) => {
  const { description, amount, category, rawText, type } = req.body;
  if (!description || typeof amount !== 'number' || isNaN(amount)) {
    return res.status(400).json({ error: 'Descrição e valor são obrigatórios.' });
  }
  const safeType = type === 'income' ? 'income' : 'expense';
  const safeCategory = (category || 'outros').trim() || 'outros';

  const { rows } = await pool.query(
    `INSERT INTO expenses (user_id, description, amount, category, type, raw_text)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.user.id, description, amount, safeCategory, safeType, rawText || null]
  );
  res.status(201).json({ expense: rows[0] });
});

// Edita um lançamento existente (ex: renomear categoria, corrigir valor/descrição/tipo)
router.patch('/:id', requireAuth, async (req, res) => {
  const { description, amount, category, type } = req.body;
  const fields = [];
  const params = [];

  if (description !== undefined) { params.push(description); fields.push(`description = $${params.length}`); }
  if (amount !== undefined) { params.push(amount); fields.push(`amount = $${params.length}`); }
  if (category !== undefined) { params.push((category || 'outros').trim() || 'outros'); fields.push(`category = $${params.length}`); }
  if (type !== undefined) { params.push(type === 'income' ? 'income' : 'expense'); fields.push(`type = $${params.length}`); }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'Nada para atualizar.' });
  }

  params.push(req.params.id, req.user.id);
  const { rows } = await pool.query(
    `UPDATE expenses SET ${fields.join(', ')}
     WHERE id = $${params.length - 1} AND user_id = $${params.length}
     RETURNING *`,
    params
  );
  if (!rows[0]) return res.status(404).json({ error: 'Lançamento não encontrado.' });
  res.json({ expense: rows[0] });
});

router.delete('/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM expenses WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  res.status(204).end();
});

module.exports = router;
