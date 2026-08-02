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
    // no header abaixo — isso garante que a cha
