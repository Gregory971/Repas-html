/*
 * Nettoie un fichier de recettes importées :
 *   - retire boissons, alcools, cocktails, sauces et condiments
 *   - assainit les noms d'ingrédients trop bavards
 *   - avec --photos, va chercher les illustrations manquantes
 *
 *     node tools/clean-recipes.mjs [chemin] [--photos] [--ecrire]
 *
 * Sans --ecrire, le script se contente de rendre compte.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { BOISSON, SAUCE } from './audit-recipes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chemin = process.argv.slice(2).find((a) => !a.startsWith('--'));
const FICHIER = chemin || path.join(ROOT, 'data', 'imported.json');
const ECRIRE = process.argv.includes('--ecrire');
const PHOTOS = process.argv.includes('--photos');
const UA = 'PlanRepasImport/1.0 (importateur personnel de recettes; +https://github.com/Gregory971/Repas-html)';

const sansAccent = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Assainissement des noms d'ingrédients ---------- */

/** Clauses de préparation ou d'alternative qui alourdissent la liste de courses. */
export function abrege(nom) {
    let n = String(nom || '').trim();
    n = n.replace(/\s*\(.*$/, '');                     // « (env. 250 gr) » et la suite
    n = n.replace(/\s+ou\s+.*$/i, '');                 // « cacao en poudre ou bâton râpé »
    n = n.replace(/\s*,\s*(?:[ée]minc|hach|coup|r[âa]p|pel|lav|cuit|nettoy|[ée]pluch)[^,]*$/i, '');
    n = n.replace(/\s+(?:[ée]minc[ée]s?|hach[ée]s?|coup[ée]s?|r[âa]p[ée]s?|[ée]pluch[ée]s?|nettoy[ée]s?|cuit[e]?s?)\b.*$/i, '');
    n = n.replace(/\s+d[e']\s*environ\s.*$/i, '');
    return n.replace(/[\s,;.]+$/, '').trim();
}

/**
 * « sel, poivre, thym, cives » est une énumération, pas un ingrédient.
 * On ne découpe que sans quantité et sur des morceaux courts, pour ne pas
 * casser un nom composé.
 */
export function eclateEnumeration(ing) {
    if (ing.qty != null) return [ing];
    const parts = ing.name.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2 || parts.length > 8 || parts.some((p) => p.length > 24)) return [ing];
    return parts.map((p) => ({ ...ing, name: p }));
}

export function nettoieIngredients(liste) {
    const vus = new Set();
    return liste
        .flatMap(eclateEnumeration)
        .map((i) => ({ ...i, name: abrege(i.name) }))
        .filter((i) => {
            if (!i.name || i.name.length > 70) return false;
            const k = sansAccent(i.name) + '|' + i.unit;
            if (vus.has(k)) return false;
            vus.add(k);
            return true;
        });
}

/* ---------- Photos manquantes ---------- */

/** og:image, puis twitter:image, puis la première image de contenu crédible. */
function trouveImage(html, base) {
    const doc = new JSDOM(html).window.document;
    const meta = (sel) => {
        const el = doc.querySelector(sel);
        const v = el && el.getAttribute('content');
        return v && /^https?:\/\//.test(v) ? v : '';
    };
    const parMeta = meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]')
        || meta('meta[property="og:image:secure_url"]');
    if (parMeta) return parMeta;

    const zone = doc.querySelector('article, .entry-content, main') || doc.body;
    for (const img of zone.querySelectorAll('img')) {
        const src = img.getAttribute('src') || img.getAttribute('data-src')
            || (img.getAttribute('srcset') || '').split(' ')[0];
        if (!src) continue;
        let abs;
        try { abs = new URL(src, base).href; } catch { continue; }
        if (!/^https?:/.test(abs)) continue;
        if (/logo|avatar|icon|placeholder|pixel|spacer|emoji/i.test(abs)) continue;
        const l = Number(img.getAttribute('width')) || 0;
        const h = Number(img.getAttribute('height')) || 0;
        if ((l && l < 200) || (h && h < 150)) continue;
        return abs;
    }
    return '';
}

/* ---------- Programme ---------- */

const data = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
const avant = data.recipes.length;

const estBoisson = (r) => BOISSON.test(sansAccent(r.title));
const estSauce = (r) => SAUCE.test(sansAccent(r.title));

const retirees = data.recipes.filter((r) => estBoisson(r) || estSauce(r));
let gardees = data.recipes.filter((r) => !estBoisson(r) && !estSauce(r));

let ingAvant = 0;
let ingApres = 0;
gardees = gardees.map((r) => {
    ingAvant += r.ingredients.length;
    const ingredients = nettoieIngredients(r.ingredients);
    ingApres += ingredients.length;
    return { ...r, ingredients };
});

// Une fiche vidée de ses ingrédients par le nettoyage n'a plus d'intérêt
const vides = gardees.filter((r) => r.ingredients.length < 2);
gardees = gardees.filter((r) => r.ingredients.length >= 2);

console.log(`${avant} recettes au départ`);
console.log(`  − ${retirees.filter(estBoisson).length} boissons, alcools et cocktails`);
console.log(`  − ${retirees.filter((r) => estSauce(r) && !estBoisson(r)).length} sauces et condiments`);
if (vides.length) console.log(`  − ${vides.length} devenues inexploitables : ${vides.map((r) => r.title).join(', ')}`);
console.log(`  = ${gardees.length} recettes conservées`);
console.log(`ingrédients : ${ingAvant} → ${ingApres}`);
console.log(`noms de plus de 60 caractères : ${gardees.flatMap((r) => r.ingredients).filter((i) => i.name.length > 60).length}`);

if (PHOTOS) {
    const aIllustrer = gardees.filter((r) => !r.image && r.source);
    console.log(`\nRecherche de ${aIllustrer.length} photo(s) manquante(s)`);
    for (const r of aIllustrer) {
        try {
            const res = await fetch(r.source, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const url = trouveImage(await res.text(), r.source);
            if (url) { r.image = url; console.log(`  ✓ ${r.title}`); }
            else console.log(`  · ${r.title} — aucune image utilisable`);
        } catch (e) {
            console.log(`  ! ${r.title} — ${e.message}`);
        }
        await sleep(1200);
    }
    console.log(`sans photo après recherche : ${gardees.filter((r) => !r.image).length}`);
}

if (ECRIRE) {
    fs.writeFileSync(FICHIER, JSON.stringify({ ...data, recipes: gardees }, null, 1), 'utf8');
    console.log(`\n${path.basename(FICHIER)} réécrit.`);
} else {
    console.log('\n(simulation — relancez avec --ecrire pour appliquer)');
}
