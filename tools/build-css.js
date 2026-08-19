/**
 * Régénère le bloc <style id="tw"> d'une page à partir des classes réellement
 * présentes dans son markup. Appelé par tools/build.js, ou seul :
 *
 *     node tools/build-css.js index.html
 *
 * Prérequis : npm i -D tailwindcss@3
 *
 * Le CSS n'est volontairement PAS minifié : il constituait une unique ligne de
 * 20 000 caractères qui rendait illisible le moindre diff de la page.
 * La compression réseau fait le travail que la minification faisait ici.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const OPEN = '<style id="tw">';

/** Classes définies à la main dans le gabarit, hors de Tailwind. */
const OWN = new Set([
    'glass-panel', 'glass-card-hover', 'inset-glass', 'drag-over', 'toast',
    'modal', 'chip-btn', 'no-print', 'day-active', 'glow-primary',
    'dark', 'light', 'placing', 'ico', 'muted'
]);

const escapeSel = (s) => s.replace(/[.:/[\]()#,%!]/g, (c) => '\\' + c);

export function buildCss(target) {
    const file = path.resolve(target);
    const html = fs.readFileSync(file, 'utf8');

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
    execFileSync(process.execPath, [cli, '-c', cfg, '-i', input, '-o', output], { stdio: 'pipe' });

    const css = fs.readFileSync(output, 'utf8').trim();
    fs.writeFileSync(file, html.slice(0, contentStart) + '\n' + css + '\n' + html.slice(end), 'utf8');

    // Contrôle : toute classe utilisée dans le markup doit exister dans le CSS
    const tokens = new Set();
    for (const m of html.matchAll(/class="([^"]*)"/g)) {
        // On retire les interpolations ${...} : leur contenu est du JS, pas des classes
        m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).forEach((t) => { if (t) tokens.add(t); });
    }
    const missing = [...tokens].filter((t) =>
        !OWN.has(t) &&
        /^[a-z][a-z0-9:/[\]._-]*$/i.test(t) &&   // écarte les fragments de template literal
        !css.includes('.' + escapeSel(t)));

    console.log(`CSS régénéré : ${(css.length / 1024).toFixed(1)} Ko, ${css.split('\n').length} lignes`);
    if (missing.length) {
        throw new Error(`Classes absentes du CSS : ${missing.join(', ')}`);
    }
    console.log(`${tokens.size} classes vérifiées, aucune manquante.`);
    return css;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
    try {
        buildCss(process.argv[2] || 'index.html');
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }
}
