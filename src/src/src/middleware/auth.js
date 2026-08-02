const jwt = require('jsonwebtoken');
const { pool } = require('../db');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Não autenticado.' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [payload.userId]);
    if (!rows[0]) return res.status(401).json({ error: 'Usuário não encontrado.' });

    req.user = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

// Calcula e retorna se o usuário tem acesso liberado ao app agora
// (trial ainda válido OU assinatura ativa), sem bloquear a rota —
// usado para o front decidir o que mostrar.
function accessInfo(user) {
  const now = new Date();
  const trialEndsAt = new Date(user.trial_ends_at);
  const inTrial = user.subscription_status === 'trial' && now < trialEndsAt;
  const active = user.subscription_status === 'active';
  const hasAccess = inTrial || active;

  return {
    hasAccess,
    status: user.subscription_status,
    trialEndsAt: user.trial_ends_at,
    currentPeriodEndsAt: user.current_period_ends_at,
    daysLeftInTrial: inTrial
      ? Math.max(0, Math.ceil((trialEndsAt - now) / (1000 * 60 * 60 * 24)))
      : 0,
  };
}

// Bloqueia rotas que exigem assinatura/trial ativos (ex: registrar despesa)
function requireActiveAccess(req, res, next) {
  const info = accessInfo(req.user);
  if (!info.hasAccess) {
    return res.status(402).json({ error: 'Período de teste encerrado. Assine para continuar.', access: info });
  }
  next();
}

module.exports = { requireAuth, requireActiveAccess, accessInfo };
