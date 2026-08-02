// Camada fina sobre a API do Asaas. Se algo mudar na API deles,
// é aqui que se conserta — o resto do app não precisa saber os detalhes.

const ASAAS_API_URL = process.env.ASAAS_API_URL || 'https://api-sandbox.asaas.com/v3';
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

async function asaasRequest(path, options = {}) {
  const res = await fetch(`${ASAAS_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
      access_token: ASAAS_API_KEY,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.errors?.[0]?.description || JSON.stringify(data);
    throw new Error(`Asaas API (${path}) falhou: ${msg}`);
  }
  return data;
}

/**
 * Cria um Asaas Checkout de assinatura recorrente (Pix + Cartão) para um usuário.
 * Retorna { checkoutId, checkoutUrl }.
 */
async function createSubscriptionCheckout({ user, value, cycle = 'MONTHLY', nextDueDate }) {
  const body = {
    billingTypes: ['PIX', 'CREDIT_CARD'],
    chargeTypes: ['RECURRENT'],
    minutesToExpire: 120,
    externalReference: String(user.id),
    callback: {
      successUrl: `${process.env.FRONTEND_URL}/?checkout=success`,
      cancelUrl: `${process.env.FRONTEND_URL}/?checkout=cancel`,
      expiredUrl: `${process.env.FRONTEND_URL}/?checkout=expired`,
    },
    items: [
      {
        name: 'Recibo de Gastos - assinatura mensal',
        description: 'Acesso mensal ao app Recibo de Gastos',
        quantity: 1,
        value,
      },
    ],
    customerData: {
      name: user.name,
      email: user.email,
    },
    subscription: {
      cycle,
      nextDueDate,
    },
  };

  const data = await asaasRequest('/checkouts', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return {
    checkoutId: data.id,
    checkoutUrl: `https://asaas.com/checkoutSession/show?id=${data.id}`,
  };
}

async function getPayment(paymentId) {
  return asaasRequest(`/payments/${paymentId}`);
}

module.exports = { createSubscriptionCheckout, getPayment };
