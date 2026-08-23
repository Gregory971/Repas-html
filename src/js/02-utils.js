/* Utilitaires transverses. Module pur : testable hors navigateur. */

import { TYPE_ART } from './01-constants.js';

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Échappe toute donnée insérée dans du HTML (attribut ou contenu). */
export function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

/** Base de résolution des URL relatives : la page en navigateur, un repli en test. */
const urlBase = () => (typeof location !== 'undefined' && location.href) || 'https://localhost/';

/** N'accepte que des URL d'image inoffensives (bloque javascript:, etc.). */
export function safeImg(url) {
    if (!url) return '';
    try {
        const u = new URL(String(url), urlBase());
        if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
        if (u.protocol === 'data:' && /^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(u.href)) return u.href;
    } catch (e) { /* URL invalide */ }
    return '';
}

export function hashString(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
    return Math.abs(h);
}

/**
 * Clé de rapprochement d'un libellé d'ingrédient : sans accent, sans pluriel,
 * en minuscules. « Tomates » et « tomate » désignent le même produit.
 */
export function nameKey(s) {
    return String(s == null ? '' : s)
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/).filter(Boolean)
        .map((w) => (w.length > 3 ? w.replace(/[sx]$/, '') : w))
        .join(' ');
}

/** Mots qui font d'un groupe nominal un produit distinct, et non une variante. */
const CONNECTORS = new Set(['de', 'd', 'du', 'des', 'a', 'au', 'aux', 'en', 'la', 'le', 'les', 'l']);

/**
 * Deux libellés désignent-ils le même produit ?
 *
 * « poulet » et « poulet fermier » : oui, `fermier` n'est qu'une qualification.
 * « pomme » et « pomme de terre »  : non, le connecteur `de` introduit un
 * produit différent. Un simple `includes` confondrait les deux et ferait
 * disparaître les pommes de la liste de courses parce qu'il reste des pommes
 * de terre au frigo.
 */
export function namesMatch(a, b) {
    const wa = nameKey(a).split(' ').filter(Boolean);
    const wb = nameKey(b).split(' ').filter(Boolean);
    if (!wa.length || !wb.length) return false;
    if (wa.join(' ') === wb.join(' ')) return true;

    const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
    const longSet = new Set(long);
    if (!short.every((w) => longSet.has(w))) return false;

    const shortSet = new Set(short);
    return !long.filter((w) => !shortSet.has(w)).some((w) => CONNECTORS.has(w));
}

/**
 * Vignette générée localement à partir du titre et du type de la recette.
 * Déterministe, hors-ligne, et jamais « à côté du sujet » comme une photo
 * de banque d'images choisie au hasard.
 */
export function recipeArt(recipe) {
    const accent = TYPE_ART[recipe.type] || TYPE_ART.plat;
    const hue = hashString(recipe.title || '') % 360;
    // Le découpage se fait par point de code, pas par unité UTF-16 : un titre
    // commençant par un emoji donnait sinon un demi-caractère, et
    // encodeURIComponent levait une URIError qui cassait tout le rendu.
    // Seules lettres et chiffres sont retenus, un emoji ne fait pas une initiale.
    const initials = String(recipe.title || '')
        .split(/[\s'’\-]+/)
        .map((mot) => [...mot][0] || '')
        .filter((c) => /[\p{L}\p{N}]/u.test(c))
        .slice(0, 2).join('').toUpperCase() || '?';
    const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
        `<stop offset="0" stop-color="hsl(${hue},36%,24%)"/>` +
        `<stop offset="1" stop-color="hsl(${(hue + 45) % 360},40%,14%)"/>` +
        '</linearGradient></defs>' +
        '<rect width="240" height="160" fill="url(#g)"/>' +
        `<circle cx="120" cy="80" r="48" fill="none" stroke="${accent}" stroke-opacity="0.5" stroke-width="3"/>` +
        `<circle cx="120" cy="80" r="34" fill="${accent}" fill-opacity="0.16"/>` +
        `<text x="120" y="92" font-family="system-ui,Segoe UI,sans-serif" font-size="30" font-weight="700" ` +
        `text-anchor="middle" fill="${accent}">${esc(initials)}</text></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/**
 * Les vignettes sont recalculées à chaque rendu, deux fois par carte (src et
 * repli). Le cache évite de ré-encoder ~500 caractères par recette à chaque
 * frappe dans la recherche.
 */
const artCache = new Map();
export function recipeArtCached(recipe) {
    const key = `${recipe.title}|${recipe.type}`;
    let art = artCache.get(key);
    if (!art) {
        art = recipeArt(recipe);
        if (artCache.size > 200) artCache.clear();
        artCache.set(key, art);
    }
    return art;
}

/** URL d'affichage : photo personnalisée si valide, sinon vignette générée. */
export const imgFor = (recipe) => safeImg(recipe.image) || recipeArtCached(recipe);

export const clampInt = (v, min, max, fallback) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function debounce(fn, delay) {
    let t = null;
    const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
    wrapped.flush = (...args) => { clearTimeout(t); fn(...args); };
    return wrapped;
}

/* ---------- Dates ---------- */

export const startOfWeek = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // lundi = 0
    return x;
};
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fmtDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** Nombre de jours entiers entre aujourd'hui et une date ISO ; null si illisible. */
export function daysUntil(iso, today) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const ref = today ? new Date(today) : new Date();
    ref.setHours(0, 0, 0, 0);
    const target = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(target.getTime())) return null;
    return Math.round((target - ref) / 86400000);
}

/* ---------- Identifiants ---------- */

let idCounter = 0;
/**
 * Identifiant unique et croissant. Un simple `Date.now()` combiné à un tirage
 * aléatoire collisionne quand plusieurs éléments naissent dans la même
 * milliseconde (le jeu de démonstration en crée onze d'affilée).
 */
export function generateId() {
    idCounter = (idCounter + 1) % 1000;
    return Date.now() * 1000 + idCounter;
}

/** « https://www.750g.com/... » -> « 750g.com », pour créditer la source. */
export function sourceLabel(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
        return 'la source';
    }
}
