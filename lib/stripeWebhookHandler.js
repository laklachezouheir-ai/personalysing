// Traite les évènements Stripe qui font évoluer le statut d'abonnement
// d'un vendeur. Monté dans server.js AVANT express.json() : Stripe exige
// le corps brut de la requête pour vérifier la signature.
const stripeClient = require('./stripeClient');
const store = require('./store');

function findUserByCustomerId(customerId) {
  return store.find('users', (u) => u.stripeCustomerId === customerId);
}

function findUserById(userId) {
  return store.find('users', (u) => u.id === userId);
}

async function handleStripeWebhook(req, res) {
  if (!stripeClient.isConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).send('Webhook Stripe non configuré.');
  }

  const stripe = stripeClient.client();
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, // Buffer brut (voir express.raw() dans server.js)
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Signature webhook Stripe invalide :', err.message);
    return res.status(400).send(`Signature invalide : ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode !== 'subscription') break;
      const userId = session.metadata?.userId || session.client_reference_id;
      const user = userId ? findUserById(userId) : null;
      if (user) {
        store.update('users', user.id, {
          plan: 'pro',
          subscriptionStatus: 'active',
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
        });
      } else {
        console.error('Webhook checkout.session.completed : utilisateur introuvable pour', userId);
      }
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const user = findUserByCustomerId(subscription.customer);
      if (user) {
        const active = subscription.status === 'active' || subscription.status === 'trialing';
        store.update('users', user.id, {
          plan: active ? 'pro' : 'free',
          subscriptionStatus: subscription.status,
          stripeSubscriptionId: subscription.id,
        });
      }
      break;
    }

    default:
      break; // évènement non géré, ignoré volontairement
  }

  res.json({ received: true });
}

module.exports = { handleStripeWebhook };
