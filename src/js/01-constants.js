/* Constantes du domaine. Module pur : aucune dépendance, aucun accès au DOM. */

export const STORAGE_KEY = 'planrepas_v21';
export const STATE_VERSION = 23;

/** Clés séparées de la v0.20, lues une seule fois à la reprise. */
export const LEGACY_KEYS = {
    recipes: 'planrepas_recipes', planning: 'planrepas_planning', shopping: 'planrepas_shopping',
    fridge: 'planrepas_fridge', foodbank: 'planrepas_foodbank', settings: 'planrepas_settings'
};

export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const SLOT_KEYS = ['midi_entrée', 'midi_plat', 'midi_dessert', 'soir_entrée', 'soir_plat', 'soir_dessert'];
export const SLOT_LABELS = {
    'midi_entrée': 'Entrée', 'midi_plat': 'Plat', 'midi_dessert': 'Dessert',
    'soir_entrée': 'Entrée', 'soir_plat': 'Plat', 'soir_dessert': 'Dessert'
};
export const TYPES = ['entrée', 'plat', 'dessert'];

export const TYPE_CLASSES = {
    'entrée': 'text-primary bg-primary/10 border-primary/20',
    'plat': 'text-secondary bg-secondary/10 border-secondary/20',
    'dessert': 'text-tertiary bg-tertiary/10 border-tertiary/20'
};
export const TYPE_ART = { 'entrée': '#10b981', 'plat': '#3b82f6', 'dessert': '#a855f7' };

export const ACCOMPAGNEMENTS = [
    { id: 'riz-blanc', name: 'Riz blanc', time: '20 min' },
    { id: 'riz-complet', name: 'Riz complet', time: '35 min' },
    { id: 'pates-spaghetti', name: 'Spaghetti', time: '12 min' },
    { id: 'puree', name: 'Purée maison', time: '25 min' },
    { id: 'patate-douce', name: 'Patate douce rôtie', time: '25 min' },
    { id: 'quinoa', name: 'Quinoa', time: '15 min' },
    { id: 'lentilles', name: 'Lentilles vertes', time: '25 min' },
    { id: 'frites', name: 'Frites fraîches', time: '20 min' },
    { id: 'salade', name: 'Salade verte', time: '5 min' }
];

/* ---------- Rayons ---------- */

export const SECTION_LABELS = {
    'fruits-legumes': 'Fruits & Légumes',
    'frais': 'Produits frais',
    'boucherie': 'Boucherie / Poissonnerie',
    'boulangerie': 'Boulangerie',
    'epicerie-salee': 'Épicerie salée',
    'epicerie-sucree': 'Épicerie sucrée',
    'surgeles': 'Surgelés',
    'boissons': 'Boissons'
};

/** Ordre de parcours d'un magasin : la liste de courses suit ce rangement. */
export const SECTION_ORDER = [
    'fruits-legumes', 'boucherie', 'frais', 'boulangerie',
    'epicerie-salee', 'epicerie-sucree', 'surgeles', 'boissons'
];

export const INGREDIENT_SECTIONS = [
    ['fruits-legumes', ['tomate', 'oignon', 'ail', 'carotte', 'pomme de terre', 'courgette', 'aubergine', 'poivron', 'champignon', 'salade', 'roquette', 'épinard', 'brocoli', 'haricot vert', 'asperge', 'potiron', 'potimarron', 'citron', 'avocat', 'pomme', 'banane', 'figue', 'cerise', 'fraise', 'patate douce', 'piment', 'ananas', 'mangue', 'papaye', 'persil', 'basilic', 'coriandre', 'christophine', 'giraumon', 'concombre', 'poireau', 'navet', 'échalote', 'gingembre']],
    ['frais', ['lait', 'yaourt', 'fromage', 'beurre', 'crème', 'œuf', 'oeuf', 'mascarpone', 'mozzarella', 'burrata', 'parmesan', 'pâte brisée', 'pâte feuilletée', 'pâte à pizza']],
    ['boucherie', ['poulet', 'bœuf', 'boeuf', 'porc', 'veau', 'agneau', 'canard', 'dinde', 'saumon', 'thon', 'cabillaud', 'crevette', 'morue', 'lardon', 'jambon', 'saucisse', 'steak', 'poisson', 'pavé']],
    ['boulangerie', ['pain', 'baguette', 'galette', 'crouton', 'brioche']],
    ['epicerie-sucree', ['sucre', 'chocolat', 'miel', 'confiture', 'vanille', 'farine', 'levure']],
    ['boissons', ['vin', 'bière', 'jus', 'eau ']],
    ['surgeles', ['surgelé', 'glace']]
];

/* ---------- Unités ---------- */

export const UNIT_ALIASES = {
    'cuillères à soupe': 'cuillère à soupe', 'cuillere à soupe': 'cuillère à soupe',
    'cuilleres a soupe': 'cuillère à soupe', 'cuillere a soupe': 'cuillère à soupe',
    'c.à.s': 'cuillère à soupe', 'cas': 'cuillère à soupe', 'càs': 'cuillère à soupe',
    'cuillères à café': 'cuillère à café', 'cuillere à café': 'cuillère à café',
    'cuilleres a cafe': 'cuillère à café', 'cuillere a cafe': 'cuillère à café',
    'c.à.c': 'cuillère à café', 'cac': 'cuillère à café', 'càc': 'cuillère à café',
    'pièces': 'pièce', 'pieces': 'pièce', 'piece': 'pièce',
    'pce': 'pièce', 'pces': 'pièce', 'pc': 'pièce',
    'tranches': 'tranche', 'boîtes': 'boîte', 'boites': 'boîte', 'boite': 'boîte',
    'sachets': 'sachet', 'gousses': 'gousse', 'branches': 'branche',
    'feuilles': 'feuille', 'pots': 'pot', 'bocaux': 'bocal', 'bottes': 'botte',
    'pincées': 'pincée', 'pincees': 'pincée', 'pincee': 'pincée', 'verres': 'verre'
};

/** Conversion vers une unité de base, pour agréger 200 g + 0,8 kg. */
export const UNIT_BASE = {
    kg: ['g', 1000], g: ['g', 1], mg: ['g', 0.001],
    l: ['ml', 1000], dl: ['ml', 100], cl: ['ml', 10], ml: ['ml', 1]
};

export const UNIT_PATTERN = 'kg|g|mg|l|dl|cl|ml|cuill[eè]res?\\s*[àa]\\s*soupe|cuill[eè]res?\\s*[àa]\\s*caf[eé]|c\\.?[àa]\\.?s|c\\.?[àa]\\.?c|pi[eè]ces?|pces?|tranches?|bo[iî]tes?|sachets?|gousses?|branches?|feuilles?|bottes?|pots?|bocaux|bocal|pinc[eé]es?|verres?';

/** Fractions unicode acceptées dans une saisie d'ingrédient. */
export const VULGAR_FRACTIONS = {
    '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
    '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
    '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
};

/* ---------- Nutrition ---------- */


/** Un produit du frigo est « urgent » à partir de ce nombre de jours restants. */
export const URGENT_DAYS = 3;
