// Registre de polices embarquées dans l'app (fichiers .ttf sous
// assets/fonts, licence SIL Open Font License — libres de redistribution).
//
// Pourquoi embarquer nos propres polices plutôt que compter sur celles du
// système : le rendu doit être identique quel que soit l'environnement
// d'exécution (poste de dev, Render, etc.), qui n'a pas forcément de police
// "cursive" ou "élégante" installée. lib/fontSetup.js enregistre le dossier
// assets/fonts auprès de fontconfig au démarrage ; ce module fait juste le
// lien entre la clé choisie par le vendeur (zone.fontFamily) et le nom de
// famille exact que fontconfig connaît pour ce fichier.
const DEFAULT_KEY = 'sans-serif';

const FONT_LIBRARY = {
  'sans-serif': { cssName: 'Poppins', weight: 'normal', label: 'Sans-serif (moderne)' },
  'sans-serif-bold': { cssName: 'Poppins SemiBold', weight: 'normal', label: 'Sans-serif gras' },
  modern: { cssName: 'Montserrat', weight: 'normal', label: 'Moderne (Montserrat)' },
  serif: { cssName: 'Playfair Display', weight: 'normal', label: 'Élégant (serif)' },
  'serif-bold': { cssName: 'Playfair Display', weight: 'bold', label: 'Élégant gras' },
  cursive: { cssName: 'Dancing Script', weight: 'normal', label: 'Manuscrite' },
  script: { cssName: 'Great Vibes', weight: 'normal', label: 'Calligraphiée' },
};

function resolveFont(key) {
  const entry = FONT_LIBRARY[key] || FONT_LIBRARY[DEFAULT_KEY];
  return { cssName: entry.cssName, weight: entry.weight };
}

function listFonts() {
  return Object.entries(FONT_LIBRARY).map(([key, v]) => ({ key, label: v.label }));
}

module.exports = { FONT_LIBRARY, DEFAULT_KEY, resolveFont, listFonts };
