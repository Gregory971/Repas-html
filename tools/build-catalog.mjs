/*
 * Construit le catalogue public (data/seed.json) à partir des recettes
 * importées (data/imported.json).
 *
 *     node tools/build-catalog.mjs [--ecrire]
 *
 * Ce qui est publié : titre, type, durée, portions, liste d'ingrédients,
 * adresse de la photo et lien vers la page d'origine. Une liste
 * d'ingrédients relève de l'information, pas de l'œuvre.
 *
 * Ce qui n'est PAS publié : le texte rédigé des étapes. C'est de
 * l'expression originale, protégée, et ce dépôt est public. Le lecteur
 * suit le lien vers la source pour l'obtenir — ce qui renvoie aussi du
 * trafic à celui qui a écrit la recette.
 *
 * Les photos sont référencées par leur adresse d'origine, jamais recopiées.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'data', 'imported.json');
const CIBLE = path.join(ROOT, 'data', 'seed.json');
const ECRIRE = process.argv.includes('--ecrire');

const cle = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

const seed = JSON.parse(fs.readFileSync(CIBLE, 'utf8'));
const importees = JSON.parse(fs.readFileSync(SOURCE, 'utf8')).recipes || [];

// Les recettes déjà au catalogue viennent de la collection personnelle :
// elles gardent leurs étapes, elles n'ont pas été prises sur un site tiers.
const propres = new Map(seed.recipes.map((r) => [cle(r.title), r]));

let ajoutees = 0;
const photos = 0;
for (const r of importees) {
    const k = cle(r.title);
    if (propres.has(k)) {
        // On ne transfère PAS la photo à une recette du catalogue d'origine :
        // elle appartient au site tiers, et cette recette-là n'affiche aucun
        // lien de source. Une image sans crédit visible n'a rien à faire ici.
        continue;
    }
    propres.set(k, {
        id: r.id,
        title: r.title,
        type: r.type,
        time: r.time,
        servings: r.servings,
        tags: r.tags || [],
        ingredients: r.ingredients,
        steps: [],                       // volontairement vide : voir l'en-tête
        image: r.image || '',
        source: r.source
    });
    ajoutees++;
}

const recipes = [...propres.values()];
const sortie = {
    version: 21,
    _description: seed._description,
    _note: 'Les recettes reprises de sites tiers ne portent pas le texte de leurs étapes : '
        + 'le champ « source » renvoie à la page d’origine, qui en est l’auteur.',
    _recipes: recipes.length,
    _foodBank: (seed.foodBank || []).length,
    recipes,
    foodBank: seed.foodBank || []
};

console.log(`catalogue : ${seed.recipes.length} → ${recipes.length} recettes (+${ajoutees})`);
console.log(`photos ajoutées à des recettes existantes : ${photos}`);
console.log(`avec étapes : ${recipes.filter((r) => r.steps.length).length}`
    + ` | avec lien source : ${recipes.filter((r) => r.source).length}`
    + ` | avec photo : ${recipes.filter((r) => r.image).length}`);

// Garde-fou : aucune étape ne doit provenir d'une recette importée.
const fuite = recipes.filter((r) => r.source && r.steps.length);
if (fuite.length) {
    console.error(`ERREUR : ${fuite.length} recette(s) importée(s) publieraient leurs étapes`);
    process.exit(1);
}

if (ECRIRE) {
    fs.writeFileSync(CIBLE, JSON.stringify(sortie, null, 1), 'utf8');
    console.log(`\n${path.basename(CIBLE)} réécrit : ${(fs.statSync(CIBLE).size / 1024).toFixed(0)} Ko`);
} else {
    console.log('\n(simulation — relancez avec --ecrire pour appliquer)');
}
