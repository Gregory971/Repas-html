/*
 * Audit d'un fichier de recettes importées : photos manquantes, fiches
 * incomplètes, doublons, et repérage des boissons, sauces et condiments.
 *
 *     node tools/audit-recipes.mjs [chemin]
 *
 * Ne modifie rien : il rend compte. Le tri est fait par clean-recipes.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chemin = process.argv.slice(2).find((a) => !a.startsWith('--'));
const FICHIER = chemin || path.join(ROOT, 'data', 'imported.json');

const sansAccent = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* ---------- Catégories à écarter ---------- */

/**
 * Boissons, alcools et cocktails. « punch » attrape le punch planteur comme
 * le ti-punch ; « chaud » est nécessaire pour le chocolat chaud, qui est une
 * boisson, alors que le chocolat tout court peut être un dessert.
 */
export const BOISSON = new RegExp([
    '\\bti[- ]?punch\\b', '\\bpunch\\b', '\\bshrubb?\\b', '\\bliqueur',
    '\\bcocktail', '\\brhum arrang', '\\bpina colada',
    '\\bmojito', '\\bdaiquiri', '\\bsangria', '\\bcaipirinha',
    '\\bboisson', '\\bjus de\\b', '\\bjus d[\'e]', '\\bnectar\\b',
    '\\bsmoothie', '\\bmilk[- ]?shake', '\\bfrappuccino', '\\blimonade',
    // « sirop » seulement en tête : « verrine au sirop de curcuma » est un dessert.
    '^(?:le |la |les )?sirops? d', '\\bthe glace', '\\btisane', '\\binfusion',
    '\\bchocolat chaud', '\\bcafe glace', '\\bmauby', '\\bbissap', '\\bginger beer',
    '\\bmabi\\b'
].join('|'), 'i');

/**
 * Sauces et condiments : ce qui accompagne un plat sans en être un.
 * Le motif exige que la sauce soit le sujet du titre — « Colombo sauce coco »
 * reste un plat, « Sauce chien » n'en est pas un.
 */
export const SAUCE = new RegExp([
    // La sauce doit être le sujet du titre : « Poulet boucané avec sa sauce
    // chien » et « Poisson grillé et sa sauce chien » restent des plats.
    '^(?:la |le |les )?sauces?\\b',
    // « Marinade » au singulier désigne le condiment ; au pluriel, aux Antilles,
    // ce sont des beignets — « Marinades de giraumon » est un plat.
    '^(?:la |le )?marinade\\b(?!s)',
    '^vinaigrette', '^mayonnaise', '^ketchup', '^moutarde',
    '^coulis\\b', '^pesto\\b', '^chimichurri', '^aioli', '^rouille\\b',
    '^beurre (?:blanc|maitre)', '^huile (?:pimentee|aromatisee)',
    '^pate de piment', '^condiment', '^assaisonnement', '^sel (?:aromatise|epice)'
].join('|'), 'i');

/* ---------- Audit ---------- */

const lanceDirectement = process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (lanceDirectement) {
    const data = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
    const recettes = data.recipes || [];

    const cle = (t) => sansAccent(t).replace(/[^a-z0-9]/g, '');
    const vus = new Map();
    const doublons = [];
    recettes.forEach((r) => {
        const k = cle(r.title);
        if (vus.has(k)) doublons.push(r.title); else vus.set(k, r);
    });

    const sansPhoto = recettes.filter((r) => !r.image);
    const sansEtape = recettes.filter((r) => !r.steps || r.steps.length === 0);
    const peuIngredients = recettes.filter((r) => r.ingredients.length < 2);
    const titreDouteux = recettes.filter((r) => r.title.length < 4 || r.title.length > 80);
    const etapesLongues = recettes.filter((r) => (r.steps || []).some((s) => s.length > 600));
    const ingredientsDouteux = recettes.filter((r) => r.ingredients.some((i) => i.name.length > 60));

    const boissons = recettes.filter((r) => BOISSON.test(sansAccent(r.title)));
    const sauces = recettes.filter((r) => SAUCE.test(sansAccent(r.title)));

    const ligne = (titre, liste, montrer = 0) => {
        console.log(`${titre.padEnd(40)} ${String(liste.length).padStart(4)}`);
        liste.slice(0, montrer).forEach((r) => console.log(`     · ${typeof r === 'string' ? r : r.title}`));
    };

    console.log(`Fichier : ${path.basename(FICHIER)} — ${recettes.length} recettes\n`);
    console.log('CONTRÔLE                                  NB');
    console.log('─'.repeat(46));
    ligne('sans photo', sansPhoto);
    ligne('sans aucune étape', sansEtape);
    ligne('moins de 2 ingrédients', peuIngredients);
    ligne('titre suspect (trop court ou long)', titreDouteux);
    ligne('étape de plus de 600 caractères', etapesLongues);
    ligne('nom d’ingrédient de plus de 60 caractères', ingredientsDouteux);
    ligne('doublons de titre', doublons);
    console.log('─'.repeat(46));
    ligne('BOISSONS repérées', boissons);
    ligne('SAUCES et condiments repérés', sauces);

    if (process.argv.includes('--detail')) {
        console.log('\n--- boissons ---');
        boissons.forEach((r) => console.log(`  ${r.title}`));
        console.log('\n--- sauces et condiments ---');
        sauces.forEach((r) => console.log(`  ${r.title}`));
        console.log('\n--- sans photo ---');
        sansPhoto.forEach((r) => console.log(`  ${r.title}  <- ${r.source}`));
    }
}
