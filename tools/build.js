/**
 * Assemble `index.html` à partir de src/.
 *
 *     node tools/build.js            # construit index.html puis recompile le CSS
 *     node tools/build.js --no-css   # saute la recompilation Tailwind
 *
 * L'application reste livrée comme un fichier unique et autonome : le
 * découpage n'existe que dans les sources, pour que les fonctions pures
 * soient testables et que les diffs restent lisibles.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildCss } from './build-css.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'index.html');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
/** « 0.23.0 » -> « 0.23 » : la version affichée suit celle du paquet. */
const VERSION = pkg.version.split('.').slice(0, 2).join('.');

/* ---------- Assemblage du script ---------- */

/**
 * Les modules de src/js sont de vrais modules ES, importables par les tests.
 * Concaténés dans une IIFE ils partagent la même portée : les déclarations
 * `import` deviennent inutiles et `export` n'a plus de sens.
 */
function stripModuleSyntax(code) {
    return code
        .replace(/^import\s[^;]*;/gm, '')                       // import ... from '...';
        .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '')          // export { a, b };
        .replace(/^export\s+(?=const|let|var|function|async|class)/gm, '');
}

function assembleScript() {
    const dir = path.join(SRC, 'js');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
    if (!files.length) throw new Error('Aucun module dans src/js');

    const parts = files.map((file) => {
        const code = stripModuleSyntax(fs.readFileSync(path.join(dir, file), 'utf8'));
        const body = code.replace(/\n{3,}/g, '\n\n').trim();
        return `/* ===== ${file} ===== */\n\n${body}`;
    });

    const joined = parts.join('\n\n');

    const leftovers = joined.match(/^\s*(import|export)\s/gm);
    if (leftovers) throw new Error(`Syntaxe de module non retirée (${leftovers.length} occurrence(s))`);

    // Indentation alignée sur l'IIFE du gabarit
    return joined.split('\n').map((l) => (l.trim() ? '        ' + l : '')).join('\n');
}

/* ---------- Sprite d'icônes ---------- */

function loadIcons() {
    const svg = fs.readFileSync(path.join(SRC, 'icons.svg'), 'utf8');
    // Les commentaires documentent la source, pas la page livrée.
    return svg.replace(/<!--[\s\S]*?-->/g, '').trim();
}

/* ---------- Politique de sécurité ---------- */

/**
 * Chaque script inline est autorisé par son empreinte plutôt que par
 * `unsafe-inline` : une balise `<script>` injectée ne s'exécuterait pas.
 */
function buildCsp(html) {
    const hashes = [];
    for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
        hashes.push(`'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
    }

    const policy = [
        "default-src 'none'",
        `script-src ${hashes.join(' ')}`,
        // 'unsafe-inline' reste nécessaire pour les attributs style="" (les
        // empreintes ne couvrent pas les attributs).
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        'font-src https://fonts.gstatic.com',
        // `https:` autorise la photo distante que l'utilisateur colle lui-même
        // dans le formulaire de recette. Ce qui protège vraiment ses données,
        // c'est `connect-src` : aucune requête ne peut sortir de la page.
        "img-src 'self' data: https:",
        "manifest-src 'self'",
        "worker-src 'self'",
        "connect-src 'self'",
        "base-uri 'none'",
        "form-action 'none'"
    ].join('; ');

    return `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
}

/* ---------- Construction ---------- */

function build({ css = true } = {}) {
    let html = fs.readFileSync(path.join(SRC, 'template.html'), 'utf8');

    // Remplacements par FONCTION et non par chaîne : dans une chaîne de
    // remplacement, `$&`, `` $` `` et `$'` sont des motifs spéciaux. Le code
    // contient des `` $` `` (`$(`bar-${slug}`)`), qui recopiaient tout le
    // début du document au milieu du script.
    html = html.replace('<!--@ICONS@-->', () => loadIcons());
    html = html.replace('<!--@SCRIPT@-->', () => assembleScript());
    html = html.replaceAll('@VERSION@', () => VERSION);

    if (html.includes('@VERSION@') || html.includes('<!--@SCRIPT@-->') || html.includes('<!--@ICONS@-->')) {
        throw new Error('Un marqueur du gabarit n\'a pas été remplacé');
    }

    // La CSP se calcule sur le HTML final : elle scelle les scripts assemblés.
    html = html.replace('<!--@CSP@-->', buildCsp(html));

    fs.writeFileSync(OUT, html, 'utf8');
    console.log(`index.html écrit : ${(html.length / 1024).toFixed(1)} Ko (v${VERSION})`);

    if (css) buildCss(OUT);
    return OUT;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
    try {
        build({ css: !process.argv.includes('--no-css') });
    } catch (e) {
        console.error('Échec de la construction :', e.message);
        process.exit(1);
    }
}

export { build, assembleScript, stripModuleSyntax, VERSION };
