// Client pour l'API Etsy Open API v3.
//
// Limite connue et volontaire : l'API Etsy n'expose aucun endpoint pour
// envoyer un message à un acheteur (pas de "sendMessage"). Le flux réel est
// donc : commande reçue (webhook order.paid) -> récupération du texte de
// personnalisation -> génération automatique de l'aperçu -> le vendeur
// l'envoie lui-même en 1 clic depuis Etsy (au lieu de le fabriquer à la main
// en 5-10 min). Voir README.md.
const crypto = require('crypto');

const AUTH_URL = 'https://www.etsy.com/oauth/connect';
const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';
const API_BASE = 'https://openapi.etsy.com/v3/application';

function isConfigured() {
  return Boolean(process.env.ETSY_API_KEY && process.env.ETSY_SHARED_SECRET);
}

// --- PKCE helpers (obligatoire pour l'OAuth2 Etsy) ---
function base64url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generatePkcePair() {
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(
    crypto.createHash('sha256').update(codeVerifier).digest()
  );
  return { codeVerifier, codeChallenge };
}

function getAuthorizationUrl({ state, codeChallenge, scopes }) {
  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: process.env.ETSY_REDIRECT_URI,
    scope: (scopes || ['transactions_r', 'shops_r']).join(' '),
    client_id: process.env.ETSY_API_KEY,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForToken({ code, codeVerifier }) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.ETSY_API_KEY,
      redirect_uri: process.env.ETSY_REDIRECT_URI,
      code,
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) {
    throw new Error(`Échange du code Etsy échoué (${res.status}): ${await res.text()}`);
  }
  return res.json(); // { access_token, refresh_token, expires_in, ... }
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.ETSY_API_KEY,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    throw new Error(`Rafraîchissement du token Etsy échoué (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

async function apiRequest(pathname, { accessToken, method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: {
      'x-api-key': process.env.ETSY_API_KEY,
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Appel API Etsy échoué (${res.status}) sur ${pathname}: ${await res.text()}`);
  }
  return res.json();
}

// Récupère une commande (receipt) précise, avec ses transactions et le
// champ de personnalisation saisi par l'acheteur.
function getReceipt(shopId, receiptId, accessToken) {
  return apiRequest(`/shops/${shopId}/receipts/${receiptId}`, { accessToken });
}

// Liste les commandes récentes d'une boutique (utile en secours si les
// webhooks ne sont pas configurés, ou pour un import initial).
function listShopReceipts(shopId, accessToken, { limit = 25, offset = 0 } = {}) {
  return apiRequest(
    `/shops/${shopId}/receipts?limit=${limit}&offset=${offset}`,
    { accessToken }
  );
}

module.exports = {
  isConfigured,
  generatePkcePair,
  getAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  getReceipt,
  listShopReceipts,
};
