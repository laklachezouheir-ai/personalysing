// Client Replicate — génération de mockups/photos produit par IA.
// Doc : https://replicate.com/docs/reference/http
//
// ⚠️ Le modèle utilisé (REPLICATE_MODEL) et le nom exact de ses paramètres
// d'entrée évoluent régulièrement sur Replicate. La valeur par défaut
// ci-dessous (flux-kontext-pro, qui accepte une image d'entrée + un prompt
// pour la retravailler en conservant le produit) est correcte au moment de
// l'écriture, mais À VÉRIFIER sur https://replicate.com/<model> avant mise
// en production : le champ "Input schema" de la page du modèle fait foi.
const API_BASE = 'https://api.replicate.com/v1';
const DEFAULT_MODEL = process.env.REPLICATE_MODEL || 'black-forest-labs/flux-kontext-pro';

function isConfigured() {
  return Boolean(process.env.REPLICATE_API_TOKEN);
}

async function pollUntilDone(getUrl, { intervalMs = 2000, maxAttempts = 30 } = {}) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
    });
    if (!res.ok) throw new Error(`Suivi de la prédiction Replicate échoué (${res.status})`);
    const data = await res.json();
    if (data.status === 'succeeded') return data;
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(`Génération Replicate échouée : ${data.error || data.status}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Délai de génération Replicate dépassé.');
}

/**
 * @param {object} opts
 * @param {string} opts.prompt - description du rendu souhaité
 * @param {string} [opts.imageDataUri] - image produit à retravailler, encodée
 *        en data URI (data:image/png;base64,...) — évite d'avoir besoin
 *        d'exposer l'image sur une URL publique (fonctionne aussi en local).
 * @returns {Promise<string[]>} URLs des images générées
 */
async function generateImage({ prompt, imageDataUri }) {
  if (!isConfigured()) {
    throw Object.assign(new Error('REPLICATE_API_TOKEN non configurée.'), { status: 503 });
  }

  const input = { prompt };
  if (imageDataUri) input.input_image = imageDataUri;

  const res = await fetch(`${API_BASE}/models/${DEFAULT_MODEL}/predictions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
      Prefer: 'wait=25', // tente de répondre de façon synchrone jusqu'à 25s
    },
    body: JSON.stringify({ input }),
  });
  if (!res.ok) {
    throw new Error(`Création de la prédiction Replicate échouée (${res.status}): ${await res.text()}`);
  }
  let data = await res.json();

  if (data.status !== 'succeeded') {
    data = await pollUntilDone(data.urls.get);
  }

  const output = data.output;
  const urls = Array.isArray(output) ? output : [output];
  return urls.filter(Boolean);
}

module.exports = { isConfigured, generateImage, DEFAULT_MODEL };
