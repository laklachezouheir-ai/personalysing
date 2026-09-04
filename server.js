require('./lib/fontSetup'); // doit s'exécuter avant tout require('sharp')
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');

const store = require('./lib/store');
const auth = require('./lib/auth');
const uploads = require('./lib/uploads');
const { composePersonalization } = require('./lib/imageCompose');
const etsy = require('./lib/etsyClient');
const seoRoutes = require('./routes/seo');
const mockupRoutes = require('./routes/mockups');
const videoRoutes = require('./routes/videos');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev_secret_a_changer',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 },
  })
);
app.use(express.static(path.join(__dirname, 'public')));

function asyncRoute(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

function getOwnedTemplate(userId, templateId) {
  const template = store.find('templates', (t) => t.id === templateId);
  if (!template || template.userId !== userId) return null;
  return template;
}

function parseZone(raw) {
  let zone = raw;
  if (typeof raw === 'string') {
    try {
      zone = JSON.parse(raw);
    } catch {
      throw Object.assign(new Error('Zone de personnalisation invalide (JSON attendu).'), {
        status: 400,
      });
    }
  }
  const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  const point = (p, fallback) => ({
    x: num(p?.x, fallback.x),
    y: num(p?.y, fallback.y),
  });
  const defaults = {
    tl: { x: 20, y: 100 },
    tr: { x: 220, y: 100 },
    br: { x: 220, y: 160 },
    bl: { x: 20, y: 160 },
  };
  const c = zone?.corners || {};
  return {
    corners: {
      tl: point(c.tl, defaults.tl),
      tr: point(c.tr, defaults.tr),
      br: point(c.br, defaults.br),
      bl: point(c.bl, defaults.bl),
    },
    fontSize: num(zone?.fontSize, 32),
    color: typeof zone?.color === 'string' ? zone.color : '#111111',
    fontFamily: typeof zone?.fontFamily === 'string' ? zone.fontFamily : 'sans-serif',
    align: ['left', 'right', 'center'].includes(zone?.align) ? zone.align : 'center',
    blendMode: zone?.blendMode === 'multiply' ? 'multiply' : 'normal',
  };
}

// ---------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------
app.post(
  '/api/signup',
  asyncRoute(async (req, res) => {
    const user = auth.signup(req.body);
    req.session.userId = user.id;
    res.status(201).json({ user });
  })
);

app.post(
  '/api/login',
  asyncRoute(async (req, res) => {
    const user = auth.login(req.body);
    req.session.userId = user.id;
    res.json({ user });
  })
);

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = store.find('users', (u) => u.id === req.session.userId);
  res.json({ user: auth.publicUser(user) });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// ---------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------
app.get('/api/templates', auth.requireAuth, (req, res) => {
  const templates = store.filter('templates', (t) => t.userId === req.user.id);
  res.json({ templates });
});

app.post(
  '/api/templates',
  auth.requireAuth,
  uploads.upload.single('image'),
  asyncRoute(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) throw Object.assign(new Error('Le nom du template est requis.'), { status: 400 });
    if (!req.file) throw Object.assign(new Error('Une image de base est requise.'), { status: 400 });

    const zone = parseZone(req.body.zone);
    const template = store.insert('templates', {
      userId: req.user.id,
      name,
      zone,
      etsyListingId: req.body.etsyListingId ? String(req.body.etsyListingId).trim() : null,
    });
    await uploads.saveTemplateImage(template.id, req.file.buffer);
    res.status(201).json({ template });
  })
);

app.get('/api/templates/:id', auth.requireAuth, (req, res) => {
  const template = getOwnedTemplate(req.user.id, req.params.id);
  if (!template) return res.status(404).json({ error: 'Template introuvable.' });
  res.json({ template });
});

app.put(
  '/api/templates/:id',
  auth.requireAuth,
  asyncRoute(async (req, res) => {
    const template = getOwnedTemplate(req.user.id, req.params.id);
    if (!template) return res.status(404).json({ error: 'Template introuvable.' });

    const patch = {};
    if (req.body.name) patch.name = String(req.body.name).trim();
    if (req.body.zone) patch.zone = parseZone(req.body.zone);
    if ('etsyListingId' in req.body) {
      patch.etsyListingId = req.body.etsyListingId ? String(req.body.etsyListingId).trim() : null;
    }
    const updated = store.update('templates', template.id, patch);
    res.json({ template: updated });
  })
);

app.delete('/api/templates/:id', auth.requireAuth, (req, res) => {
  const template = getOwnedTemplate(req.user.id, req.params.id);
  if (!template) return res.status(404).json({ error: 'Template introuvable.' });
  store.remove('templates', template.id);
  const imgPath = uploads.templateImagePath(template.id);
  if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  res.json({ ok: true });
});

app.get('/api/templates/:id/image', auth.requireAuth, (req, res) => {
  const template = getOwnedTemplate(req.user.id, req.params.id);
  if (!template) return res.status(404).end();
  const imgPath = uploads.templateImagePath(template.id);
  if (!fs.existsSync(imgPath)) return res.status(404).end();
  res.sendFile(imgPath);
});

// Aperçu instantané (non enregistré) — utilisé pendant l'édition du
// template pour ajuster la zone de texte en direct.
app.post(
  '/api/templates/:id/preview',
  auth.requireAuth,
  asyncRoute(async (req, res) => {
    const template = getOwnedTemplate(req.user.id, req.params.id);
    if (!template) return res.status(404).json({ error: 'Template introuvable.' });
    const imgPath = uploads.templateImagePath(template.id);
    if (!fs.existsSync(imgPath)) return res.status(404).json({ error: 'Image de base manquante.' });

    const zone = req.body.zone ? parseZone(req.body.zone) : template.zone;
    const buffer = await composePersonalization(
      fs.readFileSync(imgPath),
      zone,
      req.body.text || ''
    );
    res.set('Content-Type', 'image/png');
    res.send(buffer);
  })
);

// Génère ET enregistre un aperçu — c'est le geste "j'ai reçu une commande
// personnalisée, je génère le visuel à envoyer à l'acheteur". Fonctionne
// dès aujourd'hui en collant le texte à la main (pas besoin d'attendre
// l'approbation Etsy Commercial Access) ; sera aussi déclenché
// automatiquement par le webhook order.paid une fois la boutique connectée.
app.post(
  '/api/templates/:id/generate',
  auth.requireAuth,
  asyncRoute(async (req, res) => {
    const template = getOwnedTemplate(req.user.id, req.params.id);
    if (!template) return res.status(404).json({ error: 'Template introuvable.' });
    const text = String(req.body.text || '').trim();
    if (!text) throw Object.assign(new Error('Le texte de personnalisation est requis.'), { status: 400 });

    const imgPath = uploads.templateImagePath(template.id);
    const buffer = await composePersonalization(fs.readFileSync(imgPath), template.zone, text);

    const preview = store.insert('previews', {
      userId: req.user.id,
      templateId: template.id,
      templateName: template.name,
      text,
      buyerName: req.body.buyerName ? String(req.body.buyerName).trim() : null,
      note: req.body.note ? String(req.body.note).trim() : null,
      source: 'manual',
      status: 'ready',
    });
    await uploads.savePreviewImage(preview.id, buffer);
    res.status(201).json({ preview });
  })
);

// ---------------------------------------------------------------------
// File d'aperçus ("commandes à traiter")
// ---------------------------------------------------------------------
app.get('/api/previews', auth.requireAuth, (req, res) => {
  let previews = store.filter('previews', (p) => p.userId === req.user.id);
  if (req.query.status) previews = previews.filter((p) => p.status === req.query.status);
  previews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ previews });
});

app.get('/api/previews/:id/image', auth.requireAuth, (req, res) => {
  const preview = store.find('previews', (p) => p.id === req.params.id && p.userId === req.user.id);
  if (!preview) return res.status(404).end();
  const imgPath = uploads.previewImagePath(preview.id);
  if (!fs.existsSync(imgPath)) return res.status(404).end();
  res.sendFile(imgPath);
});

app.post('/api/previews/:id/mark-sent', auth.requireAuth, (req, res) => {
  const preview = store.find('previews', (p) => p.id === req.params.id && p.userId === req.user.id);
  if (!preview) return res.status(404).json({ error: 'Aperçu introuvable.' });
  const updated = store.update('previews', preview.id, { status: 'sent' });
  res.json({ preview: updated });
});

app.delete('/api/previews/:id', auth.requireAuth, (req, res) => {
  const preview = store.find('previews', (p) => p.id === req.params.id && p.userId === req.user.id);
  if (!preview) return res.status(404).json({ error: 'Aperçu introuvable.' });
  store.remove('previews', preview.id);
  const imgPath = uploads.previewImagePath(preview.id);
  if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------
// Intégration Etsy (OAuth + webhook order.paid)
// Inactive tant que ETSY_API_KEY / ETSY_SHARED_SECRET ne sont pas
// configurés (accès "Commercial" en cours de demande côté Etsy).
// ---------------------------------------------------------------------
app.get('/api/etsy/status', auth.requireAuth, (req, res) => {
  const shop = store.find('shops', (s) => s.userId === req.user.id);
  res.json({
    configured: etsy.isConfigured(),
    connected: Boolean(shop),
    shop: shop ? { etsyShopId: shop.etsyShopId, connectedAt: shop.createdAt } : null,
  });
});

app.get('/api/etsy/connect', auth.requireAuth, (req, res) => {
  if (!etsy.isConfigured()) {
    return res.status(503).json({
      error:
        "Intégration Etsy non configurée. Renseignez ETSY_API_KEY et ETSY_SHARED_SECRET (voir README.md).",
    });
  }
  const { codeVerifier, codeChallenge } = etsy.generatePkcePair();
  const state = crypto.randomUUID();
  req.session.etsyOAuth = { codeVerifier, state };
  const url = etsy.getAuthorizationUrl({ state, codeChallenge });
  res.json({ url });
});

app.get(
  '/api/etsy/callback',
  auth.requireAuth,
  asyncRoute(async (req, res) => {
    const pending = req.session.etsyOAuth;
    if (!pending || pending.state !== req.query.state) {
      return res.status(400).send('État OAuth invalide ou expiré, merci de relancer la connexion.');
    }
    const tokenData = await etsy.exchangeCodeForToken({
      code: req.query.code,
      codeVerifier: pending.codeVerifier,
    });
    delete req.session.etsyOAuth;

    // Le user_id Etsy est préfixé dans l'access_token (format "user_id.xxx").
    const etsyUserId = String(tokenData.access_token).split('.')[0];

    const existing = store.find('shops', (s) => s.userId === req.user.id);
    const payload = {
      userId: req.user.id,
      etsyUserId,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    };
    if (existing) store.update('shops', existing.id, payload);
    else store.insert('shops', payload);

    res.redirect('/dashboard.html?etsy=connected');
  })
);

// Webhook order.paid — pas de session (appelé par Etsy), à sécuriser avec
// la vérification de signature une fois les identifiants Etsy obtenus.
app.post(
  '/api/etsy/webhook',
  asyncRoute(async (req, res) => {
    // TODO avant mise en production : vérifier la signature de la requête
    // selon le mécanisme documenté par Etsy pour les webhooks.
    console.log('Webhook Etsy reçu:', JSON.stringify(req.body));
    res.status(202).json({ ok: true });
  })
);

// ---------------------------------------------------------------------
// Fonctionnalités IA additionnelles (optionnelles, chacune inactive tant
// que sa clé API n'est pas configurée — voir README.md).
// ---------------------------------------------------------------------
app.use('/api/seo', seoRoutes);
app.use('/api/mockups', mockupRoutes);
app.use('/api/videos', videoRoutes);

// ---------------------------------------------------------------------
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Erreur serveur.' });
});

app.listen(PORT, () => {
  console.log(`Personalysing démarré sur http://localhost:${PORT}`);
  const inactive = [];
  if (!etsy.isConfigured()) inactive.push('Etsy (ETSY_API_KEY)');
  if (!require('./lib/deepseekClient').isConfigured()) inactive.push('SEO (DEEPSEEK_API_KEY)');
  if (!require('./lib/replicateClient').isConfigured()) inactive.push('Mockups IA (REPLICATE_API_TOKEN)');
  if (!require('./lib/runwayClient').isConfigured()) inactive.push('Vidéos IA (RUNWAY_API_KEY)');
  if (inactive.length) {
    console.log(`Intégrations inactives (clés absentes) : ${inactive.join(', ')} — le reste de l'app fonctionne normalement.`);
  }
});
