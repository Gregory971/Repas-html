/*
 * Catalogue publié (data/seed.json) : contenu du fichier livré et
 * comportement de l'application qui le consomme.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'seed.json'), 'utf8'));

/* ==========================================================
   Le fichier livré
   ========================================================== */

test('le catalogue contient les recettes et les aliments', () => {
    assert.ok(SEED.recipes.length >= 50, `${SEED.recipes.length} recettes`);
    assert.ok(SEED.foodBank.length >= 70, `${SEED.foodBank.length} aliments`);
});

test('le catalogue ne publie aucune donnée personnelle', () => {
    for (const cle of ['settings', 'weeks', 'planning', 'shoppingList', 'fridge']) {
        assert.equal(SEED[cle], undefined, `« ${cle} » ne doit pas être publié`);
    }
    // La liste d'exclusions révélerait une allergie : elle reste sur l'appareil.
    const brut = JSON.stringify(SEED).toLowerCase();
    for (const mot of ['banned', 'crevette', 'langouste', 'ouassous']) {
        assert.ok(!brut.includes(mot), `« ${mot} » ne doit pas apparaître`);
    }
});

test('chaque recette est exploitable', () => {
    for (const r of SEED.recipes) {
        assert.ok(r.title, 'titre manquant');
        assert.ok(['entrée', 'plat', 'dessert'].includes(r.type), `type invalide : ${r.type}`);
        assert.ok(r.servings >= 1, `portions invalides pour ${r.title}`);
        assert.ok(r.ingredients.length > 0, `aucun ingrédient pour ${r.title}`);
        for (const i of r.ingredients) {
            assert.equal(typeof i, 'object', `ingrédient non structuré dans ${r.title}`);
            assert.ok(i.name, `ingrédient sans nom dans ${r.title}`);
        }
    }
});

test('les titres de recettes sont uniques', () => {
    const vus = new Set();
    for (const r of SEED.recipes) {
        const cle = r.title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        assert.ok(!vus.has(cle), `doublon : ${r.title}`);
        vus.add(cle);
    }
});

/* ==========================================================
   L'application qui le consomme
   ========================================================== */

const CATALOGUE_TEST = {
    version: 21,
    recipes: [
        {
            id: 900, title: 'Colombo de cabri', type: 'plat', time: 80, servings: 6,
            tags: [], steps: ['Mijoter'],
            ingredients: [{ name: 'cabri', qty: 1, unit: 'kg', section: 'boucherie' }]
        },
        {
            id: 901, title: 'Flan coco', type: 'dessert', time: 40, servings: 4,
            tags: [], steps: ['Cuire'], image: 'data/photos/flan-coco.jpg',
            ingredients: [{ name: 'lait de coco', qty: 40, unit: 'cl', section: 'epicerie-salee' }]
        }
    ],
    foodBank: [{ id: 902, category: 'Viande', name: 'Cabri', unit: 'g' }]
};

/** Démarre l'application avec un `fetch` simulé pour data/seed.json. */
async function boot({ storage = null, catalogue = CATALOGUE_TEST, enPanne = false } = {}) {
    const appels = [];
    const errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (e) => errors.push(e));

    const dom = new JSDOM(HTML, {
        runScripts: 'dangerously',
        url: 'https://exemple.org/',
        pretendToBeVisual: true,
        virtualConsole,
        beforeParse(window) {
            if (storage) window.localStorage.setItem('planrepas_v21', JSON.stringify(storage));
            window.fetch = (url) => {
                appels.push(String(url));
                if (enPanne) return Promise.reject(new Error('hors ligne'));
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(catalogue)
                });
            };
        }
    });

    await new Promise((r) => setTimeout(r, 250));
    const { window } = dom;
    return {
        window, document: window.document, appels, errors,
        $: (id) => window.document.getElementById(id),
        click: (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })),
        titres: () => [...window.document.querySelectorAll('#recipe-list article h3')]
            .map((h) => h.textContent.trim()),
        stored: () => JSON.parse(window.localStorage.getItem('planrepas_v21') || 'null')
    };
}

test('un appareil vierge charge le catalogue à la place du jeu de démonstration', async () => {
    const { titres, appels, stored, errors } = await boot();

    assert.deepEqual(errors.map((e) => e.message), []);
    assert.ok(appels.some((u) => u.includes('data/seed.json')), `appels : ${appels}`);
    assert.deepEqual(titres().sort(), ['Colombo de cabri', 'Flan coco']);
    assert.equal(stored().recipes.length, 2, 'le catalogue doit être persisté');
});

test('un catalogue indisponible laisse le jeu de démonstration en place', async () => {
    const { titres, errors } = await boot({ enPanne: true });

    assert.deepEqual(errors.map((e) => e.message), []);
    assert.equal(titres().length, 7, 'les 7 recettes de démonstration doivent rester');
});

test('un appareil déjà utilisé ne se fait pas écraser par le catalogue', async () => {
    const perso = {
        version: 21, weeks: {}, shoppingList: [], fridge: [], foodBank: [],
        settings: { household: 4, banned: [], theme: 'dark' },
        recipes: [{
            id: 555, title: 'Ma recette perso', type: 'plat', time: 10, calories: 100,
            servings: 4, tags: [], steps: [], image: '',
            ingredients: [{ name: 'riz', qty: 100, unit: 'g', section: 'epicerie-salee' }]
        }]
    };
    const { titres, appels, stored } = await boot({ storage: perso });

    assert.deepEqual(titres(), ['Ma recette perso']);
    assert.ok(!appels.some((u) => u.includes('data/seed.json')), 'aucun chargement automatique');
    assert.equal(stored().recipes.length, 1);
});

test('le bouton des réglages complète la collection sans créer de doublon', async () => {
    const perso = {
        version: 21, weeks: {}, shoppingList: [], fridge: [], foodBank: [],
        settings: { household: 4, banned: [], theme: 'dark' },
        recipes: [{
            id: 555, title: 'Flan coco', type: 'dessert', time: 40, calories: 400,
            servings: 4, tags: [], steps: [], image: '',
            ingredients: [{ name: 'lait de coco', qty: 40, unit: 'cl', section: 'epicerie-salee' }]
        }]
    };
    const { document, click, titres, stored, $ } = await boot({ storage: perso });

    click(document.querySelector('[data-act="modal"][data-target="settings-modal"]'));
    click(document.querySelector('[data-act="load-catalog"]'));
    await new Promise((r) => setTimeout(r, 150));

    assert.deepEqual(titres().sort(), ['Colombo de cabri', 'Flan coco'], 'une seule « Flan coco »');
    assert.equal(stored().foodBank.length, 1, 'les aliments manquants sont ajoutés');
    assert.equal($('settings-modal').hidden, true, 'la modale se referme');
});

test('la fusion donne sa photo à une recette déjà présente qui n en a pas', async () => {
    const perso = {
        version: 21, weeks: {}, shoppingList: [], fridge: [], foodBank: [],
        settings: { household: 4, banned: [], theme: 'dark' },
        recipes: [{
            id: 555, title: 'Flan coco', type: 'dessert', time: 40,
            servings: 4, tags: [], steps: [], image: '',
            ingredients: [{ name: 'lait de coco', qty: 40, unit: 'cl', section: 'epicerie-salee' }]
        }]
    };
    const { document, click, stored } = await boot({ storage: perso });

    click(document.querySelector('[data-act="modal"][data-target="settings-modal"]'));
    click(document.querySelector('[data-act="load-catalog"]'));
    await new Promise((r) => setTimeout(r, 150));

    const flan = stored().recipes.find((r) => r.title === 'Flan coco');
    assert.equal(flan.id, 555, 'la recette locale est conservée, pas remplacée');
    assert.equal(flan.image, 'data/photos/flan-coco.jpg', 'elle reçoit la photo du catalogue');
});

test('la fusion ne remplace jamais une photo existante', async () => {
    const perso = {
        version: 21, weeks: {}, shoppingList: [], fridge: [], foodBank: [],
        settings: { household: 4, banned: [], theme: 'dark' },
        recipes: [{
            id: 555, title: 'Flan coco', type: 'dessert', time: 40,
            servings: 4, tags: [], steps: [], image: 'https://exemple.org/ma-photo.jpg',
            ingredients: [{ name: 'lait de coco', qty: 40, unit: 'cl', section: 'epicerie-salee' }]
        }]
    };
    const { document, click, stored } = await boot({ storage: perso });

    click(document.querySelector('[data-act="modal"][data-target="settings-modal"]'));
    click(document.querySelector('[data-act="load-catalog"]'));
    await new Promise((r) => setTimeout(r, 150));

    const flan = stored().recipes.find((r) => r.title === 'Flan coco');
    assert.equal(flan.image, 'https://exemple.org/ma-photo.jpg', 'la photo personnelle est préservée');
});
