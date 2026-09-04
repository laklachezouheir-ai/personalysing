// Client Stripe — abonnement "Pro" qui déverrouille les outils IA (SEO,
// mockups, vidéos). Le configurateur de personnalisation (cœur gratuit du
// produit, sans coût d'API) reste accessible sans abonnement.
const Stripe = require('stripe');

let _stripe = null;

function isConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

function client() {
  if (!isConfigured()) {
    throw Object.assign(new Error('Stripe non configuré.'), { status: 503 });
  }
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

module.exports = { isConfigured, client };
