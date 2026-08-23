/*
 * Cherche sur Wikimedia Commons une photo pour chaque recette du catalogue.
 *
 * Le script ne décide pas seul : il écrit les candidats dans
 * data/photo-candidates.json pour relecture. Une requête est associée à
 * la main à chaque plat, car une recherche sur le titre complet ramène
 * n'importe quoi (c'est ainsi que la v0.20 s'était retrouvée avec des
 * photos hors sujet).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'PlanRepas/0.24 (planificateur de repas personnel; https://github.com/Gregory971/Repas-html)';

/** Requête Commons choisie à la main, et mots devant figurer dans le nom du fichier. */
const QUERIES = {
    'Salade de tomates au basilic': ['tomato basil salad', ['tomato', 'basil']],
    'Velouté de potiron': ['pumpkin soup', ['pumpkin', 'soup']],
    "Soupe à l'oignon": ['french onion soup', ['onion', 'soup']],
    'Salade César': ['caesar salad', ['caesar', 'cesar']],
    'Accras de morue': ['accras de morue', ['accra', 'acras']],
    "Féroce d'avocat": ['féroce avocat martinique', ['feroce']],
    'Soupe de giraumon': ['soupe giraumon', ['giraumon']],
    'Accras de légumes': ['accras', ['accra', 'acras']],
    'Bœuf bourguignon': ['boeuf bourguignon', ['bourguignon']],
    'Ratatouille niçoise': ['ratatouille', ['ratatouille']],
    'Coq au vin': ['coq au vin', ['coq']],
    'Quiche lorraine': ['quiche lorraine', ['quiche']],
    'Pot-au-feu': ['pot-au-feu', ['pot']],
    'Blanquette de veau': ['blanquette de veau', ['blanquette']],
    'Risotto aux champignons': ['mushroom risotto', ['risotto']],
    'Omelette aux fines herbes': ['omelette herbs', ['omelette', 'omelet']],
    'Pâtes carbonara': ['spaghetti alla carbonara', ['carbonara']],
    'Burger maison': ['cheeseburger homemade', ['burger']],
    'Pizza margherita': ['pizza margherita', ['margherita']],
    'Fish and chips': ['fish and chips', ['fish']],
    'Cassoulet': ['cassoulet', ['cassoulet']],
    'Tarte aux légumes du soleil': ['vegetable tart', ['tart', 'tarte']],
    'Colombo de poulet': ['colombo poulet', ['colombo']],
    'Boudin créole': ['boudin créole antillais', ['boudin']],
    'Gratin de christophine': ['gratin christophine chayote', ['christophine', 'chayote']],
    'Colombo de légumes': ['colombo légumes', ['colombo']],
    'Bokit poulet': ['bokit guadeloupe', ['bokit']],
    'Rougail saucisses': ['rougail saucisse', ['rougail']],
    'Poulet boucané': ['poulet boucané', ['boucane']],
    'Tarte aux pommes': ['apple tart tarte aux pommes', ['apple', 'pomme']],
    'Mousse au chocolat': ['mousse au chocolat', ['mousse']],
    'Tiramisu': ['tiramisu', ['tiramisu']],
    'Crème brûlée': ['creme brulee', ['brulee', 'brulée']],
    'Clafoutis aux cerises': ['clafoutis cerises', ['clafoutis']],
    'Flan coco': ['flan coco antillais', ['flan']],
    'Banane flambée': ['banane flambée', ['banane', 'banana']],
    'Gâteau patate': ['gâteau patate douce antillais', ['patate', 'potato']],
    'Salade de fruits tropicaux': ['tropical fruit salad', ['fruit']],
    'Sorbet coco-papaye': ['sorbet coco', ['sorbet']],
    'Gâteau banane-coco': ['banana coconut cake', ['banana', 'banane']],
    'Dombré de morue': ['dombré antillais', ['dombre']],
    'Salade créole': ['salade créole antillaise', ['creole', 'créole']],
    'Colombo de porc': ['colombo porc', ['colombo']],
    'Colombo de poisson': ['colombo poisson', ['colombo']],
    "Poulet à l'ananas rapide": ['chicken pineapple', ['pineapple', 'ananas']],
    'Poulet au lait de coco, tomates et safran': ['chicken coconut milk curry', ['coconut', 'coco']],
    'Cari de sauté de porc': ['cari porc réunion', ['cari', 'carry']],
    'Curry de poulet au lait de coco': ['chicken curry coconut', ['curry']],
    'Riz créole aux épices': ['riz créole', ['rice', 'riz']],
    'Purée de fruit à pain': ['fruit à pain breadfruit', ['breadfruit', 'fruit_a_pain']],
    'Gratin de christophine au fromage express': ['gratin christophine chayote', ['christophine', 'chayote']],
    'Gratin de christophine à la martiniquaise': ['gratin christophine chayote', ['christophine', 'chayote']]
};

const strip = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(query) {
    const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json'
        + '&generator=search&gsrnamespace=6&gsrlimit=8'
        + `&gsrsearch=${encodeURIComponent('filetype:bitmap ' + query)}`
        + '&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=800';
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const pages = (await res.json())?.query?.pages;
    return pages ? Object.values(pages) : [];
}

const out = [];
const titles = Object.keys(QUERIES);

for (const [i, title] of titles.entries()) {
    const [query, needles] = QUERIES[title];
    let candidates = [];
    try {
        const pages = await search(query);
        candidates = pages
            .filter((p) => /^image\/(jpeg|png)$/.test(p.imageinfo?.[0]?.mime || ''))
            // Le nom du fichier doit contenir un mot du plat : c'est le garde-fou
            // contre les photos hors sujet.
            .filter((p) => needles.some((n) => strip(p.title).includes(strip(n))))
            .map((p) => {
                const ii = p.imageinfo[0];
                const meta = ii.extmetadata || {};
                const clean = (v) => String(v?.value || '').replace(/<[^>]*>/g, '').trim();
                return {
                    file: p.title.replace(/^File:/, ''),
                    thumb: ii.thumburl,
                    page: ii.descriptionurl,
                    licence: clean(meta.LicenseShortName),
                    auteur: clean(meta.Artist).slice(0, 80)
                };
            })
            // Les licences non libres ou non identifiées sont écartées.
            .filter((c) => /^(CC|Public domain|CC0)/i.test(c.licence));
    } catch (e) {
        console.error(`! ${title} : ${e.message}`);
    }

    out.push({ title, query, candidates });
    console.log(`${String(i + 1).padStart(2)}/${titles.length}  ${title} -> ${candidates.length} candidat(s)`
        + (candidates[0] ? `  [${candidates[0].file}]` : ''));
    await sleep(350);
}

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'photo-candidates.json'), JSON.stringify(out, null, 1), 'utf8');
console.log(`\nSans candidat : ${out.filter((o) => !o.candidates.length).map((o) => o.title).join(', ') || 'aucun'}`);
