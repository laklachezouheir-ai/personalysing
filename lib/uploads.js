const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');

const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads');
const PREVIEW_DIR = path.join(__dirname, '..', 'data', 'previews');

for (const dir of [UPLOAD_DIR, PREVIEW_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 Mo
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) {
      return cb(new Error('Format d’image non supporté (PNG, JPG ou WEBP uniquement).'));
    }
    cb(null, true);
  },
});

// Ré-encode toujours l'image en PNG via sharp avant de l'écrire sur disque :
// ça normalise le format et supprime les métadonnées EXIF potentiellement
// sensibles (localisation, appareil...) envoyées par le navigateur.
async function saveTemplateImage(id, buffer) {
  const filePath = path.join(UPLOAD_DIR, `${id}.png`);
  const normalized = await sharp(buffer).png().toBuffer();
  fs.writeFileSync(filePath, normalized);
  return filePath;
}

function templateImagePath(id) {
  return path.join(UPLOAD_DIR, `${id}.png`);
}

async function savePreviewImage(id, buffer) {
  const filePath = path.join(PREVIEW_DIR, `${id}.png`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function previewImagePath(id) {
  return path.join(PREVIEW_DIR, `${id}.png`);
}

module.exports = {
  upload,
  saveTemplateImage,
  templateImagePath,
  savePreviewImage,
  previewImagePath,
};
