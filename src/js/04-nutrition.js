/*
 * Score d'équilibre de la semaine affichée.
 *
 * La v0.22 affichait « plats / 14 » sous l'étiquette « Équilibre Nutritionnel » :
 * c'était un taux de remplissage, pas un équilibre. Le score ci-dessous croise
 * trois dimensions réellement calculables avec les données saisies.
 *
 * La v0.24 a retiré la dimension calorique : les recettes reprises des versions
 * v0.7 à v0.15 ne portaient aucune valeur, toutes recevaient donc la même
 * valeur de repli. L'indicateur affichait un chiffre sans rapport avec les
 * plats. Mieux vaut trois dimensions justes qu'une quatrième inventée.
 *
 * Module pur : testable hors navigateur.
 */

import { DAYS, SLOT_KEYS } from './01-constants.js';

const VEG_TAG = /^(v[ée]g[ée]?|vegan|healthy)/i;

/**
 * @param week        planning de la semaine : { [jour]: { [créneau]: id, ... } }
 * @param recipeById  (id) => recette | undefined
 * @returns { score, counts, meals, distinct, plannedDays, vegShare, parts }
 */
export function nutritionScore(week, recipeById) {
    const counts = { 'entrée': 0, 'plat': 0, 'dessert': 0 };
    const distinctIds = new Set();
    let meals = 0;
    let vegMeals = 0;
    let plannedDays = 0;

    DAYS.forEach((day) => {
        const entry = (week && week[day]) || {};
        let dayHasMeal = false;

        SLOT_KEYS.forEach((k) => {
            const recipe = recipeById(entry[k]);
            if (!recipe) return;
            meals++;
            dayHasMeal = true;
            distinctIds.add(recipe.id);
            if (counts[recipe.type] !== undefined) counts[recipe.type]++;
            if ((recipe.tags || []).some((t) => VEG_TAG.test(String(t)))) vegMeals++;
        });

        if (dayHasMeal) plannedDays++;
    });

    if (!meals) {
        return {
            score: 0, counts, meals: 0, distinct: 0, plannedDays: 0, vegShare: 0,
            parts: { coverage: 0, variety: 0, vegetal: 0 }
        };
    }

    // Couverture : deux plats principaux par jour est la cible d'une semaine complète.
    const coverage = Math.min(1, counts.plat / (DAYS.length * 2));

    // Variété : une semaine de sept fois le même plat n'est pas équilibrée.
    const variety = meals > 1 ? (distinctIds.size - 1) / (meals - 1) : 1;

    // Végétal : 40 % des repas végétariens ou « healthy » vaut la note pleine.
    const vegShare = vegMeals / meals;
    const vegetal = Math.min(1, vegShare / 0.4);

    const parts = { coverage, variety, vegetal };
    const score = Math.round(100 * (0.50 * coverage + 0.30 * variety + 0.20 * vegetal));

    return { score, counts, meals, distinct: distinctIds.size, plannedDays, vegShare, parts };
}

/** Phrase d'explication affichée sous le score. */
export function nutritionSummary(result) {
    if (!result.meals) return 'Aucun repas planifié cette semaine';
    const bits = [
        `${result.counts.plat}/14 plats`,
        `${result.distinct} recette${result.distinct > 1 ? 's' : ''} distincte${result.distinct > 1 ? 's' : ''}`,
        `${result.plannedDays}/7 jours couverts`
    ];
    return bits.join(' • ');
}

/** Point faible dominant, pour orienter l'utilisateur. */
export function nutritionAdvice(result) {
    if (!result.meals) return 'Planifiez des repas pour obtenir un score.';
    const { coverage, variety, vegetal } = result.parts;
    const worst = Math.min(coverage, variety, vegetal);
    // Toutes les dimensions au maximum : conseiller quoi que ce soit serait faux.
    // Sans ce test, une semaine parfaite affichait « il reste des plats à planifier ».
    if (worst >= 0.999) return 'Semaine complète, variée et équilibrée.';
    if (worst === coverage) return 'Il reste des plats principaux à planifier.';
    if (worst === variety) return 'Les recettes se répètent : variez davantage.';
    return 'Ajoutez des recettes végétariennes ou légères.';
}
