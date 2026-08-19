/*
 * Ingrédients structurés : { name, qty, unit, section }.
 * Compatible avec le format v0.15 (objets) et avec la saisie en texte libre.
 * Module pur : testable hors navigateur.
 */

import {
    INGREDIENT_SECTIONS, SECTION_LABELS, UNIT_ALIASES, UNIT_BASE,
    UNIT_PATTERN, VULGAR_FRACTIONS
} from './01-constants.js';

export function guessSection(name) {
    const n = String(name || '').toLowerCase();
    for (const [section, keywords] of INGREDIENT_SECTIONS) {
        if (keywords.some((k) => n.includes(k))) return section;
    }
    return 'epicerie-salee';
}

export function normalizeUnit(u) {
    const key = String(u || '').toLowerCase().trim();
    return UNIT_ALIASES[key] || key;
}

export function pluralUnit(qty, unit) {
    if (!unit || qty <= 1) return unit;
    if (/^(g|kg|mg|ml|l|cl|dl)$/i.test(unit)) return unit;          // symboles invariables
    if (/^cuillère /i.test(unit)) return 'cuillères' + unit.slice('cuillère'.length);
    return /[sxz]$/i.test(unit) ? unit : unit + 's';
}

/** Mots à h aspiré courants en cuisine : « de haricots », pas « d'haricots ». */
const H_ASPIRE = /^(haricot|homard|hareng|houmous|hachis)/i;

export function prepDe(name) {
    const n = String(name || '').trim();
    if (H_ASPIRE.test(n)) return 'de ';
    return /^[aeiouyéèêëàâùûîïôœæh]/i.test(n) ? "d'" : 'de ';
}

export function toBase(qty, unit) {
    const b = UNIT_BASE[String(unit || '').toLowerCase()];
    return b ? { qty: qty * b[1], unit: b[0] } : { qty, unit: normalizeUnit(unit) };
}

/** Glyphes rendus pour les quantités fractionnaires courantes en cuisine. */
const FRACTION_GLYPHS = { 0.5: '½', 0.25: '¼', 0.75: '¾', 0.333: '⅓', 0.667: '⅔' };

/** Unités mesurées, où l'on écrit « 1,5 kg » et non « 1½ kg ». */
const MEASURED_UNITS = /^(g|kg|mg|ml|l|cl|dl)$/i;

/** Nombre à la française : virgule décimale, jamais le point anglais. */
export function formatNumber(n) {
    const r = Math.round(n * 100) / 100;
    return Number.isInteger(r) ? String(r) : String(r).replace('.', ',');
}

/**
 * Nombre d'unités dénombrables : « ½ citron » se relit mieux que « 0,5 citron ».
 * Réservé aux dénombrements — sur une liste de courses, un poids s'écrit « 1,5 kg ».
 */
export function formatCount(n) {
    const r = Math.round(n * 100) / 100;
    if (Number.isInteger(r)) return String(r);

    const whole = Math.floor(r);
    const glyph = FRACTION_GLYPHS[Math.round((r - whole) * 1000) / 1000];
    if (glyph) return whole ? `${whole}${glyph}` : glyph;

    return formatNumber(r);
}

/** Formate une quantité en remontant automatiquement g -> kg et ml -> l. */
export function formatQty(qty, unit) {
    if (unit === 'g' && qty >= 1000) return `${formatNumber(qty / 1000)} kg`;
    if (unit === 'ml' && qty >= 1000) return `${formatNumber(qty / 1000)} l`;
    const q = Math.round(qty * 100) / 100;
    const render = MEASURED_UNITS.test(unit) ? formatNumber : formatCount;
    return `${render(q)} ${pluralUnit(q, unit)}`.trim();
}

/* ---------- Nombres, fractions comprises ---------- */

const FRACTION_CHARS = Object.keys(VULGAR_FRACTIONS).join('');
/** « 1 1/2 », « 3/4 », « 1½ », « ½ », « 1,5 » — dans cet ordre de priorité. */
export const NUM_PATTERN =
    `\\d+\\s+\\d+\\s*/\\s*\\d+` +
    `|\\d+\\s*/\\s*\\d+` +
    `|\\d+(?:[.,]\\d+)?\\s*[${FRACTION_CHARS}]` +
    `|[${FRACTION_CHARS}]` +
    `|\\d+(?:[.,]\\d+)?`;


/** Convertit une écriture numérique de recette en nombre. null si illisible. */
export function parseNumber(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return null;

    let m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);          // 1 1/2
    if (m) {
        const d = Number(m[3]);
        return d ? Number(m[1]) + Number(m[2]) / d : null;
    }

    m = s.match(/^(\d+)\s*\/\s*(\d+)$/);                       // 3/4
    if (m) {
        const d = Number(m[2]);
        return d ? Number(m[1]) / d : null;
    }

    m = s.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*([${FRACTION_CHARS}])$`)); // 1½
    if (m) return parseFloat(m[1].replace(',', '.')) + VULGAR_FRACTIONS[m[2]];

    if (VULGAR_FRACTIONS[s] !== undefined) return VULGAR_FRACTIONS[s];         // ½

    const n = parseFloat(s.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

/* ---------- Analyse d'une ligne saisie ---------- */

const RE_QTY_UNIT_DE = new RegExp(`^(${NUM_PATTERN})\\s*(${UNIT_PATTERN})\\s+d[e']\\s*(.+)$`, 'i');
const RE_QTY_UNIT = new RegExp(`^(${NUM_PATTERN})\\s*(${UNIT_PATTERN})\\s+(.+)$`, 'i');
const RE_QTY_DE = new RegExp(`^(${NUM_PATTERN})\\s+d[e']\\s*(.+)$`, 'i');
const RE_QTY = new RegExp(`^(${NUM_PATTERN})\\s+(.+)$`, 'i');

/** « 200 g de tomates » / « ½ citron » / « 3 oignons » / « sel » -> objet ingrédient. */
export function parseIngLine(line) {
    const t = String(line == null ? '' : line).trim();
    if (!t) return null;

    let m = t.match(RE_QTY_UNIT_DE) || t.match(RE_QTY_UNIT);
    if (m) {
        const name = m[3].trim().toLowerCase();
        if (name) return { name, qty: parseNumber(m[1]), unit: normalizeUnit(m[2]), section: guessSection(name) };
    }

    m = t.match(RE_QTY_DE) || t.match(RE_QTY);
    if (m) {
        const name = m[2].trim().toLowerCase();
        if (name) return { name, qty: parseNumber(m[1]), unit: 'pièce', section: guessSection(name) };
    }

    const name = t.toLowerCase();
    return { name, qty: null, unit: '', section: guessSection(name) };
}

/**
 * Analyse une quantité seule, telle que stockée par les anciennes listes de
 * courses : « 3 pces », « 1 botte », « ×2 ». Le nom est déjà dans un champ à part.
 */
export function parseQty(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return { qty: null, unit: '' };

    const m = s.match(new RegExp(`^(${NUM_PATTERN})\\s*(.*)$`, 'i'));
    if (!m) return { qty: null, unit: '' };

    const qty = parseNumber(m[1]);
    if (qty == null) return { qty: null, unit: '' };
    return { qty, unit: normalizeUnit(m[2]) };
}

/** Accepte un objet {name,qty,unit,section} (v0.15) OU une chaîne libre. */
export function normalizeIngredient(x) {
    if (x == null) return null;
    if (typeof x === 'string') return parseIngLine(x);
    if (typeof x !== 'object') return parseIngLine(String(x));
    if (!x.name) return null;

    const name = String(x.name).trim().slice(0, 80);
    if (!name) return null;
    const qty = Number(x.qty);
    const section = SECTION_LABELS[x.section] ? x.section : guessSection(name);
    return {
        name,
        qty: Number.isFinite(qty) && qty > 0 ? qty : null,
        unit: normalizeUnit(x.unit).slice(0, 24),
        section
    };
}

/** Libellé lisible : « 4 pièces de tomate », mis à l'échelle par `factor`. */
export function ingLabel(ing, factor) {
    if (!ing) return '';
    if (!ing.qty) return ing.name;
    const q = ing.qty * (factor || 1);
    if (!ing.unit) return `${formatCount(q)} ${ing.name}`;
    return `${formatQty(q, ing.unit)} ${prepDe(ing.name)}${ing.name}`;
}

/** Libellé d'une quantité seule, pour la liste de courses et le frigo. */
export function qtyLabel(qty, unit) {
    if (qty == null) return '';
    if (!unit) return formatCount(qty);
    return formatQty(qty, unit);
}
