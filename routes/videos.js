// Générateur de vidéos produit par IA (image -> courte vidéo animée),
// via Runway (lib/runwayClient.js) — inactif tant que RUNWAY_API_KEY n'est
// pas configurée.
//
// La génération vidéo prend de quelques dizaines de secondes à plusieurs
// minutes : on ne bloque pas la requête HTTP. POST /generate crée la tâche
// et répond immédiatement avec le statut "processing" ; un suivi en tâche
// de fond (setInterval) interroge Runway toutes les quelques secondes et
// met à jour l'enregistrement quand la vidéo est prête. Le client
// (public/videos.html) réinterroge GET / périodiquement pour rafraîchir
// l'état.
//
// ⚠️ Coût réel par génération (plusieurs dollars) — voir README.md. Ce
// suivi en mémoire ne survit pas à un redémarrage du serveur : une tâche
// en cours au moment d'un redéploiement restera "processing" indéfiniment
// côté app (elle continue côté Runway, mais il faudra vérifier son statut
// manuellement sur le tableau de bord Runway dans ce cas).
const fs = require('fs');
const path = require('path');
const express = require('express');
const auth = require('../lib/auth');
const store = require('../lib/store');
const { upload } = require('../lib/uploads');
const runway = require('../lib/runwayClient');

const router = express.Router();

const VIDEO_DIR = path.join(__dirname, '..', 'data', 'videos');
if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });

const POLL_INTERVAL_MS = 8000;
const MAX_POLL_MS = 10 * 60 * 1000; // 10 min de suivi max

function mimeFromBuffer(buffer) {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  return 'image/png';
}

async function trackTask(recordId, taskId) {
  const startedAt = Date.now();
  const tick = async () => {
    try {
      const record = store.find('videos', (v) => v.id === recordId);
      if (!record || record.status !== 'processing') return; // supprimé ou déjà terminé

      const task = await runway.getTask(taskId);
      if (task.status === 'SUCCEEDED') {
        const videoUrl = task.output?.[0];
        if (!videoUrl) throw new Error('Aucune vidéo dans la réponse Runway.');
        const res = await fetch(videoUrl);
        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(path.join(VIDEO_DIR, `${recordId}.mp4`), buffer);
        store.update('videos', recordId, { status: 'ready' });
        return;
      }
      if (task.status === 'FAILED') {
        store.update('videos', recordId, {
          status: 'failed',
          error: task.failure || 'Échec de la génération.',
        });
        return;
      }
      if (Date.now() - startedAt > MAX_POLL_MS) {
        store.update('videos', recordId, {
          status: 'failed',
          error: "Délai de génération dépassé — vérifiez le statut directement sur le tableau de bord Runway.",
        });
        return;
      }
      setTimeout(tick, POLL_INTERVAL_MS);
    } catch (err) {
      store.update('videos', recordId, { status: 'failed', error: err.message });
    }
  };
  setTimeout(tick, POLL_INTERVAL_MS);
}

router.get('/status', auth.requireAuth, (req, res) => {
  res.json({ configured: runway.isConfigured() });
});

router.get('/', auth.requireAuth, (req, res) => {
  const videos = store
    .filter('videos', (v) => v.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ videos });
});

router.post('/generate', auth.requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    if (!runway.isConfigured()) {
      return res.status(503).json({
        error: "Générateur de vidéos non configuré. Renseignez RUNWAY_API_KEY (voir README.md).",
      });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Une photo du produit est requise.' });
    }
    const promptText = String(req.body.prompt || '').trim();
    const dataUri = `data:${mimeFromBuffer(req.file.buffer)};base64,${req.file.buffer.toString('base64')}`;

    const taskId = await runway.createImageToVideoTask({
      promptImage: dataUri,
      promptText,
      duration: 5,
    });

    const record = store.insert('videos', {
      userId: req.user.id,
      prompt: promptText,
      runwayTaskId: taskId,
      status: 'processing',
    });

    trackTask(record.id, taskId);

    res.status(201).json({ video: record });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/file', auth.requireAuth, (req, res) => {
  const video = store.find('videos', (v) => v.id === req.params.id && v.userId === req.user.id);
  if (!video) return res.status(404).end();
  const filePath = path.join(VIDEO_DIR, `${video.id}.mp4`);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

router.delete('/:id', auth.requireAuth, (req, res) => {
  const video = store.find('videos', (v) => v.id === req.params.id && v.userId === req.user.id);
  if (!video) return res.status(404).json({ error: 'Introuvable.' });
  store.remove('videos', video.id);
  const filePath = path.join(VIDEO_DIR, `${video.id}.mp4`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

module.exports = router;
