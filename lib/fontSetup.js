// Enregistre nos polices embarquées (assets/fonts) auprès de fontconfig,
// la bibliothèque système utilisée par librsvg (moteur SVG de sharp) pour
// résoudre les noms de police. On ne modifie aucun dossier système : on
// génère une config fontconfig minimale qui inclut à la fois les polices
// système et notre dossier de polices, puis on pointe dessus via la
// variable d'environnement FONTCONFIG_FILE.
//
// IMPORTANT : ce module doit être chargé tout en haut de server.js, avant
// tout `require('sharp')` (direct ou transitif), sans quoi fontconfig aura
// déjà pu s'initialiser avec la config par défaut.
const fs = require('fs');
const path = require('path');
const os = require('os');

const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const CONF_PATH = path.join(os.tmpdir(), 'personalysing-fonts.conf');
const CACHE_DIR = path.join(os.tmpdir(), 'personalysing-fontcache');

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

const conf = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>/usr/share/fonts</dir>
  <dir>${FONTS_DIR}</dir>
  <cachedir>${CACHE_DIR}</cachedir>
</fontconfig>
`;

fs.writeFileSync(CONF_PATH, conf);
process.env.FONTCONFIG_FILE = CONF_PATH;
