/*
 * Importation de recettes depuis des pages schema.org/Recipe.
 *
 * Les fixtures sont synthétiques : reproduire le contenu des sites d'origine
 * dans le dépôt serait à la fois inutile et discutable. Ce qui est testé, ce
 * sont les formes de données que ces sites emploient réellement.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import {
    dureeEnMinutes, nombreDeParts, devineType, extraitEtapes, extraitImage,
    extraitRecipes, nettoieTitre, nettoieNomIngredient, eclateIngredient, versRecette
} from '../tools/import-recipes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* ==========================================================
   Lecture des durées, parts et types
   ========================================================== */

test('les durées ISO 8601 et les durées écrites deviennent des minutes', () => {
    assert.equal(dureeEnMinutes('PT1H'), 60);
    assert.equal(dureeEnMinutes('PT1H30M'), 90);
    assert.equal(dureeEnMinutes('PT45M'), 45);
    assert.equal(dureeEnMinutes('1 h 20'), 80);
    assert.equal(dureeEnMinutes('25 min'), 25);
    assert.equal(dureeEnMinutes(null), null);
    assert.equal(dureeEnMinutes('bientôt'), null);
});

test('le nombre de parts tolère les formulations libres', () => {
    assert.equal(nombreDeParts('4 personnes'), 4);
    assert.equal(nombreDeParts('pour 6'), 6);
    assert.equal(nombreDeParts(['8 parts']), 8);
    assert.equal(nombreDeParts(null), 4, 'valeur par défaut');
    // Cookpad annonce parfois une production, pas des convives.
    assert.equal(nombreDeParts('200 pièces'), 4, 'une valeur absurde ne doit pas passer');
});

test('le type de plat suit la catégorie annoncée', () => {
    assert.equal(devineType({ recipeCategory: 'Dessert' }), 'dessert');
    assert.equal(devineType({ recipeCategory: 'Entrée' }), 'entrée');
    assert.equal(devineType({ recipeCategory: 'Plat principal' }), 'plat');
    assert.equal(devineType({ name: 'Velouté de giraumon' }), 'entrée');
    // Spécialités antillaises que la seule catégorie ne classe pas
    assert.equal(devineType({ name: 'Accras de morue' }), 'entrée');
    assert.equal(devineType({ name: 'Blanc-manger coco' }), 'dessert');
    assert.equal(devineType({ name: 'Colombo de porc' }), 'plat');
});

/* ==========================================================
   Nettoyage des libellés
   ========================================================== */

test('les appendices de référencement disparaissent du titre', () => {
    assert.equal(nettoieTitre('Crevettes au lait de coco : saveurs des îles'), 'Crevettes au lait de coco');
    assert.equal(nettoieTitre('Colombo de porc : la recette antillaise facile'), 'Colombo de porc');
    // Un titre court et sans queue reste intact
    assert.equal(nettoieTitre('Matete de crabe'), 'Matete de crabe');
    assert.equal(nettoieTitre('Poulet : coco'), 'Poulet : coco', 'une queue courte n est pas un appendice');
});

test('les mentions de préparation sont retirées du nom d ingrédient', () => {
    assert.equal(nettoieNomIngredient('oignon, émincé'), 'oignon');
    assert.equal(nettoieNomIngredient('poivron, coupé en dés'), 'poivron');
    assert.equal(nettoieNomIngredient('citron vert en fin de cuisson'), 'citron vert');
    assert.equal(nettoieNomIngredient('persil (facultatif)'), 'persil');
    assert.equal(nettoieNomIngredient('de la farine'), 'farine');
    assert.equal(nettoieNomIngredient('lait de coco'), 'lait de coco', 'un nom composé reste entier');
});

test('« sel et poivre » devient deux articles de courses', () => {
    const deux = eclateIngredient('sel et poivre');
    assert.deepEqual(deux.map((i) => i.name), ['sel', 'poivre']);

    // Une quantité chiffrée interdit la coupure : c'est un seul produit pesé.
    const un = eclateIngredient('200 g de riz et haricots rouges');
    assert.equal(un.length, 1);
    assert.equal(un[0].qty, 200);
});

/* ==========================================================
   Extraction depuis une page
   ========================================================== */

const PAGE = `<!doctype html><html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
 {"@type":"WebPage","name":"Page"},
 {"@type":"Recipe","name":"Colombo de poulet : la recette antillaise",
  "recipeCategory":"Plat principal","recipeYield":"6 personnes",
  "prepTime":"PT20M","cookTime":"PT40M","totalTime":"PT1H",
  "keywords":"antillais, colombo, épicé",
  "image":{"@type":"ImageObject","url":"https://exemple.org/photo.jpg"},
  "recipeIngredient":["800 g de poulet","2 oignons, émincés","sel et poivre","1 piment"],
  "recipeInstructions":[{"@type":"HowToStep","text":"Mariner le poulet."},
                        {"@type":"HowToStep","text":"Faire mijoter."}]}
]}
<\/script></head><body></body></html>`;

test('un nœud Recipe est trouvé même imbriqué dans un @graph', () => {
    const noeuds = extraitRecipes(PAGE);
    assert.equal(noeuds.length, 1);
    assert.equal(noeuds[0].recipeIngredient.length, 4);
});

test('une page complète devient une recette exploitable', () => {
    const r = versRecette(extraitRecipes(PAGE)[0], 'https://exemple.org/colombo/');

    assert.equal(r.title, 'Colombo de poulet');
    assert.equal(r.type, 'plat');
    assert.equal(r.time, 60);
    assert.equal(r.servings, 6);
    assert.equal(r.image, 'https://exemple.org/photo.jpg');
    assert.equal(r.source, 'https://exemple.org/colombo/');
    assert.deepEqual(r.steps, ['Mariner le poulet.', 'Faire mijoter.']);

    // « sel et poivre » a été séparé, « émincés » retiré
    assert.deepEqual(r.ingredients.map((i) => i.name), ['poulet', 'oignons', 'sel', 'poivre', 'piment']);
    const poulet = r.ingredients[0];
    assert.equal(poulet.qty, 800);
    assert.equal(poulet.unit, 'g');
    assert.equal(poulet.section, 'boucherie');
});

test('une recette sans ingrédient ou sans titre est refusée', () => {
    assert.equal(versRecette({ name: 'Sans rien' }, 'https://exemple.org/'), null);
    assert.equal(versRecette({ recipeIngredient: ['1 oignon'] }, 'https://exemple.org/'), null);
});

test('les étapes sont récupérées quel que soit leur emballage', () => {
    assert.deepEqual(extraitEtapes('Une seule étape.'), ['Une seule étape.']);
    assert.deepEqual(extraitEtapes(['A.', 'B.']), ['A.', 'B.']);
    assert.deepEqual(
        extraitEtapes({ '@type': 'HowToSection', itemListElement: [{ '@type': 'HowToStep', text: 'X.' }] }),
        ['X.']);
    assert.deepEqual(extraitEtapes([{ text: '<p>Avec des <b>balises</b>.</p>' }]), ['Avec des balises.']);
});

test('l image est trouvée quelle que soit sa forme', () => {
    assert.equal(extraitImage('https://exemple.org/a.jpg'), 'https://exemple.org/a.jpg');
    assert.equal(extraitImage(['https://exemple.org/b.jpg']), 'https://exemple.org/b.jpg');
    assert.equal(extraitImage({ url: 'https://exemple.org/c.jpg' }), 'https://exemple.org/c.jpg');
    assert.equal(extraitImage({ contentUrl: 'https://exemple.org/d.jpg' }), 'https://exemple.org/d.jpg');
    assert.equal(extraitImage('/relatif.jpg'), '', 'une URL relative est inutilisable hors du site');
    assert.equal(extraitImage(null), '');
});

/* ==========================================================
   Chargement dans l'application
   ========================================================== */

async function boot(storage) {
    const errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (e) => errors.push(e));
    const dom = new JSDOM(HTML, {
        runScripts: 'dangerously', url: 'https://exemple.org/', pretendToBeVisual: true, virtualConsole,
        beforeParse(w) {
            if (storage) w.localStorage.setItem('planrepas_v21', JSON.stringify(storage));
            w.confirm = () => true;
        }
    });
    await new Promise((r) => setTimeout(r, 200));
    const { window } = dom;
    return {
        window, document: window.document, errors,
        click: (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })),
        stored: () => JSON.parse(window.localStorage.getItem('planrepas_v21') || 'null')
    };
}

const ETAT = {
    version: 21, weeks: {}, shoppingList: [], fridge: [], foodBank: [],
    settings: { household: 4, banned: [], theme: 'dark' },
    recipes: [{
        id: 555, title: 'Ma recette perso', type: 'plat', time: 10, servings: 4,
        tags: [], steps: [], image: '',
        ingredients: [{ name: 'riz', qty: 100, unit: 'g', section: 'epicerie-salee' }]
    }]
};

const IMPORT = {
    planrepasImport: 'recipes',
    recipes: [{
        title: 'Colombo de poulet', type: 'plat', time: 60, servings: 6,
        tags: ['antillais'], steps: ['Mariner.'],
        image: 'https://exemple.org/photo.jpg',
        source: 'https://exemple.org/colombo/',
        ingredients: [{ name: 'poulet', qty: 800, unit: 'g', section: 'boucherie' }]
    }]
};

test('la source d une recette importée est conservée à l enregistrement', async () => {
    const { stored, document, click } = await boot({ ...ETAT, recipes: [...ETAT.recipes, IMPORT.recipes[0]] });
    click(document.querySelector('[data-act="save"]'));
    const importee = stored().recipes.find((r) => r.title === 'Colombo de poulet');
    assert.equal(importee.source, 'https://exemple.org/colombo/');
});

test('la fiche affiche un lien vers la source', async () => {
    const { document, click } = await boot({ ...ETAT, recipes: [IMPORT.recipes[0]] });
    click(document.querySelector('#recipe-list article'));
    const lien = document.querySelector('#recipe-detail-content a[href="https://exemple.org/colombo/"]');
    assert.ok(lien, 'le lien de source doit être présent');
    assert.equal(lien.textContent.trim(), 'exemple.org');
    assert.match(lien.getAttribute('rel'), /noopener/);
});

test('une source non http est ignorée', async () => {
    const piege = { ...IMPORT.recipes[0], source: 'javascript:alert(1)' };
    const { stored, document, click } = await boot({ ...ETAT, recipes: [piege] });
    click(document.querySelector('[data-act="save"]'));
    assert.equal(stored().recipes[0].source, undefined);
    assert.equal(document.querySelector('#recipe-detail-content a'), null);
});
