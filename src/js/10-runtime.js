/*
 * Noyau d'exécution : état vivant, persistance, semaine affichée.
 * Ce module touche au DOM et au stockage : il n'est pas importé par les tests.
 */

const $ = (id) => document.getElementById(id);

/** Icône du sprite local (voir src/icons.svg). */
function icon(name, cls) {
    return `<svg class="ico${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

/* ---------- Chargement ---------- */

let legacyNotice = null;

function loadState() {
    let raw = null;
    try {
        raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (e) { /* données corrompues -> défauts */ }

    if (!raw) {
        // Reprise éventuelle des clés séparées de la v0.20
        try {
            const legacy = {};
            let found = false;
            Object.keys(LEGACY_KEYS).forEach((k) => {
                const v = localStorage.getItem(LEGACY_KEYS[k]);
                if (v != null) { legacy[k] = JSON.parse(v); found = true; }
            });
            if (found) {
                raw = {
                    recipes: legacy.recipes, planning: legacy.planning, shoppingList: legacy.shopping,
                    fridge: legacy.fridge, foodBank: legacy.foodbank, settings: legacy.settings
                };
            }
        } catch (e) { /* ignore */ }
    }

    let result = normalize(raw);

    // Reprise des versions v0.7 → v0.15 : au premier lancement, ou tant que
    // l'utilisateur n'a rien modifié dans le jeu de démonstration.
    if (!raw || isPristineDemo(result)) {
        const legacy = readLegacyV15();
        if (legacy) {
            const converted = normalize(convertV15(legacy.data));
            if (converted.recipes.length) {
                legacyNotice = `${converted.recipes.length} recettes récupérées depuis « ${legacy.key} »`;
                result = converted;
            }
        }
    }
    return result;
}

let state = loadState();
let weekOffset = 0;
let activeCategoryFilter = 'all';
let activeTab = 'shopping';
let activePeriodFilter = 'all';
let searchQuery = '';
let foodBankQuery = '';
let accTarget = null;       // { day, slotKey }
let slotTarget = null;      // créneau visé par le sélecteur de recette
let placingRecipeId = null; // mode placement tactile
let selectedDayIndex = (new Date().getDay() + 6) % 7;
let mobileView = 'planning';

/* ---------- Persistance ---------- */

function persist(notify) {
    try {
        // Les semaines vides matérialisées par la navigation ne sont pas des données.
        state.weeks = pruneEmptyWeeks(state.weeks);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        if (notify) showToast('Sauvegardé avec succès !');
    } catch (e) {
        showToast('Sauvegarde impossible (stockage plein ou bloqué)', 'error');
    }
}
const saveData = debounce(() => persist(false), 500);
const saveNow = (notify) => { saveData.flush(); persist(notify); };

/* ---------- Semaine affichée ---------- */

const weekStart = () => addDays(startOfWeek(new Date()), weekOffset * 7);
const weekKey = () => isoDate(weekStart());

/**
 * Planning de la semaine affichée, en LECTURE SEULE.
 *
 * La v0.22 créait ici la semaine si elle manquait. Comme le rendu appelle
 * cette fonction quarante-deux fois, chaque passage sur une semaine vide
 * était gravé dans le stockage puis dans l'export. Toute écriture passe
 * désormais par `ensureWeek()`.
 */
const EMPTY_WEEK = Object.freeze(emptyWeek());
function plan() {
    return state.weeks[weekKey()] || EMPTY_WEEK;
}

/** Planning de la semaine affichée, créé à la volée pour être modifié. */
function ensureWeek() {
    const key = weekKey();
    if (!state.weeks[key]) state.weeks[key] = emptyWeek();
    return state.weeks[key];
}

function dayEntry(day) {
    const p = ensureWeek();
    if (!p[day]) { p[day] = { portions: {}, acc: {} }; SLOT_KEYS.forEach((k) => { p[day][k] = null; }); }
    if (!p[day].portions) p[day].portions = {};
    if (!p[day].acc) p[day].acc = {};
    return p[day];
}

const recipeById = (id) => state.recipes.find((r) => r.id === Number(id));

function updateWeekLabels() {
    const start = weekStart();
    const label = `${fmtDay.format(start)} – ${fmtDay.format(addDays(start, 6))}`;
    const rel = weekOffset === 0 ? 'Cette semaine'
        : (weekOffset === 1 ? 'Semaine prochaine'
            : (weekOffset === -1 ? 'Semaine dernière' : `Semaine ${weekOffset > 0 ? '+' : ''}${weekOffset}`));
    $('week-display-title').textContent = label;
    $('current-week-label').textContent = rel;
}
