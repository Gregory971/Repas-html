/*
 * Générateur de menu local. Module pur : testable hors navigateur.
 *
 * v0.23 :
 *  - les recettes qui consomment un produit proche de la péremption passent
 *    en tête (l'application connaissait les dates sans jamais s'en servir) ;
 *  - la file est re-mélangée à chaque cycle et le même plat ne revient pas
 *    deux jours de suite, là où la v0.22 répétait 1-2-3-1-2-3 à l'identique.
 */

import { DAYS, SLOT_KEYS, TYPES, URGENT_DAYS } from './01-constants.js';
import { nameKey, namesMatch, daysUntil } from './02-utils.js';

/** Noms normalisés des produits du frigo à consommer rapidement. */
export function urgentFridgeNames(fridge, today, urgentDays) {
    const limit = urgentDays == null ? URGENT_DAYS : urgentDays;
    const names = new Set();
    (fridge || []).forEach((item) => {
        if (!item || !item.name) return;
        const left = daysUntil(item.expiry, today);
        if (left == null || left < 0 || left > limit) return;
        names.add(nameKey(item.name));
    });
    return names;
}

/** Nombre d'ingrédients de la recette qui consomment un produit urgent. */
export function urgencyScore(recipe, urgentNames) {
    if (!urgentNames || !urgentNames.size) return 0;
    let n = 0;
    (recipe.ingredients || []).forEach((ing) => {
        if (!ing || !ing.name) return;
        for (const urgent of urgentNames) {
            if (namesMatch(ing.name, urgent)) { n++; return; }
        }
    });
    return n;
}

function shuffle(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/** Mélange à l'intérieur de chaque palier d'urgence, sans casser l'ordre des paliers. */
function shuffleWithinTiers(scored, rng) {
    const tiers = new Map();
    scored.forEach((entry) => {
        if (!tiers.has(entry.score)) tiers.set(entry.score, []);
        tiers.get(entry.score).push(entry.recipe);
    });
    return [...tiers.keys()]
        .sort((a, b) => b - a)
        .flatMap((score) => shuffle(tiers.get(score), rng));
}

/**
 * File de sélection pour un type de recette : parcourt la liste, la re-mélange
 * à chaque tour complet et évite de resservir les `avoid` derniers choix.
 */
export function createPicker(recipes, urgentNames, rng, avoid) {
    const scored = recipes.map((recipe) => ({ recipe, score: urgencyScore(recipe, urgentNames) }));
    let queue = shuffleWithinTiers(scored, rng);
    let cursor = 0;
    const recent = [];
    const memory = Math.min(avoid == null ? 2 : avoid, Math.max(0, recipes.length - 1));

    return function next() {
        if (!queue.length) return null;

        for (let attempt = 0; attempt < queue.length; attempt++) {
            if (cursor >= queue.length) {
                queue = shuffleWithinTiers(scored, rng);   // nouveau tour, nouvel ordre
                cursor = 0;
            }
            const candidate = queue[cursor++];
            if (!recent.includes(candidate.id)) {
                recent.push(candidate.id);
                if (recent.length > memory) recent.shift();
                return candidate.id;
            }
        }

        // Réservoir trop petit pour respecter la contrainte : on ressert.
        if (cursor >= queue.length) cursor = 0;
        return queue[cursor++].id;
    };
}

export function preferenceMatcher(preference) {
    if (preference === 'vege') return (r) => (r.tags || []).some((t) => /^(v[ée]g[ée]?|vegan)/i.test(t));
    if (preference === 'express') return (r) => r.time <= 20;
    if (preference === 'antillaise') return (r) => (r.tags || []).some((t) => /antill|cr[ée]ole|[ée]pic/i.test(t));
    return () => true;
}

/**
 * Construit le planning d'une semaine.
 *
 * @returns { week, placed, error }
 */
export function pickMenu(options) {
    const {
        recipes, week, preference, keepExisting, household,
        fridge, today, rng = Math.random
    } = options;

    const matches = preferenceMatcher(preference);
    const urgentNames = urgentFridgeNames(fridge, today);

    const byType = {};
    TYPES.forEach((t) => {
        let list = recipes.filter((r) => r.type === t && matches(r));
        if (!list.length) list = recipes.filter((r) => r.type === t);   // repli si le filtre est trop strict
        byType[t] = list;
    });

    if (!byType.plat.length) return { week, placed: 0, error: 'Aucun plat disponible pour cet objectif' };

    const pickers = {};
    TYPES.forEach((t) => { pickers[t] = createPicker(byType[t], urgentNames, rng); });

    const out = {};
    let placed = 0;

    DAYS.forEach((day) => {
        const previous = (week && week[day]) || {};
        const entry = { portions: {}, acc: {} };

        SLOT_KEYS.forEach((k) => {
            if (keepExisting && previous[k]) {
                entry[k] = previous[k];
                if (previous.portions && previous.portions[k]) entry.portions[k] = previous.portions[k];
                if (previous.acc && previous.acc[k]) entry.acc[k] = previous.acc[k];
                placed++;
                return;
            }

            const type = k.split('_')[1];
            // Entrées et desserts uniquement le soir, pour un planning réaliste
            const wanted = type === 'plat' || k.startsWith('soir');
            const id = wanted ? pickers[type]() : null;
            entry[k] = id;
            if (id) { entry.portions[k] = household; placed++; }
        });

        out[day] = entry;
    });

    return { week: out, placed, error: null };
}
