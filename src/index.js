require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initSchema } = require('./db');

const authRoutes = require('./routes/auth');
const expenseRoutes = require('./routes/expenses');
const subscriptionRoutes = require('./routes/subscription');
const webhookRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin');

const app = express();

app.use(cors());
// Webhooks precisa do corpo bruto tratado dentro da própria rota (já usa express.json lá);
// as demais rotas usam JSON normal.
app.use((req, res, next) => {
  if (req.path.startsWith('/webhooks')) return next();
  express.json()(req, res, next);
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/expenses', expenseRoutes);
app.use('/subscription', subscriptionRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/admin', adminRoutes);

const PORT = process.env.PORT || 3000;

initSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
  })
  .catch((err) => {
    console.error('Erro ao iniciar (schema do banco):', err);
    process.exit(1);
  });
