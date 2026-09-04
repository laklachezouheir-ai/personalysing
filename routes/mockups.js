// Générateur de mockups produit par IA : le vendeur envoie une photo brute
// de son produit + choisit un style de mise en scène, et reçoit un visuel
// retravaillé (fond/ambiance) prêt pour sa fiche Etsy. Utilise Replicate
// (lib/replicateClient.js) — inactif tant que REPLICATE_API_TOKEN n'est
// pas configurée.
const fs = require('fs');
const path = require('path');
const express = require('express');
const auth = require('../lib/auth');
const store = require('../lib/store');
const { upload } = require('../lib/uploads');
const replicate = require('../lib/replicateClient');
const quotas = require('../lib/quotas');
const { requirePro } = require('../lib/billing');

const router = express.Router();
const MAX_PROMPT_LENGTH = 300;

const MOCKUP_DIR = path.join(__dirname, '..', 'data', 'mockups');
if (!fs.existsSync(MOCKUP_DIR)) fs.mkdirSync(MOCKUP_DIR, { recursive: true });

// Préréglages de mise en scène — évite au vendeur de devoir écrire un
// prompt IA lui-même.
const STYLE_PRESETS = {
  studio: 'studio photography on a clean white seamless background, soft even lighting, product centered, e-commerce style',
  wood_table: 'placed on a rustic wooden table, warm natural window light, cozy lifestyle photography',
  hand_held: 'held in a person\'s hand against a softly blurred neutral background, natural lighting, close-up product photography',
  outdoor: 'outdoor lifestyle setting, soft natural daylight, blurred green background, product in focus',
  marble: 'placed on a white marble surface with soft shadows, minimal elegant flat-lay photography',
};

function mimeFromBuffer(buffer) {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  return 'image/png';
}

router.get('/status', auth.requireAuth, (req, res) => {
  res.json({ configured: replicate.isConfigured(), presets: Object.keys(STYLE_PRESETS) });
});

router.get('/', auth.requireAuth, (req, res) => {
  const mockups = store
    .filter('mockups', (m) => m.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ mockups });
});

router.post('/generate', auth.requireAuth, requirePro, upload.single('image'), async (req, res, next) => {
  try {
    if (!replicate.isConfigured()) {
      return res.status(503).json({
        error: "Générateur de mockups non configuré. Renseignez REPLICATE_API_TOKEN (voir README.md).",
      });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Une photo du produit est requise.' });
    }
    const presetKey = req.body.style;
    const customPrompt = String(req.body.prompt || '').trim().slice(0, MAX_PROMPT_LENGTH);
    const stylePrompt = STYLE_PRESETS[presetKey] || customPrompt;
    if (!stylePrompt) {
      return res.status(400).json({ error: 'Choisissez un style ou décrivez le rendu souhaité.' });
    }
    quotas.assertWithinQuota(req.user.id, 'mockup');

    const dataUri = `data:${mimeFromBuffer(req.file.buffer)};base64,${req.file.buffer.toString('base64')}`;
    const fullPrompt = `Product photography, ${stylePrompt}. Keep the exact same product, do not alter its shape, text or engraving.`;

    const urls = await replicate.generateImage({ prompt: fullPrompt, imageDataUri: dataUri });
    if (!urls.length) throw new Error('Aucune image générée.');
    quotas.recordUsage(req.user.id, 'mockup');

    const record = store.insert('mockups', {
      userId: req.user.id,
      style: presetKey || 'custom',
      prompt: stylePrompt,
      status: 'ready',
    });

    const imgRes = await fetch(urls[0]);
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    fs.writeFileSync(path.join(MOCKUP_DIR, `${record.id}.png`), buffer);

    res.status(201).json({ mockup: record });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/image', auth.requireAuth, (req, res) => {
  const mockup = store.find('mockups', (m) => m.id === req.params.id && m.userId === req.user.id);
  if (!mockup) return res.status(404).end();
  const filePath = path.join(MOCKUP_DIR, `${mockup.id}.png`);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

router.delete('/:id', auth.requireAuth, (req, res) => {
  const mockup = store.find('mockups', (m) => m.id === req.params.id && m.userId === req.user.id);
  if (!mockup) return res.status(404).json({ error: 'Introuvable.' });
  store.remove('mockups', mockup.id);
  const filePath = path.join(MOCKUP_DIR, `${mockup.id}.png`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

module.exports = router;
