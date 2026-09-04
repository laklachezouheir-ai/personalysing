// Garde-fou anti-dérapage de coûts : les outils IA payants (SEO, mockups,
// vidéos) appellent des API facturées à l'usage. Sans limite, un compte
// (piraté, mal utilisé, ou simplement un clic répété) peut générer une
// facture importante en quelques minutes — surtout pour les vidéos
// (plusieurs dollars par génération). On applique donc un quota quotidien
// par vendeur et par outil, configurable via variables d'environnement.
const store = require('./store');

const DEFAULT_LIMITS = {
  seo: Number(process.env.SEO_DAILY_LIMIT) || 30,
  mockup: Number(process.env.MOCKUP_DAILY_LIMIT) || 15,
  video: Number(process.env.VIDEO_DAILY_LIMIT) || 3,
};

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function usageToday(userId, action) {
  const today = todayKey();
  const rows = await store.filter(
    'aiUsage',
    (u) => u.userId === userId && u.action === action && u.createdAt.slice(0, 10) === today
  );
  return rows.length;
}

/**
 * Lève une erreur 429 si le vendeur a atteint son quota du jour pour cet
 * outil. À appeler AVANT d'invoquer l'API payante.
 */
async function assertWithinQuota(userId, action) {
  const limit = DEFAULT_LIMITS[action];
  if (!limit) return; // pas de limite configurée pour cette action
  const used = await usageToday(userId, action);
  if (used >= limit) {
    throw Object.assign(
      new Error(
        `Limite quotidienne atteinte pour cet outil (${limit}/jour). Réessayez demain.`
      ),
      { status: 429 }
    );
  }
}

/** À appeler juste après un appel réussi à l'API payante. */
async function recordUsage(userId, action) {
  await store.insert('aiUsage', { userId, action });
}

module.exports = { assertWithinQuota, recordUsage, usageToday, DEFAULT_LIMITS };
