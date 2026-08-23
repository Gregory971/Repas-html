/*
 * Tests des fonctions pures.
 *
 * Ce sont celles dont une régression est silencieuse : une migration v0.15
 * qui casse, une unité mal convertie ou un rapprochement de noms trop laxiste
 * ne se voient pas à l'écran, seulement dans des données devenues fausses.
 *
 *     npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    parseIngLine, parseNumber, parseQty, formatQty, toBase,
    prepDe, pluralUnit, normalizeUnit, guessSection, ingLabel, qtyLabel,
    formatNumber, formatCount, roundForShopping
} from '../src/js/03-ingredients.js';
import { nameKey, namesMatch, generateId, daysUntil, esc, safeImg, clampInt } from '../src/js/02-utils.js';
import {
    normalize, normalizeFridgeItem, normalizeShoppingItem,
    pruneEmptyWeeks, isEmptyWeek, defaultState, emptyWeek
} from '../src/js/05-state.js';
import { convertV15 } from '../src/js/06-legacy.js';
import { aggregatePlanning, deductFridge, buildShoppingList, sectionRank } from '../src/js/07-shopping-core.js';
import { urgentFridgeNames, urgencyScore, createPicker, pickMenu } from '../src/js/08-generator-core.js';
import { nutritionScore, nutritionSummary } from '../src/js/04-nutrition.js';
import { DAYS, SLOT_KEYS } from '../src/js/01-constants.js';

/* ---------- Aides ---------- */

const weekWith = (assignments) => {
    const w = emptyWeek();
    Object.entries(assignments).forEach(([day, slots]) => {
        Object.entries(slots).forEach(([k, id]) => { w[day][k] = id; });
    });
    return w;
};

const recipeIndex = (list) => {
    const map = new Map(list.map((r) => [r.id, r]));
    return (id) => map.get(Number(id));
};

/* ==========================================================
   Échappement et URL
   ========================================================== */

test('esc neutralise les caractères actifs du HTML', () => {
    assert.equal(esc('<img src=x onerror="alert(1)">'),
        '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    assert.equal(esc(null), '');
});

test('safeImg rejette les schémas dangereux', () => {
    assert.equal(safeImg('javascript:alert(1)'), '');
    assert.equal(safeImg('data:text/html,<script>'), '');
    assert.match(safeImg('https://exemple.fr/a.png'), /^https:\/\/exemple\.fr\/a\.png$/);
    assert.match(safeImg('data:image/png;base64,AAAA'), /^data:image\/png/);
});

test('clampInt borne et retombe sur la valeur par défaut', () => {
    assert.equal(clampInt('999', 1, 50, 4), 50);
    assert.equal(clampInt('abc', 1, 50, 4), 4);
    assert.equal(clampInt('12', 1, 50, 4), 12);
});

/* ==========================================================
   Analyse des ingrédients
   ========================================================== */

test('parseNumber comprend les fractions', () => {
    assert.equal(parseNumber('1/2'), 0.5);
    assert.equal(parseNumber('3/4'), 0.75);
    assert.equal(parseNumber('1 1/2'), 1.5);
    assert.equal(parseNumber('½'), 0.5);
    assert.equal(parseNumber('1½'), 1.5);
    assert.equal(parseNumber('0,5'), 0.5);
    assert.equal(parseNumber('2'), 2);
    assert.equal(parseNumber('abc'), null);
});

test('parseIngLine structure quantité, unité et nom', () => {
    assert.deepEqual(parseIngLine('200 g de tomates'),
        { name: 'tomates', qty: 200, unit: 'g', section: 'fruits-legumes' });
    assert.deepEqual(parseIngLine('3 oignons'),
        { name: 'oignons', qty: 3, unit: 'pièce', section: 'fruits-legumes' });
    assert.deepEqual(parseIngLine('sel'),
        { name: 'sel', qty: null, unit: '', section: 'epicerie-salee' });
});

test('parseIngLine accepte les fractions, que la v0.22 laissait dans le nom', () => {
    // « ½ citron » devenait un ingrédient nommé « ½ citron », non agrégeable.
    assert.deepEqual(parseIngLine('½ citron'),
        { name: 'citron', qty: 0.5, unit: 'pièce', section: 'fruits-legumes' });
    assert.deepEqual(parseIngLine('1/2 citron'),
        { name: 'citron', qty: 0.5, unit: 'pièce', section: 'fruits-legumes' });
    assert.equal(parseIngLine('1 1/2 cuillère à soupe de colombo').qty, 1.5);
});

test('parseIngLine préserve un nom composé avec apostrophe', () => {
    const r = parseIngLine("3 cuillères à soupe d'huile d'olive");
    assert.equal(r.name, "huile d'olive");
    assert.equal(r.qty, 3);
    assert.equal(r.unit, 'cuillère à soupe');
});

test('parseQty analyse une quantité seule (ancien format des courses)', () => {
    assert.deepEqual(parseQty('3 pces'), { qty: 3, unit: 'pièce' });
    assert.deepEqual(parseQty('1 botte'), { qty: 1, unit: 'botte' });
    assert.deepEqual(parseQty(''), { qty: null, unit: '' });
});

test('formatQty remonte les unités', () => {
    assert.equal(formatQty(1500, 'g'), '1,5 kg');
    assert.equal(formatQty(250, 'g'), '250 g');
    assert.equal(formatQty(2000, 'ml'), '2 l');
    assert.equal(formatQty(2, 'pièce'), '2 pièces');
    assert.equal(formatQty(1, 'pièce'), '1 pièce');
});

test('les poids s écrivent en décimal, les dénombrements en fraction', () => {
    assert.equal(formatQty(1.5, 'kg'), '1,5 kg');       // pas « 1½ kg »
    assert.equal(formatQty(0.5, 'l'), '0,5 l');
    assert.equal(formatQty(0.5, 'pièce'), '½ pièce');
    assert.equal(formatQty(0.25, 'gousse'), '¼ gousse');
    assert.equal(formatNumber(1.5), '1,5');             // jamais le point anglais
    assert.equal(formatCount(0.75), '¾');
});

test('un ingrédient survit à l aller-retour saisie / libellé / saisie', () => {
    // Le formulaire d'édition réaffiche les ingrédients via ingLabel ; si
    // parseIngLine ne relit pas sa propre sortie, éditer une recette dégrade
    // silencieusement ses quantités.
    for (const line of ['½ citron', '1 1/2 cuillère à soupe de colombo',
        '1,5 kg de potimarron', '200 g de tomates', '3 oignons', '20 cl de crème']) {
        const first = parseIngLine(line);
        const again = parseIngLine(ingLabel(first, 1));
        assert.equal(again.qty, first.qty, `quantité perdue sur « ${line} »`);
        assert.equal(again.unit, first.unit, `unité perdue sur « ${line} »`);
        assert.equal(again.name, first.name, `nom perdu sur « ${line} »`);
    }
});

test('toBase ramène à une unité commune', () => {
    assert.deepEqual(toBase(1, 'kg'), { qty: 1000, unit: 'g' });
    assert.deepEqual(toBase(20, 'cl'), { qty: 200, unit: 'ml' });
    assert.deepEqual(toBase(3, 'pièce'), { qty: 3, unit: 'pièce' });
});

test('prepDe respecte le h aspiré', () => {
    assert.equal(prepDe('haricot vert'), 'de ');   // « de haricots », pas « d'haricots »
    assert.equal(prepDe('asperges'), "d'");
    assert.equal(prepDe('pomme'), 'de ');
});

test('pluralUnit laisse les symboles invariables', () => {
    assert.equal(pluralUnit(3, 'g'), 'g');
    assert.equal(pluralUnit(3, 'kg'), 'kg');
    assert.equal(pluralUnit(3, 'tranche'), 'tranches');
    assert.equal(pluralUnit(3, 'cuillère à soupe'), 'cuillères à soupe');
});

test('ingLabel met les quantités à l échelle', () => {
    const ing = { name: 'poulet', qty: 400, unit: 'g', section: 'boucherie' };
    assert.equal(ingLabel(ing, 1), '400 g de poulet');
    assert.equal(ingLabel(ing, 2), '800 g de poulet');
    assert.equal(qtyLabel(null, 'g'), '');
});

test('guessSection range dans le bon rayon', () => {
    assert.equal(guessSection('tomates cerises'), 'fruits-legumes');
    assert.equal(guessSection('blanc de poulet'), 'boucherie');
    assert.equal(guessSection('quelque chose'), 'epicerie-salee');
});

/* ==========================================================
   Rapprochement des noms
   ========================================================== */

test('nameKey ignore accents, casse et pluriels', () => {
    assert.equal(nameKey('Tomates fraîches'), nameKey('tomate fraiche'));
    assert.equal(nameKey('Pommes de terre'), 'pomme de terre');
    assert.equal(nameKey('riz'), 'riz');            // mots courts protégés
});

test('namesMatch rapproche un produit et sa qualification', () => {
    assert.ok(namesMatch('poulet', 'Poulet fermier'));
    assert.ok(namesMatch('lait', 'Lait demi-écrémé'));
    assert.ok(namesMatch('creme', 'Crème fraîche'));
});

test('namesMatch distingue un nom composé', () => {
    // Sans cette règle, il resterait des pommes de terre au frigo et les
    // pommes disparaîtraient de la liste de courses.
    assert.equal(namesMatch('pomme', 'pommes de terre'), false);
    assert.equal(namesMatch('huile', "huile d olive"), false);
});

test('generateId ne collisionne pas dans une même milliseconde', () => {
    const ids = new Set();
    for (let i = 0; i < 500; i++) ids.add(generateId());
    assert.equal(ids.size, 500);
});

test('daysUntil compte les jours entiers', () => {
    assert.equal(daysUntil('2026-08-20', '2026-08-18T13:00:00'), 2);
    assert.equal(daysUntil('2026-08-17', '2026-08-18T13:00:00'), -1);
    assert.equal(daysUntil('pas-une-date'), null);
});

/* ==========================================================
   Normalisation et migrations
   ========================================================== */

test('normalize accepte une entrée absurde sans lever', () => {
    for (const bad of [null, 42, 'texte', [], { recipes: 'non' }]) {
        const s = normalize(bad);
        assert.ok(Array.isArray(s.recipes) && s.recipes.length > 0);
        assert.equal(typeof s.settings.household, 'number');
    }
});

test('normalizeFridgeItem récupère la quantité noyée dans le nom (v0.21)', () => {
    const item = normalizeFridgeItem({ name: '200 g de tomate', expiry: '2026-09-01' });
    assert.equal(item.name, 'tomate');
    assert.equal(item.qty, 200);
    assert.equal(item.unit, 'g');
});

test('normalizeFridgeItem garde un nom sans quantité', () => {
    const item = normalizeFridgeItem({ name: 'Crème fraîche 30%', expiry: '2026-09-01' });
    assert.equal(item.qty, null);
    assert.match(item.name, /Crème fraîche/);
});

test('normalizeShoppingItem convertit une quantité texte (v0.21)', () => {
    const item = normalizeShoppingItem({ name: 'Patates douces', qty: '3 pces', category: 'Primeur' });
    assert.equal(item.qty, 3);
    assert.equal(item.unit, 'pièce');
    assert.equal(item.category, 'Primeur');
});

test('normalizeShoppingItem comprend la notation ×N', () => {
    const item = normalizeShoppingItem({ name: 'Riz blanc', qty: '×3' });
    assert.equal(item.qty, null);
    assert.equal(item.count, 3);
});

test('pruneEmptyWeeks retire les semaines sans repas', () => {
    const weeks = {
        '2026-08-17': emptyWeek(),
        '2026-08-24': weekWith({ Lundi: { midi_plat: 3 } })
    };
    assert.ok(isEmptyWeek(weeks['2026-08-17']));
    const kept = pruneEmptyWeeks(weeks);
    assert.deepEqual(Object.keys(kept), ['2026-08-24']);
});

test('normalize purge les semaines vides à l import', () => {
    const s = normalize({ recipes: defaultState().recipes, weeks: { '2026-08-17': emptyWeek() } });
    assert.deepEqual(Object.keys(s.weeks), []);
});

test('convertV15 traduit les créneaux sans accent et les quantités', () => {
    const converted = convertV15({
        recipes: [{ id: 1, title: 'Test', type: 'plat' }],
        weeks: [{ days: [{ meals: { midi_plat: [1] }, people: { midi_plat: 6 } }] }],
        currentWeekIndex: 0,
        inventory: [{ id: 9, name: 'tomate', qty: 200, unit: 'g', expDate: '2026-09-01' }],
        shoppingList: [{ id: 8, name: 'riz', qty: 500, unit: 'g', section: 'epicerie-salee' }]
    });
    const week = Object.values(converted.weeks)[0];
    assert.equal(week.Lundi['midi_plat'], 1);          // midi_plat, avec l'accent du modèle courant
    assert.equal(week.Lundi.portions['midi_plat'], 6);
    assert.deepEqual(
        { qty: converted.fridge[0].qty, unit: converted.fridge[0].unit },
        { qty: 200, unit: 'g' });
    assert.equal(converted.shoppingList[0].qty, 500);
});

/* ==========================================================
   Liste de courses
   ========================================================== */

const RECIPES = [
    {
        id: 10, title: 'Colombo', type: 'plat', servings: 4, calories: 540, time: 35, tags: ['Antillaise'],
        ingredients: [
            { name: 'poulet', qty: 800, unit: 'g', section: 'boucherie' },
            { name: 'pommes de terre', qty: 600, unit: 'g', section: 'fruits-legumes' }
        ]
    },
    {
        id: 11, title: 'Bowl', type: 'plat', servings: 4, calories: 450, time: 25, tags: ['Végé'],
        ingredients: [{ name: 'quinoa', qty: 320, unit: 'g', section: 'epicerie-salee' }]
    },
    {
        id: 12, title: 'Velouté', type: 'entrée', servings: 4, calories: 190, time: 15, tags: ['Healthy'],
        ingredients: [{ name: 'potimarron', qty: 1, unit: 'kg', section: 'fruits-legumes' }]
    },
    { id: 13, title: 'Mousse', type: 'dessert', servings: 4, calories: 310, time: 15, tags: [], ingredients: [] }
];
const byId = recipeIndex(RECIPES);

test('aggregatePlanning cumule en unités de base et met à l échelle', () => {
    const week = weekWith({ Lundi: { midi_plat: 10 }, Mardi: { midi_plat: 10 } });
    const needed = aggregatePlanning(week, byId, 4);
    assert.equal(needed.get('poulet|g').qty, 1600);
    assert.equal(needed.get('pomme de terre|g').qty, 1200);
});

test('aggregatePlanning applique les portions du créneau', () => {
    const week = weekWith({ Lundi: { midi_plat: 11 } });
    week.Lundi.portions['midi_plat'] = 8;                 // le double des 4 portions de la recette
    assert.equal(aggregatePlanning(week, byId, 4).get('quinoa|g').qty, 640);
});

test('deductFridge retranche le stock disponible', () => {
    const week = weekWith({ Lundi: { midi_plat: 10 }, Mardi: { midi_plat: 10 } });
    const out = deductFridge(aggregatePlanning(week, byId, 4),
        [{ name: 'Poulet fermier', qty: 500, unit: 'g', expiry: '2026-12-31' }], '2026-08-18');
    const poulet = out.find((i) => i.name === 'poulet');
    assert.equal(poulet.qty, 1100);
    assert.equal(poulet.inFridge, true);
});

test('deductFridge fait disparaître un besoin entièrement couvert', () => {
    const week = weekWith({ Lundi: { midi_plat: 10 } });
    const out = deductFridge(aggregatePlanning(week, byId, 4),
        [{ name: 'poulet', qty: 2, unit: 'kg', expiry: '2026-12-31' }], '2026-08-18');
    assert.equal(out.find((i) => i.name === 'poulet'), undefined);
    assert.ok(out.find((i) => i.name === 'pommes de terre'));
});

test('deductFridge ignore les produits périmés', () => {
    const week = weekWith({ Lundi: { midi_plat: 10 } });
    const out = deductFridge(aggregatePlanning(week, byId, 4),
        [{ name: 'poulet', qty: 5, unit: 'kg', expiry: '2026-08-01' }], '2026-08-18');
    assert.equal(out.find((i) => i.name === 'poulet').qty, 800);
});

test('buildShoppingList conserve les lignes saisies à la main et les cases cochées', () => {
    const week = weekWith({ Lundi: { midi_plat: 10 } });
    const existing = [
        { id: 1, name: 'Éponges', qty: 1, unit: '', section: 'epicerie-salee', category: 'Divers', checked: false, auto: false },
        { id: 2, name: 'poulet', qty: 800, unit: 'g', section: 'boucherie', category: 'Boucherie', checked: true, auto: true }
    ];
    const { list } = buildShoppingList(week, byId, {
        household: 4, existing, fridge: [], deduct: false, today: '2026-08-18'
    });
    assert.ok(list.find((i) => i.name === 'Éponges' && !i.auto), 'la ligne manuelle survit');
    assert.equal(list.find((i) => i.name === 'poulet').checked, true, 'la case cochée est reprise');
});

test('buildShoppingList ne double pas un produit déjà saisi à la main', () => {
    const week = weekWith({ Lundi: { midi_plat: 10 } });
    const existing = [{ id: 1, name: 'Poulet', qty: 1, unit: 'kg', section: 'boucherie', category: 'Boucherie', checked: false, auto: false }];
    const { list } = buildShoppingList(week, byId, {
        household: 4, existing, fridge: [], deduct: false, today: '2026-08-18'
    });
    assert.equal(list.filter((i) => nameKey(i.name) === 'poulet').length, 1);
});

test('sectionRank suit le parcours du magasin', () => {
    assert.ok(sectionRank('fruits-legumes') < sectionRank('epicerie-salee'));
    assert.ok(sectionRank('inconnu') >= sectionRank('boissons'));
});

/* ==========================================================
   Générateur
   ========================================================== */

test('urgentFridgeNames ne retient que les produits proches de la péremption', () => {
    const names = urgentFridgeNames([
        { name: 'Poulet fermier', expiry: '2026-08-19' },   // demain
        { name: 'Riz', expiry: '2027-01-01' },              // lointain
        { name: 'Lait', expiry: '2026-08-01' }              // périmé
    ], '2026-08-18');
    assert.deepEqual([...names], ['poulet fermier']);
});

test('urgencyScore compte les ingrédients à consommer', () => {
    const urgent = urgentFridgeNames([{ name: 'Poulet fermier', expiry: '2026-08-19' }], '2026-08-18');
    assert.equal(urgencyScore(RECIPES[0], urgent), 1);   // Colombo utilise du poulet
    assert.equal(urgencyScore(RECIPES[1], urgent), 0);   // Bowl non
});

test('le générateur sert d abord les recettes anti-gaspi', () => {
    const urgent = urgentFridgeNames([{ name: 'poulet', expiry: '2026-08-19' }], '2026-08-18');
    const next = createPicker([RECIPES[1], RECIPES[0]], urgent, () => 0.5);
    assert.equal(next(), 10, 'le Colombo passe devant, il consomme le poulet');
});

test('le générateur ne ressert pas le même plat deux fois de suite', () => {
    const next = createPicker([RECIPES[0], RECIPES[1]], new Set(), () => 0.5);
    const picks = Array.from({ length: 8 }, next);
    for (let i = 1; i < picks.length; i++) {
        assert.notEqual(picks[i], picks[i - 1], `répétition en position ${i}`);
    }
});

test('un réservoir d une seule recette reste utilisable', () => {
    const next = createPicker([RECIPES[0]], new Set(), () => 0.5);
    assert.equal(next(), 10);
    assert.equal(next(), 10);
});

test('pickMenu remplit la semaine et respecte les repas conservés', () => {
    const week = weekWith({ Lundi: { midi_plat: 11 } });
    const r = pickMenu({
        recipes: RECIPES, week, preference: 'balanced', keepExisting: true,
        household: 4, fridge: [], today: '2026-08-18', rng: () => 0.5
    });
    assert.equal(r.error, null);
    assert.equal(r.week.Lundi['midi_plat'], 11, 'le repas existant est conservé');
    assert.ok(r.placed > 7);
});

test('pickMenu signale l absence de plat exploitable', () => {
    const r = pickMenu({
        recipes: [RECIPES[3]], week: emptyWeek(), preference: 'balanced',
        keepExisting: false, household: 4, fridge: [], today: '2026-08-18', rng: () => 0.5
    });
    assert.match(r.error, /Aucun plat/);
});

test('pickMenu ne place ni entrée ni dessert le midi', () => {
    const r = pickMenu({
        recipes: RECIPES, week: emptyWeek(), preference: 'balanced', keepExisting: false,
        household: 4, fridge: [], today: '2026-08-18', rng: () => 0.5
    });
    DAYS.forEach((d) => {
        assert.equal(r.week[d]['midi_entrée'], null);
        assert.equal(r.week[d]['midi_dessert'], null);
    });
});

/* ==========================================================
   Score d'équilibre
   ========================================================== */

test('le score est nul sans repas', () => {
    const r = nutritionScore(emptyWeek(), byId);
    assert.equal(r.score, 0);
    assert.match(nutritionSummary(r), /Aucun repas/);
});

test('une semaine variée marque plus qu une semaine monotone', () => {
    const mono = {}; const varie = {};
    DAYS.forEach((d, i) => {
        mono[d] = { midi_plat: 10, soir_plat: 10 };
        varie[d] = { midi_plat: i % 2 ? 10 : 11, soir_entrée: 12, soir_plat: i % 2 ? 11 : 10, soir_dessert: 13 };
    });
    const a = nutritionScore(weekWith(mono), byId);
    const b = nutritionScore(weekWith(varie), byId);
    assert.ok(b.score > a.score, `variée ${b.score} devrait dépasser monotone ${a.score}`);
    assert.equal(a.distinct, 1);
    assert.ok(b.distinct > 1);
});

test('le score reste dans 0..100', () => {
    const full = {};
    DAYS.forEach((d) => { full[d] = {}; SLOT_KEYS.forEach((k) => { full[d][k] = 10; }); });
    const r = nutritionScore(weekWith(full), byId);
    assert.ok(r.score >= 0 && r.score <= 100, `score hors bornes : ${r.score}`);
});

/* ==========================================================
   Arrondi des quantités de la liste de courses
   ========================================================== */

test('les dénombrables sont arrondis à l entier supérieur', () => {
    // Une recette pour 6 servie à 4 donne des tiers : 30,67 oignons ne veut rien dire.
    assert.equal(roundForShopping(30.67, 'pièce'), 31);
    assert.equal(roundForShopping(8.67, 'gousse'), 9);
    assert.equal(roundForShopping(0.33, 'pièce'), 1, 'un tiers d oignon reste un oignon');
    assert.equal(roundForShopping(1.001, 'botte'), 2);
    assert.equal(roundForShopping(4, 'pièce'), 4, 'un entier ne bouge pas');
    assert.equal(roundForShopping(2.5, ''), 3, 'sans unité, on compte aussi');
});

test('les poids montent au palier supérieur', () => {
    assert.equal(roundForShopping(47, 'g'), 50);
    assert.equal(roundForShopping(233, 'g'), 240);
    assert.equal(roundForShopping(1233, 'g'), 1250);
    assert.equal(roundForShopping(3, 'g'), 5, 'jamais sous le palier le plus fin');
});

test('les volumes montent au palier supérieur', () => {
    assert.equal(roundForShopping(666.7, 'ml'), 700);
    assert.equal(roundForShopping(1010, 'ml'), 1100);
    assert.equal(roundForShopping(120, 'ml'), 120);
});

test('les valeurs déjà rondes ne sont pas gonflées', () => {
    for (const [q, u] of [[250, 'g'], [1000, 'g'], [500, 'ml'], [3, 'pièce'], [10, 'feuille']]) {
        assert.equal(roundForShopping(q, u), q, `${q} ${u} devait rester inchangé`);
    }
});

test('les cuillères gardent le demi', () => {
    assert.equal(roundForShopping(8.67, 'cuillère à soupe'), 9);
    assert.equal(roundForShopping(2.1, 'cuillère à café'), 2.5);
    assert.equal(roundForShopping(0.1, 'cuillère à soupe'), 0.5);
});

test('l arrondi ne fait jamais acheter moins que nécessaire', () => {
    const cas = [[30.67, 'pièce'], [47, 'g'], [233, 'g'], [666.7, 'ml'], [8.67, 'cuillère à soupe'], [0.33, 'gousse']];
    for (const [q, u] of cas) {
        assert.ok(roundForShopping(q, u) >= q, `${q} ${u} : ${roundForShopping(q, u)} est insuffisant`);
    }
});

test('une quantité inconnue ou nulle traverse sans être inventée', () => {
    assert.equal(roundForShopping(null, 'pièce'), null);
    assert.equal(roundForShopping(0, 'g'), 0);
});

test('la liste de courses construite ne contient plus de quantité à rallonge', () => {
    const recettes = [
        { id: 1, title: 'Colombo', type: 'plat', servings: 6, tags: [], steps: [],
          ingredients: [
              { name: 'oignon', qty: 4, unit: 'pièce', section: 'fruits-legumes' },
              { name: 'poulet', qty: 800, unit: 'g', section: 'boucherie' }
          ] }
    ];
    const week = {};
    for (const jour of ['Lundi', 'Mardi', 'Mercredi']) {
        week[jour] = { midi_plat: 1, portions: { midi_plat: 4 }, acc: {} };
    }

    const { list } = buildShoppingList(week, (id) => recettes.find((r) => r.id === Number(id)), {
        household: 4, existing: [], fridge: [], deduct: false, today: new Date('2026-08-17')
    });

    const oignon = list.find((i) => i.name === 'oignon');
    const poulet = list.find((i) => i.name === 'poulet');
    // 4 oignons pour 6 parts, servis 4, trois fois : 8 exactement
    assert.equal(oignon.qty, 8);
    assert.ok(Number.isInteger(oignon.qty), `quantité fractionnaire : ${oignon.qty}`);
    assert.equal(poulet.qty, 1600);
    for (const item of list) {
        if (item.qty == null) continue;
        assert.ok(String(item.qty).length <= 6, `quantité à rallonge : ${item.qty} ${item.unit}`);
    }
});
