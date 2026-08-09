/**
 * Régénère le bloc <style id="tw"> de la page à partir des classes réellement
 * présentes dans le fichier. À relancer après toute modification du markup :
 *
 *     node tools/build-css.js "Repas v0.22.html"
 *
 * Prérequis : npm i -D tailwindcss@3
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const target = process.argv[2] || 'Repas v0.22.html';
const file = path.resolve(target);
const html = fs.readFileSync(file, 'utf8');

const OPEN = '<style id="tw">';
const start = html.indexOf(OPEN);
if (start < 0) throw new Error(`Bloc ${OPEN} introuvable dans ${target}`);
const contentStart = start + OPEN.length;
const end = html.indexOf('</style>', contentStart);
if (end < 0) throw new Error('Balise </style> fermante introuvable');

// On scanne la page SANS le CSS déjà injecté, pour ne pas ré-extraire ses propres sélecteurs
const tmp = path.join(os.tmpdir(), 'planrepas-scan.html');
fs.writeFileSync(tmp, html.slice(0, contentStart) + html.slice(end), 'utf8');

const cfg = path.join(os.tmpdir(), 'planrepas-tw.config.js');
fs.writeFileSync(cfg, `module.exports = {
  darkMode: 'class',
  content: [${JSON.stringify(tmp)}],
  theme: { extend: {
    colors: {
      canvas: '#0b1326', surface: '#171f33', 'surface-high': '#222a3d',
      'surface-highest': '#2d3449', 'surface-lowest': '#060e20',
      primary: '#10b981', 'primary-glow': '#4edea3',
      secondary: '#3b82f6', 'secondary-glow': '#adc6ff',
      tertiary: '#a855f7', 'tertiary-glow': '#ddb7ff',
      danger: '#ef4444', warning: '#f59e0b'
    },
    fontFamily: {
      h1: ['Outfit', 'sans-serif'], h2: ['Outfit', 'sans-serif'],
      body: ['Plus Jakarta Sans', 'sans-serif'], macro: ['Outfit', 'sans-serif']
    }
  } }
};`, 'utf8');

const input = path.join(os.tmpdir(), 'planrepas-tw.css');
fs.writeFileSync(input, '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n', 'utf8');
const output = path.join(os.tmpdir(), 'planrepas-tw.out.css');

// On appelle l'entrée JS de Tailwind directement : spawn d'un .cmd échoue sous Windows
const cli = require.resolve('tailwindcss/lib/cli.js', { paths: [path.dirname(file)] });
execFileSync(process.execPath, [cli, '-c', cfg, '-i', input, '-o', output, '--minify'],
    { stdio: 'pipe' });

const css = fs.readFileSync(output, 'utf8').trim();
fs.writeFileSync(file, html.slice(0, contentStart) + css + html.slice(end), 'utf8');

// Contrôle : toute classe utilisée dans le markup doit exister dans le CSS
const tokens = new Set();
for (const m of html.matchAll(/class="([^"]*)"/g)) {
    // On retire les interpolations ${...} : leur contenu est du JS, pas des classes
    m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).forEach((t) => { if (t) tokens.add(t); });
}
const OWN = new Set(['glass-panel', 'glass-card-hover', 'inset-glass', 'drag-over', 'toast',
    'material-symbols-outlined', 'modal', 'chip-btn', 'no-print', 'day-active', 'glow-primary',
    'dark', 'light', 'placing']);
const escapeSel = (s) => s.replace(/[.:/[\]()#,%!]/g, (c) => '\\' + c);
const missing = [...tokens].filter((t) =>
    !OWN.has(t) &&
    /^[a-z][a-z0-9:/[\]._-]*$/i.test(t) &&   // écarte les fragments de template literal (quotes, accolades)
    !css.includes('.' + escapeSel(t)));

console.log(`CSS régénéré : ${(css.length / 1024).toFixed(1)} Ko`);
if (missing.length) {
    console.error('Classes absentes du CSS :', missing.join(', '));
    process.exit(1);
}
console.log(`${tokens.size} classes vérifiées, aucune manquante.`);
