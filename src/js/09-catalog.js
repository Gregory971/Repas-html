/*
 * Catalogue publié (data/seed.json) : recettes et aliments livrés avec le site.
 *
 * Il sert de point de départ sur un appareil vierge, pour ne pas avoir à
 * réimporter un JSON à la main sur chaque téléphone ou navigateur. Il ne
 * contient aucun réglage personnel, aucun planning, aucune liste de courses :
 * ces données-là restent sur l'appareil.
 */

const CATALOG_URL = 'data/seed.json';

/** Clé de comparaison tolérante aux accents, à la casse et à la ponctuation. */
function catalogKey(title) {
    return String(title || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

async function fetchCatalog() {
    const res = await fetch(CATALOG_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = normalize(await res.json());
    if (!parsed.recipes.length) throw new Error('catalogue vide');
    return parsed;
}

/**
 * Ajoute les recettes et aliments absents, sans jamais toucher au planning,
 * aux courses, au frigo ni aux réglages.
 * @returns {{recipes: number, foodBank: number, photos: number}} éléments ajoutés
 */
/**
 * Ajoute les recettes absentes de la collection. Une recette déjà présente
 * n'est jamais remplacée : elle reçoit seulement la photo qui lui manque.
 *
 * @returns {{recipes: number, photos: number}} éléments ajoutés
 */
function mergeRecipes(liste) {
    const connues = new Map(state.recipes.map((r) => [catalogKey(r.title), r]));
    let recipes = 0;
    let photos = 0;

    liste.forEach((r) => {
        const key = catalogKey(r.title);
        const existante = connues.get(key);
        if (existante) {
            if (r.image && !existante.image) { existante.image = r.image; photos++; }
            return;
        }
        connues.set(key, r);
        state.recipes.push(Object.assign({}, r, { id: generateId() }));
        recipes++;
    });

    return { recipes, photos };
}

function mergeCatalog(catalog) {
    const knownFoods = new Set(state.foodBank.map((f) => catalogKey(f.name)));
    let foodBank = 0;

    const { recipes, photos } = mergeRecipes(catalog.recipes);

    catalog.foodBank.forEach((f) => {
        const key = catalogKey(f.name);
        if (knownFoods.has(key)) return;
        knownFoods.add(key);
        state.foodBank.push(Object.assign({}, f, { id: generateId() }));
        foodBank++;
    });

    return { recipes, foodBank, photos };
}

/**
 * Remplace le jeu de démonstration par le catalogue, au premier lancement.
 * @returns {number} nombre de recettes chargées, 0 si rien n'a été fait
 */
async function seedFromCatalog() {
    const catalog = await fetchCatalog();
    state.recipes = catalog.recipes;
    state.foodBank = catalog.foodBank;
    saveNow();
    return state.recipes.length;
}
