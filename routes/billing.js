// Abonnement Pro (Stripe Checkout + Customer Portal). Le webhook qui tient
// à jour le statut d'abonnement est géré à part dans server.js (a besoin
// du corps brut de la requête, avant le middleware express.json()).
const express = require('express');
const auth = require('../lib/auth');
const store = require('../lib/store');
const stripeClient = require('../lib/stripeClient');
const { isPro, appBaseUrl } = require('../lib/billing');

const router = express.Router();

router.get('/status', auth.requireAuth, (req, res) => {
  res.json({
    configured: stripeClient.isConfigured(),
    plan: req.user.plan || 'free',
    subscriptionStatus: req.user.subscriptionStatus || null,
    isPro: isPro(req.user),
  });
});

router.post('/checkout', auth.requireAuth, async (req, res, next) => {
  try {
    if (!stripeClient.isConfigured()) {
      return res.status(503).json({
        error: "Facturation non configurée. Renseignez STRIPE_SECRET_KEY et STRIPE_PRICE_ID (voir README.md).",
      });
    }
    if (isPro(req.user)) {
      return res.status(400).json({ error: 'Vous êtes déjà abonné Pro.' });
    }
    const stripe = stripeClient.client();
    const base = appBaseUrl(req);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      customer_email: req.user.stripeCustomerId ? undefined : req.user.email,
      customer: req.user.stripeCustomerId || undefined,
      client_reference_id: req.user.id,
      metadata: { userId: req.user.id },
      subscription_data: { metadata: { userId: req.user.id } },
      success_url: `${base}/billing.html?checkout=success`,
      cancel_url: `${base}/billing.html?checkout=canceled`,
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

router.post('/portal', auth.requireAuth, async (req, res, next) => {
  try {
    if (!stripeClient.isConfigured()) {
      return res.status(503).json({ error: 'Facturation non configurée.' });
    }
    if (!req.user.stripeCustomerId) {
      return res.status(400).json({ error: 'Aucun abonnement associé à ce compte.' });
    }
    const stripe = stripeClient.client();
    const session = await stripe.billingPortal.sessions.create({
      customer: req.user.stripeCustomerId,
      return_url: `${appBaseUrl(req)}/billing.html`,
    });
    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
