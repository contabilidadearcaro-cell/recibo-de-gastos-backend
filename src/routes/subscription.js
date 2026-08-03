const express = require('express');
const { pool } = require('../db');
const { requireAuth, accessInfo } = require('../middleware/auth');
const { createSubscriptionCheckout } = require('../asaas');

const router = express.Router();

router.get('/status', requireAuth, async (req, res) => {
  res.json({ access: accessInfo(req.user) });
});

// Gera um link de pagamento hospedado pelo Asaas (Pix + Cartão) para o usuário assinar.
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const value = parseFloat(process.env.SUBSCRIPTION_VALUE || '10.00');

    // primeira cobrança já a partir de amanhã (Asaas não cobra no mesmo dia da criação
    // em alguns casos; ajuste se quiser cobrar exatamente no fim do trial)
    const nextDueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { checkoutId, checkoutUrl } = await createSubscriptionCheckout({
      user: req.user,
      value,
      nextDueDate,
    });

    await pool.query(
      `INSERT INTO payments (user_id, asaas_checkout_id, value, status)
       VALUES ($1, $2, $3, 'checkout_created')`,
      [req.user.id, checkoutId, value]
    );

    res.json({ checkoutUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Não foi possível iniciar o pagamento. Tente novamente em instantes.' });
  }
});

module.exports = router;
