const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      trial_ends_at TIMESTAMPTZ NOT NULL,
      subscription_status TEXT NOT NULL DEFAULT 'trial',
      -- trial | active | past_due | canceled | expired
      asaas_customer_id TEXT,
      asaas_subscription_id TEXT,
      current_period_ends_at TIMESTAMPTZ,
      is_admin BOOLEAN NOT NULL DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      category TEXT NOT NULL DEFAULT 'outros',
      type TEXT NOT NULL DEFAULT 'expense',
      -- type: 'expense' (despesa) ou 'income' (receita)
      raw_text TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      asaas_payment_id TEXT,
      asaas_checkout_id TEXT,
      value NUMERIC(10,2),
      status TEXT,
      billing_type TEXT,
      raw_event JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);
    CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
  `);

  // Migração segura para bancos já existentes (criados antes da coluna "type" existir).
  await pool.query(`
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'expense';
  `);
}

module.exports = { pool, initSchema };
