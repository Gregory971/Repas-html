/*
 * Modèle de données et normalisation de toute donnée entrante
 * (localStorage ou import JSON). Module pur : testable hors navigateur.
 *
 * v0.23 : le frigo et la liste de courses passent de chaînes libres à des
 * quantités structurées { qty, unit }, comme les ingrédients de recettes
 * depuis la v0.15. C'est ce qui permet de déduire le frigo des courses et
 * d'agréger correctement les ajouts manuels.
 */

import {
    DAYS, SLOT_KEYS, TYPES, SECTION_LABELS, STATE_VERSION
} from './01-constants.js';
import { clampInt, generateId, isoDate, addDays, startOfWeek } from './02-utils.js';
import { normalizeIngredient, parseIngLine, parseQty, guessSection, normalizeUnit } from './03-ingredients.js';

/* ---------- Jeu de démonstration ---------- */

export function rawDefaultRecipes() {
    return [
        { id: 1, title: 'Salade de Burrata & Figues', type: 'entrée', time: 10, tags: ['Healthy', 'Végé'], image: '', ingredients: ['2 pièces de burrata', '6 figues', '100 g de roquette', "3 cuillères à soupe d'huile d'olive"], steps: ['Disposer la roquette', 'Ajouter la burrata et les figues'] },
        { id: 2, title: 'Velouté de Potimarron', type: 'entrée', time: 15, tags: ['Healthy', 'Rapide'], image: '', ingredients: ['1 kg de potimarron', '20 cl de crème', '1 pincée de muscade'], steps: ['Cuire le potimarron', 'Mixer avec la crème'] },
        { id: 3, title: 'Bowl Quinoa & Patates Douces', type: 'plat', time: 25, tags: ['Healthy', 'Végé'], image: '', ingredients: ['320 g de quinoa', '800 g de patate douce', '2 avocats'], steps: ['Cuire le quinoa', 'Rôtir la patate douce'] },
        { id: 4, title: 'Pavé de Saumon & Asperges', type: 'plat', time: 20, tags: ['Healthy', 'Poisson'], image: '', ingredients: ['4 pavés de saumon', "1 botte d'asperges", '1 citron'], steps: ['Poêler le saumon', 'Cuire les asperges à la vapeur'] },
        { id: 5, title: 'Colombo de Poulet Antillais', type: 'plat', time: 35, tags: ['Épicé', 'Antillaise'], image: '', ingredients: ['800 g de poulet', '2 cuillères à soupe de poudre de colombo', '1 piment', '600 g de pommes de terre'], steps: ['Mariner le poulet', 'Mijoter avec la poudre de colombo'] },
        { id: 6, title: 'Mousse au Chocolat Noir', type: 'dessert', time: 15, tags: ['Gourmand'], image: '', ingredients: ['200 g de chocolat noir', '6 œufs', '50 g de sucre'], steps: ['Fondre le chocolat', 'Monter les blancs en neige'] },
        { id: 7, title: 'Tarte Fine aux Pommes', type: 'dessert', time: 25, tags: ['Fait Maison'], image: '', ingredients: ['6 pommes', '1 pâte feuilletée', '40 g de beurre'], steps: ['Disposer les pommes', 'Enfourner 25 min'] }
    ];
}

export function defaultRecipes() {
    return rawDefaultRecipes().map((r) => Object.assign(r, {
        servings: 4,
        ingredients: r.ingredients.map(normalizeIngredient).filter(Boolean)
    }));
}

export function defaultState() {
    const today = new Date();
    return {
        version: STATE_VERSION,
        recipes: defaultRecipes(),
        weeks: {},
        shoppingList: [
            { id: generateId(), category: 'Fruits & Légumes', section: 'fruits-legumes', name: 'Patates douces', qty: 3, unit: 'pièce', checked: false, auto: false },
            { id: generateId(), category: 'Fruits & Légumes', section: 'fruits-legumes', name: 'Asperges vertes', qty: 1, unit: 'botte', checked: false, auto: false },
            { id: generateId(), category: 'Produits frais', section: 'frais', name: 'Burrata AOP', qty: 2, unit: 'pièce', checked: false, auto: false },
            { id: generateId(), category: 'Épicerie salée', section: 'epicerie-salee', name: 'Poudre de Colombo', qty: 1, unit: 'pot', checked: false, auto: false }
        ],
        fridge: [
            { id: generateId(), name: 'crème fraîche 30%', qty: 20, unit: 'cl', expiry: isoDate(addDays(today, 1)) },
            { id: generateId(), name: 'poulet', qty: 800, unit: 'g', expiry: isoDate(addDays(today, 3)) },
            { id: generateId(), name: 'lait demi-écrémé', qty: 1, unit: 'l', expiry: isoDate(addDays(today, -1)) }
        ],
        foodBank: [
            { id: generateId(), category: 'Légume', name: 'Tomates fraîches', unit: 'kg' },
            { id: generateId(), category: 'Viande', name: 'Blanc de poulet', unit: 'g' },
            { id: generateId(), category: 'Poisson', name: 'Pavé de saumon', unit: 'pce' },
            { id: generateId(), category: 'Féculent', name: 'Riz basmati', unit: 'g' }
        ],
        settings: { household: 4, banned: [], theme: 'dark', deductFridge: true, panels: { left: true, right: true } }
    };
}

/* ---------- Éléments de liste ---------- */

/**
 * Un produit du frigo. Accepte l'ancien format v0.21 où la quantité était
 * noyée dans le nom (« 200 g de tomate ») et la ré-analyse.
 */
export function normalizeFridgeItem(raw) {
    if (!raw || !raw.name) return null;

    let name = String(raw.name).trim();
    let qty = Number(raw.qty);
    let unit = normalizeUnit(raw.unit);

    if (!Number.isFinite(qty) || qty <= 0) {
        // Format v0.21 : le libellé porte la quantité, on la récupère.
        const parsed = parseIngLine(name);
        if (parsed && parsed.qty != null) {
            name = parsed.name;
            qty = parsed.qty;
            unit = parsed.unit;
        } else {
            qty = null;
            unit = unit || '';
        }
    }

    let expiry = typeof raw.expiry === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.expiry) ? raw.expiry : null;
    if (!expiry) {
        // Migration v0.20 : statut textuel -> date approchée
        const offset = raw.status === 'danger' ? -1 : (raw.status === 'warning' ? 1 : 3);
        expiry = isoDate(addDays(new Date(), offset));
    }

    return {
        id: Number(raw.id) || generateId(),
        name: name.slice(0, 80),
        qty: qty == null ? null : qty,
        unit: String(unit || '').slice(0, 24),
        expiry
    };
}

/**
 * Une ligne de courses. Accepte l'ancien format v0.21 où `qty` était une
 * chaîne d'affichage (« 3 pces », « ×2 »).
 */
export function normalizeShoppingItem(raw) {
    if (!raw || !raw.name) return null;

    const name = String(raw.name).trim().slice(0, 80);
    if (!name) return null;

    let qty = Number(raw.qty);
    let unit = normalizeUnit(raw.unit);
    let count = clampInt(raw.count, 1, 99, 1);

    if (!Number.isFinite(qty) || qty <= 0) {
        const parsed = parseQty(raw.qty);
        qty = parsed.qty;
        unit = unit || parsed.unit;
        // « ×3 » : trois recettes réclament ce produit sans quantité chiffrée.
        const mult = String(raw.qty == null ? '' : raw.qty).match(/^[×x]\s*(\d+)$/i);
        if (mult) { qty = null; count = clampInt(mult[1], 1, 99, 1); }
    }

    const section = SECTION_LABELS[raw.section] ? raw.section : guessSection(name);
    return {
        id: Number(raw.id) || generateId(),
        category: String(raw.category || SECTION_LABELS[section] || 'Divers').slice(0, 40),
        section,
        name,
        qty: qty == null ? null : qty,
        unit: String(unit || '').slice(0, 24),
        count,
        checked: !!raw.checked,
        auto: !!raw.auto
    };
}

/* ---------- Semaines ---------- */

/** Une semaine sans aucun repas n'a pas à être conservée ni exportée. */
export function isEmptyWeek(week) {
    if (!week) return true;
    return !DAYS.some((day) => {
        const entry = week[day];
        return entry && SLOT_KEYS.some((k) => entry[k]);
    });
}

/**
 * Retire les semaines vides créées au fil de la navigation.
 * En v0.22, `plan()` matérialisait la semaine affichée à chaque rendu : un
 * aller-retour sur les flèches suffisait à graver des dizaines de semaines
 * vides dans le stockage et dans l'export JSON.
 */
export function pruneEmptyWeeks(weeks) {
    const out = {};
    Object.keys(weeks || {}).forEach((key) => {
        if (!isEmptyWeek(weeks[key])) out[key] = weeks[key];
    });
    return out;
}

export function emptyWeek() {
    const w = {};
    DAYS.forEach((d) => {
        w[d] = { portions: {}, acc: {} };
        SLOT_KEYS.forEach((k) => { w[d][k] = null; });
    });
    return w;
}

/* ---------- Normalisation générale ---------- */

/** Normalise n'importe quelle donnée entrante (localStorage ou import). */
export function normalize(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;

    const out = {
        version: STATE_VERSION,
        recipes: [], weeks: {}, shoppingList: [], fridge: [], foodBank: [],
        settings: { household: 4, banned: [], theme: 'dark', deductFridge: true, panels: { left: true, right: true } }
    };

    const seenIds = new Set();
    (Array.isArray(raw.recipes) ? raw.recipes : base.recipes).forEach((r) => {
        if (!r || typeof r !== 'object' || !r.title) return;
        let id = Number(r.id);
        if (!Number.isFinite(id) || seenIds.has(id)) id = generateId();
        seenIds.add(id);
        // v0.15 : time = { prep, cook, total } ; v0.20+ : nombre de minutes
        const rawTime = (r.time && typeof r.time === 'object') ? r.time.total : r.time;

        out.recipes.push({
            id,
            title: String(r.title).slice(0, 120),
            type: TYPES.includes(r.type) ? r.type : 'plat',
            time: clampInt(rawTime, 0, 600, 20),
            servings: clampInt(r.servings, 1, 50, 4),
            tags: Array.isArray(r.tags) ? r.tags.map(String).slice(0, 12) : [],
            // Accepte les ingrédients structurés (v0.15) comme le texte libre
            ingredients: Array.isArray(r.ingredients)
                ? r.ingredients.map(normalizeIngredient).filter(Boolean).slice(0, 60) : [],
            steps: Array.isArray(r.steps) ? r.steps.map(String).slice(0, 60) : [],
            image: typeof r.image === 'string' ? r.image : '',
            // Page d'origine d'une recette importée : elle en porte le crédit.
            source: typeof r.source === 'string' && /^https?:\/\//.test(r.source)
                ? r.source.slice(0, 300) : undefined,
            // Champs non exploités mais conservés (aller-retour import/export)
            cuisine: typeof r.cuisine === 'string' ? r.cuisine : undefined,
            season: Array.isArray(r.season) ? r.season.map(Number).filter(Number.isFinite) : undefined
        });
    });
    if (!out.recipes.length) out.recipes = base.recipes;

    const validIds = new Set(out.recipes.map((r) => r.id));
    const cleanWeek = (week) => {
        const w = {};
        DAYS.forEach((day) => {
            const src = (week && week[day]) || {};
            const d = { portions: {}, acc: {} };
            SLOT_KEYS.forEach((k) => {
                const id = Number(src[k]);
                d[k] = validIds.has(id) ? id : null;
                const p = clampInt(src.portions && src.portions[k], 1, 50, 0);
                if (p) d.portions[k] = p;
                const a = src.acc && src.acc[k];
                if (Array.isArray(a) && a.length) d.acc[k] = a.map(String).slice(0, 8);
            });
            w[day] = d;
        });
        return w;
    };

    if (raw.weeks && typeof raw.weeks === 'object') {
        Object.keys(raw.weeks).forEach((key) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(key)) out.weeks[key] = cleanWeek(raw.weeks[key]);
        });
    } else if (raw.planning && typeof raw.planning === 'object') {
        // Migration v0.20 : un planning unique -> semaine courante
        out.weeks[isoDate(startOfWeek(new Date()))] = cleanWeek(raw.planning);
    }
    out.weeks = pruneEmptyWeeks(out.weeks);

    (Array.isArray(raw.shoppingList) ? raw.shoppingList : []).forEach((i) => {
        const item = normalizeShoppingItem(i);
        if (item) out.shoppingList.push(item);
    });

    const fridge = Array.isArray(raw.fridge) ? raw.fridge : (Array.isArray(raw.fridgeInventory) ? raw.fridgeInventory : []);
    fridge.forEach((i) => {
        const item = normalizeFridgeItem(i);
        if (item) out.fridge.push(item);
    });

    (Array.isArray(raw.foodBank) ? raw.foodBank : []).forEach((i) => {
        if (!i || !i.name) return;
        out.foodBank.push({
            id: Number(i.id) || generateId(),
            category: String(i.category || 'Autre').slice(0, 40),
            name: String(i.name).slice(0, 80),
            unit: String(i.unit || 'pce').slice(0, 10)
        });
    });

    const s = raw.settings || {};
    out.settings.household = clampInt(s.household, 1, 20, 4);
    out.settings.banned = Array.isArray(s.banned) ? s.banned.map((b) => String(b).toLowerCase().trim()).filter(Boolean).slice(0, 60) : [];
    out.settings.theme = s.theme === 'light' ? 'light' : 'dark';
    // Panneaux latéraux : repliés ou non, sur grand écran.
    const panels = (s.panels && typeof s.panels === 'object') ? s.panels : {};
    out.settings.panels = { left: panels.left !== false, right: panels.right !== false };
    out.settings.deductFridge = s.deductFridge !== false;

    return out;
}

/** Vrai tant que l'utilisateur n'a rien modifié depuis le jeu de démonstration. */
export function isPristineDemo(s) {
    if (s.recipes.length !== 7) return false;
    if (s.recipes.map((r) => r.id).sort((a, b) => a - b).join(',') !== '1,2,3,4,5,6,7') return false;
    if (s.shoppingList.some((i) => i.auto)) return false;
    const planned = Object.values(s.weeks).some((w) =>
        DAYS.some((day) => w[day] && SLOT_KEYS.some((k) => w[day][k])));
    return !planned;
}
