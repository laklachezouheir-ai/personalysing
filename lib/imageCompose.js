// Moteur de composition : pose un texte de personnalisation sur la photo
// de base d'un template, en suivant le quadrilatère (4 coins) défini par
// le vendeur pour épouser l'angle réel du support dans la photo.
//
// Étapes :
//   1. Rendu du texte "à plat" (SVG -> pixels bruts RGBA, fond transparent),
//      à une résolution proche de la taille apparente dans la photo.
//   2. Déformation en perspective de ce calque vers le quadrilatère de
//      destination (lib/perspectiveWarp.js).
//   3. Composition sur l'image de base, avec un mode de fusion optionnel
//      ("multiply") pour laisser transparaître les reflets/ombres du
//      support et renforcer l'effet "gravé" plutôt que "collé".
const sharp = require('sharp');
const fonts = require('./fonts');
const { warpToQuad } = require('./perspectiveWarp');

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function estimateTextWidth(text, fontSize) {
  const AVG_CHAR_WIDTH_RATIO = 0.58;
  return text.length * fontSize * AVG_CHAR_WIDTH_RATIO;
}

function fitFontSize(text, maxWidth, baseFontSize) {
  let fontSize = baseFontSize || 32;
  const minFontSize = 8;
  while (fontSize > minFontSize && estimateTextWidth(text, fontSize) > maxWidth * 0.92) {
    fontSize -= 1;
  }
  return fontSize;
}

function dist(p1, p2) {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

// Normalise une zone : accepte soit le nouveau format à 4 coins
// ({ corners: { tl, tr, br, bl } }), soit l'ancien format rectangle
// ({ x, y, width, height }) pour compatibilité descendante.
function normalizeCorners(zone) {
  if (zone.corners && zone.corners.tl && zone.corners.tr && zone.corners.br && zone.corners.bl) {
    return zone.corners;
  }
  const x = zone.x || 0;
  const y = zone.y || 0;
  const w = zone.width || 200;
  const h = zone.height || 60;
  return {
    tl: { x, y },
    tr: { x: x + w, y },
    br: { x: x + w, y: y + h },
    bl: { x, y: y + h },
  };
}

/**
 * @param {Buffer} baseImageBuffer - image de base du template (PNG/JPEG)
 * @param {object} zone - { corners: {tl,tr,br,bl}, fontSize, color, fontFamily, align, blendMode }
 * @param {string} text - texte de personnalisation saisi par l'acheteur
 * @returns {Promise<Buffer>} image composée (PNG)
 */
async function composePersonalization(baseImageBuffer, zone, text) {
  const baseImage = sharp(baseImageBuffer);
  const meta = await baseImage.metadata();
  const safeText = escapeXml(text || '');

  const corners = normalizeCorners(zone);
  const topWidth = dist(corners.tl, corners.tr);
  const leftHeight = dist(corners.tl, corners.bl);
  const rightHeight = dist(corners.tr, corners.br);
  // Résolution du calque "à plat" : on garde une échelle proche de la
  // taille apparente dans la photo pour éviter le flou au ré-échantillonnage,
  // avec un plancher pour rester lisible sur de très petites zones.
  const layerW = Math.max(40, Math.round(topWidth));
  const layerH = Math.max(24, Math.round((leftHeight + rightHeight) / 2));

  const fontSize = fitFontSize(text || '', layerW, zone.fontSize);
  const { cssName: fontFamily, weight: fontWeight } = fonts.resolveFont(zone.fontFamily);
  const color = zone.color || '#111111';
  const align = zone.align === 'left' || zone.align === 'right' ? zone.align : 'center';
  const textAnchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  const anchorX = align === 'left' ? 4 : align === 'right' ? layerW - 4 : layerW / 2;
  const anchorY = layerH / 2 + fontSize * 0.35; // approx centrage vertical

  const flatSvg = `
    <svg width="${layerW}" height="${layerH}" xmlns="http://www.w3.org/2000/svg">
      <text
        x="${anchorX}"
        y="${anchorY}"
        font-size="${fontSize}"
        font-family="${escapeXml(fontFamily)}"
        font-weight="${fontWeight}"
        fill="${escapeXml(color)}"
        text-anchor="${textAnchor}"
      >${safeText}</text>
    </svg>
  `;

  // Calque texte "à plat" en pixels bruts RGBA (nécessaire pour le
  // ré-échantillonnage bilinéaire du warp en perspective).
  const { data: flatRgba } = await sharp(Buffer.from(flatSvg))
    .resize(layerW, layerH)
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  const warped = warpToQuad(flatRgba, layerW, layerH, corners);

  // On recadre le calque déformé aux limites de l'image de base pour
  // éviter une position/largeur négative rejetée par sharp.composite().
  const left = Math.max(0, Math.min(warped.left, meta.width - 1));
  const top = Math.max(0, Math.min(warped.top, meta.height - 1));
  const cropLeft = left - warped.left;
  const cropTop = top - warped.top;
  const width = Math.max(1, Math.min(warped.width - cropLeft, meta.width - left));
  const height = Math.max(1, Math.min(warped.height - cropTop, meta.height - top));

  const croppedBuffer = await sharp(warped.buffer, {
    raw: { width: warped.width, height: warped.height, channels: 4 },
  })
    .extract({ left: cropLeft, top: cropTop, width, height })
    .raw()
    .toBuffer();

  const blend = zone.blendMode === 'multiply' ? 'multiply' : 'over';

  const composed = await baseImage
    .composite([{ input: croppedBuffer, raw: { width, height, channels: 4 }, left, top, blend }])
    .png()
    .toBuffer();

  return composed;
}

module.exports = { composePersonalization, normalizeCorners };
