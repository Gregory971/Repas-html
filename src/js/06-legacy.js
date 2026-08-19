/*
 * Récupération des sauvegardes v0.7 → v0.15 (clés prNN_data).
 * Ces clés ne sont JAMAIS modifiées ni supprimées : lecture seule.
 *
 * `convertV15` est pur et testable ; seul `readLegacyV15` touche au stockage.
 */

import { DAYS, SECTION_LABELS, ACCOMPAGNEMENTS, STATE_VERSION } from './01-constants.js';
import { generateId, isoDate, addDays, startOfWeek } from './02-utils.js';
import { normalizeUnit, guessSection } from './03-ingredients.js';

export const LEGACY_V15_KEYS = [
    'pr15_data', 'pr14_data', 'pr13_data', 'pr12_data', 'pr11_data',
    'pr10_data', 'pr9_data', 'pr8_data', 'pr7_data'
];

/** La v0.15 nommait les créneaux sans accent. */
export const V15_SLOT_MAP = {
    midi_entree: 'midi_entrée', midi_plat: 'midi_plat', midi_dessert: 'midi_dessert',
    soir_entree: 'soir_entrée', soir_plat: 'soir_plat', soir_dessert: 'soir_dessert'
};

export function readLegacyV15() {
    for (const key of LEGACY_V15_KEYS) {
        let raw;
        try { raw = localStorage.getItem(key); } catch (e) { return null; }
        if (!raw) continue;
        try {
            const data = JSON.parse(raw);
            if (data && (Array.isArray(data.recipes) || Array.isArray(data.weeks))) return { key, data };
        } catch (e) { /* clé illisible : on essaie la suivante */ }
    }
    return null;
}

export const accompagnementName = (a) => {
    if (a && typeof a === 'object') return String(a.name || '');
    const found = ACCOMPAGNEMENTS.find((x) => x.id === a || x.name === a);
    return found ? found.name : String(a);
};

/** Convertit une sauvegarde v0.7–v0.15 vers le modèle courant. */
export function convertV15(d) {
    const out = {
        version: STATE_VERSION,
        recipes: Array.isArray(d.recipes) ? d.recipes : [],
        weeks: {}, shoppingList: [], fridge: [], foodBank: [], settings: {}
    };

    // weeks : liste ordonnée + index courant -> semaines datées autour de la semaine réelle
    const list = Array.isArray(d.weeks) ? d.weeks : [];
    const current = Number.isFinite(d.currentWeekIndex) ? d.currentWeekIndex : 0;
    const monday = startOfWeek(new Date());

    list.forEach((w, index) => {
        if (!w || !Array.isArray(w.days)) return;
        const week = {};
        DAYS.forEach((day, di) => {
            const src = w.days[di] || {};
            const entry = { portions: {}, acc: {} };
            Object.keys(V15_SLOT_MAP).forEach((oldKey) => {
                const k = V15_SLOT_MAP[oldKey];
                const ids = (src.meals && src.meals[oldKey]) || [];
                // v0.15 autorisait plusieurs recettes par créneau, on n'en garde qu'une
                entry[k] = ids.length ? Number(ids[0]) : null;
                const people = src.people && src.people[oldKey];
                if (entry[k] && Number(people) > 0) entry.portions[k] = Number(people);
                const accs = (src.accompagnements && src.accompagnements[oldKey]) || [];
                if (accs.length) entry.acc[k] = accs.map(accompagnementName).filter(Boolean);
            });
            week[day] = entry;
        });
        out.weeks[isoDate(addDays(monday, (index - current) * 7))] = week;
    });

    // inventory -> frigo. La quantité reste structurée : c'est elle qui permet
    // de déduire le frigo de la liste de courses.
    (Array.isArray(d.inventory) ? d.inventory : []).forEach((i) => {
        if (!i || !i.name) return;
        const qty = Number(i.qty);
        out.fridge.push({
            id: Number(i.id) || generateId(),
            name: String(i.name),
            qty: Number.isFinite(qty) && qty > 0 ? qty : null,
            unit: normalizeUnit(i.unit),
            expiry: i.expDate
        });
    });

    (Array.isArray(d.shoppingList) ? d.shoppingList : []).forEach((i) => {
        if (!i || !i.name) return;
        const qty = Number(i.qty);
        const section = SECTION_LABELS[i.section] ? i.section : guessSection(i.name);
        out.shoppingList.push({
            id: Number(i.id) || generateId(),
            category: SECTION_LABELS[section] || 'Divers',
            section,
            name: String(i.name),
            qty: Number.isFinite(qty) && qty > 0 ? qty : null,
            unit: normalizeUnit(i.unit),
            checked: !!i.checked
        });
    });

    (Array.isArray(d.foodItems) ? d.foodItems : []).forEach((f) => {
        if (!f || !f.name) return;
        out.foodBank.push({
            id: Number(f.id) || generateId(),
            category: String(f.category || 'Autre'),
            name: String(f.name),
            unit: String(f.unit || 'pce')
        });
    });

    if (d.settings) {
        out.settings.household = d.settings.household;
        out.settings.banned = d.settings.banned;
    }
    return out;
}
