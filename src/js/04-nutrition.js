/*
 * Score d'équilibre de la semaine affichée.
 *
 * La v0.22 affichait `plats / 14` sous l'étiquette « Équilibre Nutritionnel » :
 * c'était un taux de remplissage, pas un équilibre. Le score ci-dessous croise
 * quatre dimensions réellement calculables avec les données saisies.
 *
 * Module pur : testable hors navigateur.
 */

import { DAYS, SLOT_KEYS, KCAL_TARGET, KCAL_TOLERANCE } from './01-constants.js';

const VEG_TAG = /^(v[ée]g[ée]?|vegan|healthy)/i;

/**
 * @param week        planning de la semaine : { [jour]: { [créneau]: id, ... } }
 * @param recipeById  (id) => recette | undefined
 * @returns { score, counts, meals, distinct, kcalPerDay, plannedDays, vegShare, parts }
 */
export function nutritionScore(week, recipeById) {
    const counts = { 'entrée': 0, 'plat': 0, 'dessert': 0 };
    const distinctIds = new Set();
    const kcalByDay = [];
    let meals = 0;
    let vegMeals = 0;

    DAYS.forEach((day) => {
        const entry = (week && week[day]) || {};
        let kcal = 0;
        let dayHasMeal = false;

        SLOT_KEYS.forEach((k) => {
            const recipe = recipeById(entry[k]);
            if (!recipe) return;
            meals++;
            dayHasMeal = true;
            distinctIds.add(recipe.id);
            if (counts[recipe.type] !== undefined) counts[recipe.type]++;
            // `calories` est exprimé par portion : le nombre de convives ne
            // change pas l'apport calorique d'une personne.
            kcal += Number(recipe.calories) || 0;
            if ((recipe.tags || []).some((t) => VEG_TAG.test(String(t)))) vegMeals++;
        });

        if (dayHasMeal) kcalByDay.push(kcal);
    });

    const plannedDays = kcalByDay.length;
    const kcalPerDay = plannedDays ? Math.round(kcalByDay.reduce((a, b) => a + b, 0) / plannedDays) : 0;

    if (!meals) {
        return {
            score: 0, counts, meals: 0, distinct: 0, kcalPerDay: 0, plannedDays: 0, vegShare: 0,
            parts: { coverage: 0, variety: 0, calories: 0, vegetal: 0 }
        };
    }

    // Couverture : deux plats principaux par jour est la cible d'une semaine complète.
    const coverage = Math.min(1, counts.plat / (DAYS.length * 2));

    // Variété : une semaine de sept fois le même plat n'est pas équilibrée.
    const variety = meals > 1 ? (distinctIds.size - 1) / (meals - 1) : 1;

    // Calories : pleine note dans la fenêtre cible, décroissance linéaire ensuite.
    const gap = Math.abs(kcalPerDay - KCAL_TARGET);
    const calories = Math.max(0, 1 - Math.max(0, gap - KCAL_TOLERANCE / 2) / KCAL_TOLERANCE);

    // Végétal : 40 % des repas végétariens ou « healthy » vaut la note pleine.
    const vegShare = vegMeals / meals;
    const vegetal = Math.min(1, vegShare / 0.4);

    const parts = { coverage, variety, calories, vegetal };
    const score = Math.round(100 * (0.40 * coverage + 0.25 * variety + 0.20 * calories + 0.15 * vegetal));

    return { score, counts, meals, distinct: distinctIds.size, kcalPerDay, plannedDays, vegShare, parts };
}

/** Phrase d'explication affichée sous le score. */
export function nutritionSummary(result) {
    if (!result.meals) return 'Aucun repas planifié cette semaine';
    const bits = [
        `${result.counts.plat}/14 plats`,
        `${result.distinct} recette${result.distinct > 1 ? 's' : ''} distincte${result.distinct > 1 ? 's' : ''}`,
        `~${result.kcalPerDay} kcal/jour`
    ];
    return bits.join(' • ');
}

/** Point faible dominant, pour orienter l'utilisateur. */
export function nutritionAdvice(result) {
    if (!result.meals) return 'Planifiez des repas pour obtenir un score.';
    const { coverage, variety, calories, vegetal } = result.parts;
    const worst = Math.min(coverage, variety, calories, vegetal);
    if (worst === coverage) return 'Il reste des plats principaux à planifier.';
    if (worst === variety) return 'Les recettes se répètent : variez davantage.';
    if (worst === calories) {
        return result.kcalPerDay > KCAL_TARGET
            ? `Apport élevé (~${result.kcalPerDay} kcal/jour) : allégez quelques repas.`
            : `Apport faible (~${result.kcalPerDay} kcal/jour) : étoffez quelques repas.`;
    }
    return 'Ajoutez des recettes végétariennes ou légères.';
}

