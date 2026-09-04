// Client DeepSeek (API compatible OpenAI) — utilisé pour l'optimiseur SEO.
// Doc : https://api-docs.deepseek.com/
const API_BASE = 'https://api.deepseek.com/v1';

function isConfigured() {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

/**
 * @param {object} opts
 * @param {string} opts.system - message système (instructions)
 * @param {string} opts.user - message utilisateur (contenu)
 * @param {boolean} [opts.json] - si true, demande une réponse JSON stricte
 * @returns {Promise<string>} contenu texte de la réponse
 */
async function chat({ system, user, json = false }) {
  if (!isConfigured()) {
    throw Object.assign(new Error('DEEPSEEK_API_KEY non configurée.'), { status: 503 });
  }
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Appel DeepSeek échoué (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

module.exports = { isConfigured, chat };
