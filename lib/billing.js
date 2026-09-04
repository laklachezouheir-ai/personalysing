const stripe = require('./stripeClient');

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

function isPro(user) {
  return Boolean(user.plan === 'pro' && ACTIVE_STATUSES.has(user.subscriptionStatus));
}

// Bloque l'accès aux outils IA payants aux comptes non abonnés — mais
// seulement si Stripe est configuré. Tant qu'il ne l'est pas (dev, ou
// avant que le vendeur ait mis en place la facturation), les outils IA
// restent ouverts à tous les comptes connectés, comme le reste de l'app.
function requirePro(req, res, next) {
  if (!stripe.isConfigured()) return next();
  if (isPro(req.user)) return next();
  return res.status(402).json({
    error: 'Cet outil est réservé aux comptes Pro. Passez Pro depuis /billing.html pour le débloquer.',
    upgradeRequired: true,
  });
}

function appBaseUrl(req) {
  return process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

module.exports = { isPro, requirePro, appBaseUrl };
