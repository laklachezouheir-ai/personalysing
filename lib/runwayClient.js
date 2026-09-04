// Client Runway — génération de vidéos produit par IA (image -> vidéo).
// Doc : https://docs.dev.runwayml.com/
//
// ⚠️ API en évolution rapide : le nom du modèle (RUNWAY_MODEL), le format
// exact de "ratio" et la version d'API (header X-Runway-Version) sont
// susceptibles de changer. Valeurs par défaut correctes au moment de
// l'écriture — À VÉRIFIER sur https://docs.dev.runwayml.com/ avant mise
// en production, notamment le format de `promptImage` (URL vs data URI)
// et les tailles/durées disponibles pour le modèle choisi.
const API_BASE = 'https://api.dev.runwayml.com/v1';
const API_VERSION = '2024-11-06';
const MODEL = process.env.RUNWAY_MODEL || 'gen4_turbo';

function isConfigured() {
  return Boolean(process.env.RUNWAY_API_KEY);
}

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
    'X-Runway-Version': API_VERSION,
  };
}

/**
 * Démarre une tâche de génération vidéo à partir d'une image.
 * @param {object} opts
 * @param {string} opts.promptImage - image de départ (data URI ou URL publique)
 * @param {string} [opts.promptText] - description de l'animation souhaitée
 * @param {string} [opts.ratio] - ex : "1280:720"
 * @param {number} [opts.duration] - durée en secondes (5 ou 10 selon le modèle)
 * @returns {Promise<string>} id de la tâche, à suivre via getTask()
 */
async function createImageToVideoTask({ promptImage, promptText, ratio = '1280:720', duration = 5 }) {
  if (!isConfigured()) {
    throw Object.assign(new Error('RUNWAY_API_KEY non configurée.'), { status: 503 });
  }
  const res = await fetch(`${API_BASE}/image_to_video`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: MODEL,
      promptImage,
      promptText: promptText || '',
      ratio,
      duration,
    }),
  });
  if (!res.ok) {
    throw new Error(`Création de la tâche Runway échouée (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.id;
}

/**
 * @param {string} taskId
 * @returns {Promise<{status: string, output?: string[], failure?: string}>}
 */
async function getTask(taskId) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}`, { headers: headers() });
  if (!res.ok) {
    throw new Error(`Suivi de la tâche Runway échoué (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

module.exports = { isConfigured, createImageToVideoTask, getTask, MODEL };
