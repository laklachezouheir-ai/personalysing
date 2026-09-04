const multer = require('multer');
const sharp = require('sharp');
const fileStore = require('./fileStore');

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

// Ré-encode toujours l'image en PNG via sharp avant de l'enregistrer :
// ça normalise le format et supprime les métadonnées EXIF potentiellement
// sensibles (localisation, appareil...) envoyées par le navigateur.
async function saveTemplateImage(id, buffer) {
  const normalized = await sharp(buffer).png().toBuffer();
  await fileStore.save('uploads', id, 'png', normalized, 'image/png');
}

function getTemplateImageBuffer(id) {
  return fileStore.getBuffer('uploads', id, 'png');
}

function serveTemplateImage(res, id) {
  return fileStore.serve(res, 'uploads', id, 'png');
}

function removeTemplateImage(id) {
  return fileStore.remove('uploads', id, 'png');
}

async function savePreviewImage(id, buffer) {
  await fileStore.save('previews', id, 'png', buffer, 'image/png');
}

function servePreviewImage(res, id) {
  return fileStore.serve(res, 'previews', id, 'png');
}

function removePreviewImage(id) {
  return fileStore.remove('previews', id, 'png');
}

module.exports = {
  upload,
  saveTemplateImage,
  getTemplateImageBuffer,
  serveTemplateImage,
  removeTemplateImage,
  savePreviewImage,
  servePreviewImage,
  removePreviewImage,
};
