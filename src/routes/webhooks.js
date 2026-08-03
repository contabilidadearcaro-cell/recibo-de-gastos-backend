const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// Procura recursivamente por um campo "externalReference" em qualquer nível
// do payload do webhook (o Asaas às vezes aninha em payment, subscription, checkout...).
function findExternalReference(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.externalReference) return obj.externalReference;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === 'object') {
      const found = findExternalReference(val);
      if (found) return found;
    }
  }
  return null;
}

const ACTIVE_EVENTS = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']);
const OVERDUE_EVENTS = new Set(['PAYMENT_OVERDUE']);
const CANCEL_EVENTS = new Set(['PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED']);

router.post('/asaas', express.json({ type: '*/*' }), async (req, res) => {
  try {
    // O Asaas exige (e devolve de volta) o token configurado no painel de Webhooks,
    // no header abaixo — isso garante que a chamada veio mesmo do Asaas.
    const incomingToken = req.headers['asaas-access-token'];
    if (!process.env.ASAAS_WEBHOOK_TOKEN || incomingToken !== process.env.ASAAS_WEBHOOK_TOKEN) {
      return res.status(401).json({ error: 'Token de webhook inválido.' });
    }

    const body = req.body || {};
    const eventType = body.event;
    const payment = body.payment || body.checkout || {};
    const externalReference = findExternalReference(body);
    const userId = externalReference ? parseInt(externalReference, 10) : null;

    // Sempre responde 200 rápido pro Asaas não ficar reenviando; processa depois.
    res.status(200).json({ received: true });

    if (!userId) {
      console.warn('Webhook Asaas sem externalReference reconhecível:', eventType);
      return;
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    if (!user) {
      console.warn('Webhook Asaas para usuário inexistente:', userId);
      return;
    }

    await pool.query(
      `INSERT INTO payments (user_id, asaas_payment_id, value, status, billing_type, raw_event)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId,
        payment.id || null,
        payment.value || null,
        eventType || payment.status || null,
        payment.billingType || null,
        JSON.stringify(body),
      ]
    );

    let newStatus = user.subscription_status;
    let currentPeriodEndsAt = user.current_period_ends_at;

    if (ACTIVE_EVENTS.has(eventType)) {
      newStatus = 'active';
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      currentPeriodEndsAt = d;
    } else if (OVERDUE_EVENTS.has(eventType)) {
      newStatus = 'past_due';
    } else if (CANCEL_EVENTS.has(eventType)) {
      newStatus = 'canceled';
    }

    const asaasCustomerId = payment.customer || user.asaas_customer_id;
    const asaasSubscriptionId = payment.subscription || user.asaas_subscription_id;

    await pool.query(
      `UPDATE users
       SET subscription_status = $1,
           current_period_ends_at = $2,
           asaas_customer_id = $3,
           asaas_subscription_id = $4
       WHERE id = $5`,
      [newStatus, currentPeriodEndsAt, asaasCustomerId, asaasSubscriptionId, userId]
    );
  } catch (err) {
    console.error('Erro processando webhook Asaas:', err);
  }
});

module.exports = router;
