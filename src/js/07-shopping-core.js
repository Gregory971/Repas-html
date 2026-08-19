/*
 * Construction de la liste de courses depuis le planning.
 * Module pur : testable hors navigateur.
 *
 * v0.23 : la liste tient compte de ce qui est déjà au frigo. C'est la raison
 * d'être du passage des quantités en valeurs structurées — on ne peut pas
 * soustraire « 200 g » d'une chaîne « 3 pces ».
 */

import { DAYS, SLOT_KEYS, SECTION_LABELS, SECTION_ORDER } from './01-constants.js';
import { generateId, nameKey, namesMatch, daysUntil } from './02-utils.js';
import { toBase, guessSection } from './03-ingredients.js';

/**
 * Agrège les besoins de la semaine, en unités de base (g, ml ou unité brute).
 * 200 g + 0,8 kg donnent une seule ligne de 1 kg.
 *
 * @returns Map clé -> { name, qty, unit, section, count }
 */
export function aggregatePlanning(week, recipeById, household) {
    const needed = new Map();

    const add = (name, qty, unit, section) => {
        const base = qty == null ? { qty: null, unit: '' } : toBase(qty, unit);
        const key = `${nameKey(name)}|${base.unit}`;
        const cur = needed.get(key);
        if (cur) {
            if (cur.qty == null || base.qty == null) cur.count++;
            else cur.qty += base.qty;
        } else {
            needed.set(key, { name, qty: base.qty, unit: base.unit, section, count: 1 });
        }
    };

    DAYS.forEach((day) => {
        const entry = (week && week[day]) || {};
        SLOT_KEYS.forEach((k) => {
            const recipe = recipeById(entry[k]);
            if (!recipe) return;
            const portions = (entry.portions && entry.portions[k]) || household;
            const factor = portions / (recipe.servings || 4);

            (recipe.ingredients || []).forEach((ing) => {
                if (!ing || !ing.name) return;
                add(ing.name, ing.qty == null ? null : ing.qty * factor, ing.unit, ing.section);
            });
            ((entry.acc && entry.acc[k]) || []).forEach((acc) => {
                add(String(acc), null, '', guessSection(acc));
            });
        });
    });

    return needed;
}

/**
 * Stock disponible au frigo, en unités de base.
 * Les produits périmés ne comptent pas : ils ne dispensent pas d'acheter.
 *
 * Renvoie un tableau et non une table indexée, car le rapprochement des noms
 * est approximatif (« Poulet fermier » couvre « poulet ») et ne peut pas se
 * faire par égalité de clé.
 */
export function fridgeStock(fridge, today) {
    const stock = [];
    (fridge || []).forEach((item) => {
        if (!item || !item.name) return;
        const left = daysUntil(item.expiry, today);
        if (left != null && left < 0) return;                 // périmé

        const base = item.qty == null ? { qty: null, unit: '' } : toBase(item.qty, item.unit);
        const existing = stock.find((s) => s.unit === base.unit && namesMatch(s.name, item.name));
        if (existing) {
            if (existing.qty == null || base.qty == null) existing.qty = null;   // quantité inconnue
            else existing.qty += base.qty;
        } else {
            stock.push({ name: item.name, qty: base.qty, unit: base.unit });
        }
    });
    return stock;
}

/**
 * Retranche le contenu du frigo des besoins.
 * - quantité couverte      -> la ligne disparaît
 * - couverture partielle   -> la quantité restante est réduite
 * - quantité inconnue      -> la ligne est conservée mais signalée
 *
 * @returns tableau de { name, qty, unit, section, count, inFridge }
 */
export function deductFridge(needed, fridge, today) {
    const stock = fridgeStock(fridge, today);
    const out = [];

    needed.forEach((item) => {
        const have = stock.find((s) => s.unit === item.unit && namesMatch(s.name, item.name));
        if (!have) { out.push({ ...item, inFridge: false }); return; }

        if (item.qty == null || have.qty == null) {
            // On sait que le produit est au frigo, sans pouvoir chiffrer le reste à acheter.
            out.push({ ...item, inFridge: true });
            return;
        }

        const remaining = item.qty - have.qty;
        have.qty = Math.max(0, have.qty - item.qty);          // le stock se consomme
        if (remaining > 0.0001) out.push({ ...item, qty: remaining, inFridge: true });
        // sinon : entièrement couvert, rien à acheter
    });

    return out;
}

/** Index de rangement d'un rayon dans le parcours du magasin. */
export function sectionRank(section) {
    const i = SECTION_ORDER.indexOf(section);
    return i < 0 ? SECTION_ORDER.length : i;
}

/**
 * Reconstruit la liste de courses : remplace les lignes automatiques, préserve
 * les lignes saisies à la main ainsi que les cases déjà cochées.
 *
 * @returns { list, added, covered }
 */
export function buildShoppingList(week, recipeById, options) {
    const { household, existing, fridge, deduct, today } = options;

    const needed = aggregatePlanning(week, recipeById, household);
    const totalNeeded = needed.size;
    const items = deduct ? deductFridge(needed, fridge, today) : [...needed.values()].map((i) => ({ ...i, inFridge: false }));

    const previouslyChecked = new Set(
        (existing || []).filter((i) => i.auto && i.checked).map((i) => nameKey(i.name))
    );
    const manual = (existing || []).filter((i) => !i.auto);
    const manualKeys = new Set(manual.map((i) => nameKey(i.name)));

    const list = manual.slice();
    let added = 0;

    items.forEach((item) => {
        const key = nameKey(item.name);
        if (manualKeys.has(key)) return;                      // déjà saisi à la main
        const section = SECTION_LABELS[item.section] ? item.section : guessSection(item.name);
        list.push({
            id: generateId(),
            category: SECTION_LABELS[section] || 'Divers',
            section,
            name: item.name,
            qty: item.qty == null ? null : Math.round(item.qty * 100) / 100,
            unit: item.unit,
            count: item.count,
            checked: previouslyChecked.has(key),
            auto: true,
            inFridge: !!item.inFridge
        });
        added++;
    });

    list.sort((a, b) => sectionRank(a.section) - sectionRank(b.section) || a.name.localeCompare(b.name, 'fr'));

    return { list, added, covered: totalNeeded - items.length };
}
