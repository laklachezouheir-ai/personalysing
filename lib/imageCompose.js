// Moteur de composition : pose un texte de personnalisation sur la photo
// de base d'un template, à l'emplacement défini par le vendeur.
//
// Approche : on génère un calque SVG contenant le texte, puis on le
// superpose à l'image avec sharp. C'est la technique standard pour du texte
// dynamique sur image en Node (pas besoin d'un moteur de rendu IA — de la
// simple composition d'image, donc pas de coût d'API).
const sharp = require('sharp');
const fonts = require('./fonts');

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Estimation grossière de la largeur d'un texte pour une police donnée,
// afin de réduire automatiquement la taille de police si le texte
// personnalisé est trop long pour la zone définie par le vendeur.
function estimateTextWidth(text, fontSize) {
  const AVG_CHAR_WIDTH_RATIO = 0.58;
  return text.length * fontSize * AVG_CHAR_WIDTH_RATIO;
}

function fitFontSize(text, zone) {
  let fontSize = zone.fontSize || 32;
  const maxWidth = zone.width * 0.92; // petite marge de sécurité
  const minFontSize = 10;
  while (fontSize > minFontSize && estimateTextWidth(text, fontSize) > maxWidth) {
    fontSize -= 1;
  }
  return fontSize;
}

/**
 * @param {Buffer} baseImageBuffer - image de base du template (PNG/JPEG)
 * @param {object} zone - { x, y, width, height, fontSize, color, fontFamily, align }
 * @param {string} text - texte de personnalisation saisi par l'acheteur
 * @returns {Promise<Buffer>} image composée (PNG)
 */
async function composePersonalization(baseImageBuffer, zone, text) {
  const image = sharp(baseImageBuffer);
  const meta = await image.metadata();
  const width = meta.width;
  const height = meta.height;

  const safeText = escapeXml(text || '');
  const fontSize = fitFontSize(text || '', zone);
  const align = zone.align === 'left' || zone.align === 'right' ? zone.align : 'middle';
  const textAnchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  const anchorX =
    align === 'left'
      ? zone.x
      : align === 'right'
      ? zone.x + zone.width
      : zone.x + zone.width / 2;
  const anchorY = zone.y + zone.height / 2 + fontSize * 0.35; // approx centrage vertical
  const color = zone.color || '#111111';
  const { cssName: fontFamily, weight: fontWeight } = fonts.resolveFont(zone.fontFamily);

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
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

  const svgBuffer = Buffer.from(svg);

  const composed = await image
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .png()
    .toBuffer();

  return composed;
}

module.exports = { composePersonalization, fitFontSize, escapeXml };
