// Déformation en perspective (« corner-pin ») d'un calque rectangulaire
// vers un quadrilatère quelconque — la même technique que les outils de
// mockup pro utilisent pour poser du texte sur une surface inclinée/pivotée
// dans une photo, sans modèle 3D : on calcule la transformation projective
// qui envoie les 4 coins du calque source sur les 4 coins choisis par le
// vendeur, puis on ré-échantillonne chaque pixel de destination depuis la
// source (bilinéaire), ce qui fait suivre au texte les 3 axes apparents de
// la photo (rotation, inclinaison horizontale, profondeur).
//
// Référence de l'algorithme (mapping carré -> quadrilatère) :
// Paul Heckbert, "Fundamentals of Texture Mapping and Image Warping", 1989.

// --- Algèbre matricielle 3x3 minimale ---
function multiply3x3(a, b) {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
      }
    }
  }
  return r;
}

function invert3x3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;
  return [A, D, G, B, E, H, C, F, I].map((v) => v * invDet);
}

// Mapping carré unité [0,1]x[0,1] -> quadrilatère (x0,y0)..(x3,y3), coins
// dans l'ordre haut-gauche, haut-droit, bas-droit, bas-gauche.
function squareToQuad(x0, y0, x1, y1, x2, y2, x3, y3) {
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;

  let a, b, c, d, e, f, g, h;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    // Cas affine (parallélogramme) : pas de terme de perspective.
    a = x1 - x0;
    b = x2 - x1;
    c = x0;
    d = y1 - y0;
    e = y2 - y1;
    f = y0;
    g = 0;
    h = 0;
  } else {
    const denom = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / denom;
    h = (dx1 * dy3 - dx3 * dy1) / denom;
    a = x1 - x0 + g * x1;
    b = x3 - x0 + h * x3;
    c = x0;
    d = y1 - y0 + g * y1;
    e = y3 - y0 + h * y3;
    f = y0;
  }
  return [a, b, c, d, e, f, g, h, 1];
}

/**
 * Construit la matrice homogène qui envoie un point (sx, sy) du calque
 * source (largeur W, hauteur H) vers le quadrilatère de destination.
 */
function buildForwardMatrix(W, H, corners) {
  const { tl, tr, br, bl } = corners;
  const Q = squareToQuad(tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y);
  const S = [1 / W, 0, 0, 0, 1 / H, 0, 0, 0, 1];
  return multiply3x3(Q, S);
}

function applyMatrix(m, x, y) {
  const w = m[6] * x + m[7] * y + m[8];
  return {
    x: (m[0] * x + m[1] * y + m[2]) / w,
    y: (m[3] * x + m[4] * y + m[5]) / w,
  };
}

function bilinearSample(src, W, H, sx, sy) {
  if (sx < 0 || sy < 0 || sx > W - 1 || sy > H - 1) return null;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = Math.min(x0 + 1, W - 1);
  const y1 = Math.min(y0 + 1, H - 1);
  const fx = sx - x0;
  const fy = sy - y0;

  const px = (x, y) => {
    const idx = (y * W + x) * 4;
    return [src[idx], src[idx + 1], src[idx + 2], src[idx + 3]];
  };
  const p00 = px(x0, y0);
  const p10 = px(x1, y0);
  const p01 = px(x0, y1);
  const p11 = px(x1, y1);

  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const top = p00[c] * (1 - fx) + p10[c] * fx;
    const bottom = p01[c] * (1 - fx) + p11[c] * fx;
    out[c] = top * (1 - fy) + bottom * fy;
  }
  return out;
}

/**
 * @param {Buffer} srcRgba - pixels bruts RGBA du calque source (texte sur fond transparent)
 * @param {number} W - largeur du calque source
 * @param {number} H - hauteur du calque source
 * @param {{tl:{x,y},tr:{x,y},br:{x,y},bl:{x,y}}} corners - quadrilatère de destination
 *        (coordonnées dans l'espace de l'image finale)
 * @returns {{buffer: Buffer, left: number, top: number, width: number, height: number}}
 *          calque RGBA déformé, prêt à être composité à (left, top).
 */
function warpToQuad(srcRgba, W, H, corners) {
  const xs = [corners.tl.x, corners.tr.x, corners.br.x, corners.bl.x];
  const ys = [corners.tl.y, corners.tr.y, corners.br.y, corners.bl.y];
  const minX = Math.floor(Math.min(...xs));
  const maxX = Math.ceil(Math.max(...xs));
  const minY = Math.floor(Math.min(...ys));
  const maxY = Math.ceil(Math.max(...ys));
  const outW = Math.max(1, maxX - minX);
  const outH = Math.max(1, maxY - minY);

  const forward = buildForwardMatrix(W, H, corners);
  const inverse = invert3x3(forward);
  const out = Buffer.alloc(outW * outH * 4);

  if (!inverse) {
    return { buffer: out, left: minX, top: minY, width: outW, height: outH };
  }

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const dest = applyMatrix(inverse, minX + x + 0.5, minY + y + 0.5);
      const sample = bilinearSample(srcRgba, W, H, dest.x, dest.y);
      if (sample) {
        const idx = (y * outW + x) * 4;
        out[idx] = sample[0];
        out[idx + 1] = sample[1];
        out[idx + 2] = sample[2];
        out[idx + 3] = sample[3];
      }
    }
  }

  return { buffer: out, left: minX, top: minY, width: outW, height: outH };
}

module.exports = { warpToQuad, buildForwardMatrix, invert3x3, applyMatrix };
