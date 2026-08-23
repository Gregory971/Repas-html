/*
 * v0.24 : retrait de l'indicateur calorique, panneaux repliables,
 * photo de recette.
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

async function boot() {
    const errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (e) => errors.push(e));

    const dom = new JSDOM(HTML, {
        runScripts: 'dangerously',
        url: 'https://exemple.org/',
        pretendToBeVisual: true,
        virtualConsole
    });
    await new Promise((r) => setTimeout(r, 150));
    const { window } = dom;
    return {
        window, document: window.document, errors,
        $: (id) => window.document.getElementById(id),
        click: (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })),
        stored: () => JSON.parse(window.localStorage.getItem('planrepas_v21') || 'null')
    };
}

/* ==========================================================
   Indicateur calorique retiré
   ========================================================== */

test('plus aucune mention de calories dans la page', async () => {
    const { document } = await boot();
    assert.equal(document.getElementById('recipe-calories'), null, 'le champ du formulaire a disparu');
    assert.ok(!/kcal/i.test(document.body.textContent), 'aucun « kcal » affiché');
});

test('les recettes ne portent plus de champ calories', async () => {
    const { document, click, stored } = await boot();
    click(document.querySelector('[data-act="save"]'));
    for (const r of stored().recipes) {
        assert.equal(r.calories, undefined, `${r.title} porte encore des calories`);
    }
    for (const r of SEED.recipes) {
        assert.equal(r.calories, undefined, `${r.title} en porte dans le catalogue`);
    }
});

test('le score reste calculé sans la dimension calorique', async () => {
    const { document, click, $ } = await boot();
    click(document.querySelector('[data-act="autofill"]'));
    await new Promise((r) => setTimeout(r, 10));

    const score = Number($('nutri-score-pct').textContent);
    assert.ok(score > 0 && score <= 100, `score attendu dans 1..100, obtenu ${score}`);
    assert.match($('nutri-score-desc').textContent, /plats/);
    assert.match($('nutri-score-desc').textContent, /jours couverts/);
});

/* ==========================================================
   Panneaux repliables
   ========================================================== */

test('les deux panneaux sont dépliés au départ', async () => {
    const { document } = await boot();
    assert.equal(document.body.dataset.panelLeft, 'open');
    assert.equal(document.body.dataset.panelRight, 'open');
});

test('replier un panneau le mémorise et se rouvre depuis le rail', async () => {
    const { document, click, stored, $ } = await boot();

    const replier = document.querySelector('#left-column .panel-body [data-act="panel"][data-panel="left"]');
    assert.ok(replier, 'le bouton de repli existe');
    click(replier);
    assert.equal(document.body.dataset.panelLeft, 'closed');
    assert.equal(replier.getAttribute('aria-expanded'), 'false');

    click(document.querySelector('[data-act="save"]'));
    assert.equal(stored().settings.panels.left, false, 'l état est enregistré');

    const rail = document.querySelector('#left-column > .panel-rail');
    assert.ok(rail, 'le rail existe');
    click(rail);
    assert.equal(document.body.dataset.panelLeft, 'open', 'le rail rouvre le panneau');
});

test('les deux panneaux se replient indépendamment', async () => {
    const { document, click } = await boot();
    click(document.querySelector('#right-column .panel-body [data-act="panel"][data-panel="right"]'));
    assert.equal(document.body.dataset.panelRight, 'closed');
    assert.equal(document.body.dataset.panelLeft, 'open', 'la colonne gauche n est pas affectée');
});

test('un état replié enregistré est restitué au démarrage', async () => {
    const { document, click, window } = await boot();
    click(document.querySelector('#left-column .panel-body [data-act="panel"][data-panel="left"]'));
    click(document.querySelector('[data-act="save"]'));
    const sauvegarde = window.localStorage.getItem('planrepas_v21');

    const errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (e) => errors.push(e));
    const dom2 = new JSDOM(HTML, {
        runScripts: 'dangerously', url: 'https://exemple.org/', pretendToBeVisual: true, virtualConsole,
        beforeParse(w) { w.localStorage.setItem('planrepas_v21', sauvegarde); }
    });
    await new Promise((r) => setTimeout(r, 150));
    assert.deepEqual(errors.map((e) => e.message), []);
    assert.equal(dom2.window.document.body.dataset.panelLeft, 'closed');
});

/* ==========================================================
   Photo de recette
   ========================================================== */

test('le formulaire propose de choisir une photo', async () => {
    const { document, $ } = await boot();
    assert.ok(document.querySelector('[data-act="pick-photo"]'), 'bouton de choix');
    assert.equal($('recipe-photo-file').type, 'file');
    assert.equal($('recipe-photo-file').accept, 'image/*');
    assert.equal($('recipe-photo-preview').hidden, true, 'aperçu masqué tant qu il n y a rien');
});

test('ouvrir une recette illustrée affiche son aperçu, en créer une le vide', async () => {
    const { document, click, $ } = await boot();

    // Une recette de démonstration reçoit une photo, puis on l édite
    const carte = document.querySelector('#recipe-list article');
    click(carte);
    click(document.querySelector('[data-act="edit-recipe"]'));
    $('recipe-image').value = 'https://exemple.org/photo.jpg';

    click(document.querySelector('#add-recipe-modal [data-act="close-modal"]'));
    click(document.querySelector('[data-act="new-recipe"]'));
    assert.equal($('recipe-image').value, '', 'le formulaire neuf est vide');
    assert.equal($('recipe-photo-preview').hidden, true, 'et sans aperçu');
});

test('retirer la photo vide le champ et l aperçu', async () => {
    const { document, click, $ } = await boot();
    click(document.querySelector('[data-act="new-recipe"]'));

    $('recipe-image').value = 'https://exemple.org/photo.jpg';
    $('recipe-photo-preview').hidden = false;
    $('recipe-photo-clear').hidden = false;

    click(document.querySelector('[data-act="drop-photo"]'));
    assert.equal($('recipe-image').value, '');
    assert.equal($('recipe-photo-preview').hidden, true);
    assert.equal($('recipe-photo-clear').hidden, true);
});

/* ==========================================================
   Photos du catalogue
   ========================================================== */

test('chaque photo référencée par le catalogue existe sur le disque', () => {
    const illustrees = SEED.recipes.filter((r) => r.image);
    assert.ok(illustrees.length >= 30, `${illustrees.length} recettes illustrées`);
    for (const r of illustrees) {
        assert.match(r.image, /^data\/photos\/[a-z0-9-]+\.jpg$/, `chemin inattendu : ${r.image}`);
        assert.ok(fs.existsSync(path.join(ROOT, r.image)), `fichier manquant : ${r.image}`);
    }
});

test('chaque photo publiée est créditée', () => {
    const credits = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'photo-credits.json'), 'utf8'));
    const credites = new Set(credits.photos.map((p) => p.plat));
    for (const r of SEED.recipes.filter((x) => x.image)) {
        assert.ok(credites.has(r.title), `crédit manquant pour ${r.title}`);
    }
    for (const p of credits.photos) {
        assert.ok(p.licence, `licence manquante pour ${p.plat}`);
        assert.ok(p.source, `source manquante pour ${p.plat}`);
    }
});

test('aucun fichier photo orphelin', () => {
    const utilisees = new Set(SEED.recipes.filter((r) => r.image).map((r) => path.basename(r.image)));
    for (const f of fs.readdirSync(path.join(ROOT, 'data', 'photos'))) {
        assert.ok(utilisees.has(f), `photo non référencée : ${f}`);
    }
});
