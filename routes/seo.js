// Optimiseur SEO Etsy : à partir d'une courte description produit, génère
// un titre, une liste de tags et une description optimisés pour la
// recherche Etsy. Utilise l'API DeepSeek (lib/deepseekClient.js) — inactif
// tant que DEEPSEEK_API_KEY n'est pas configurée.
const express = require('express');
const auth = require('../lib/auth');
const store = require('../lib/store');
const deepseek = require('../lib/deepseekClient');
const quotas = require('../lib/quotas');

const router = express.Router();
const MAX_DESCRIPTION_LENGTH = 600;

const SYSTEM_PROMPT = `Tu es un expert en référencement (SEO) pour la marketplace Etsy.
On te donne une courte description d'un produit fait-main ou personnalisé.
Réponds UNIQUEMENT en JSON strict avec ce format exact, sans texte autour :
{
  "title": "titre optimisé, 120-140 caractères maximum, avec les mots-clés les plus recherchés en premier",
  "tags": ["13 tags Etsy, chacun 20 caractères maximum, pertinents et variés (pas de doublons)"],
  "description": "description produit engageante de 3-4 phrases, incluant naturellement des mots-clés pertinents"
}
Écris en français sauf si la description fournie est en anglais, auquel cas réponds en anglais.`;

router.get('/status', auth.requireAuth, (req, res) => {
  res.json({ configured: deepseek.isConfigured() });
});

router.post('/generate', auth.requireAuth, async (req, res, next) => {
  try {
    const description = String(req.body.description || '').trim();
    if (!description) {
      return res.status(400).json({ error: 'Une description du produit est requise.' });
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return res.status(400).json({
        error: `Description trop longue (max ${MAX_DESCRIPTION_LENGTH} caractères).`,
      });
    }
    if (!deepseek.isConfigured()) {
      return res.status(503).json({
        error: "Optimiseur SEO non configuré. Renseignez DEEPSEEK_API_KEY (voir README.md).",
      });
    }
    quotas.assertWithinQuota(req.user.id, 'seo');

    const raw = await deepseek.chat({
      system: SYSTEM_PROMPT,
      user: description,
      json: true,
    });
    quotas.recordUsage(req.user.id, 'seo');

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw Object.assign(new Error("Réponse IA invalide, merci de réessayer."), { status: 502 });
    }

    const result = store.insert('seoResults', {
      userId: req.user.id,
      input: description,
      title: String(parsed.title || '').slice(0, 140),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 13).map((t) => String(t).slice(0, 20)) : [],
      description: String(parsed.description || ''),
    });

    res.status(201).json({ result });
  } catch (err) {
    next(err);
  }
});

router.get('/history', auth.requireAuth, (req, res) => {
  const results = store
    .filter('seoResults', (r) => r.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ results });
});

router.delete('/:id', auth.requireAuth, (req, res) => {
  const result = store.find('seoResults', (r) => r.id === req.params.id && r.userId === req.user.id);
  if (!result) return res.status(404).json({ error: 'Introuvable.' });
  store.remove('seoResults', result.id);
  res.json({ ok: true });
});

module.exports = router;
