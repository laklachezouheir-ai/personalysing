// Point d'entrée unique pour les fichiers binaires (photos de template,
// aperçus, mockups, vidéos) — même principe que lib/store.js pour les
// données structurées : bascule automatique entre deux backends.
//
//   - S3_ENDPOINT/S3_BUCKET/... définis -> stockage objet S3-compatible
//     (lib/objectStorage.js), persistant indépendamment du disque de l'app
//   - absents -> disque local (data/<kind>/<id>.<ext>), repli pratique
//     pour développer sans compte S3, mais perdu à chaque redéploiement
//     sur Render (plan gratuit) — voir README.md.
//
// "kind" identifie le type de fichier (ex: "uploads", "previews",
// "mockups", "videos") et sert à la fois de sous-dossier local et de
// préfixe de clé S3.
const fs = require('fs');
const path = require('path');
const objectStorage = require('./objectStorage');

const LOCAL_ROOT = path.join(__dirname, '..', 'data');

function localPath(kind, id, ext) {
  return path.join(LOCAL_ROOT, kind, `${id}.${ext}`);
}

function objectKey(kind, id, ext) {
  return `${kind}/${id}.${ext}`;
}

function ensureLocalDir(kind) {
  const dir = path.join(LOCAL_ROOT, kind);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Enregistre un fichier. `contentType` n'est utile que pour le backend S3. */
async function save(kind, id, ext, buffer, contentType) {
  if (objectStorage.isConfigured()) {
    await objectStorage.uploadBuffer(objectKey(kind, id, ext), buffer, contentType);
    return;
  }
  ensureLocalDir(kind);
  fs.writeFileSync(localPath(kind, id, ext), buffer);
}

/** Récupère les octets d'un fichier (ex : pour le composer côté serveur). */
async function getBuffer(kind, id, ext) {
  if (objectStorage.isConfigured()) {
    try {
      return await objectStorage.getObjectBuffer(objectKey(kind, id, ext));
    } catch {
      return null;
    }
  }
  const p = localPath(kind, id, ext);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

/**
 * Sert un fichier dans une réponse Express : redirige vers une URL signée
 * temporaire côté S3 (le transfert se fait alors directement entre le
 * navigateur et le stockage objet, pas via notre serveur), ou renvoie le
 * fichier local directement sinon.
 */
async function serve(res, kind, id, ext) {
  if (objectStorage.isConfigured()) {
    try {
      const url = await objectStorage.getSignedGetUrl(objectKey(kind, id, ext));
      return res.redirect(url);
    } catch {
      return res.status(404).end();
    }
  }
  const p = localPath(kind, id, ext);
  if (!fs.existsSync(p)) return res.status(404).end();
  return res.sendFile(p);
}

async function remove(kind, id, ext) {
  if (objectStorage.isConfigured()) {
    try {
      await objectStorage.deleteObject(objectKey(kind, id, ext));
    } catch {
      // déjà absent ou erreur réseau ponctuelle : pas bloquant pour une suppression
    }
    return;
  }
  const p = localPath(kind, id, ext);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

module.exports = { save, getBuffer, serve, remove, usingObjectStorage: objectStorage.isConfigured() };
