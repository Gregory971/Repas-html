/*
 * Tests d'intégration sur la page construite (index.html), dans jsdom.
 *
 * Ils vérifient le comportement réel de l'application assemblée, en
 * particulier les défauts corrigés en v0.23 : chacun de ces tests échoue
 * sur la v0.22.
 *
 *     npm run check     (construit puis teste)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/** Démarre l'application et rend la fenêtre, le document et les erreurs. */
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
    await new Promise((r) => setTimeout(r, 120));
    const { window } = dom;
    return {
        dom, window, document: window.document, errors,
        $: (id) => window.document.getElementById(id),
        click: (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })),
        stored: () => JSON.parse(window.localStorage.getItem('planrepas_v21') || 'null')
    };
}

const SAVE_BTN = '[data-act="save"]';

/* ==========================================================
   Démarrage
   ========================================================== */

test('la page démarre sans erreur et rend ses trois colonnes', async () => {
    const { document, errors } = await boot();
    assert.deepEqual(errors.map((e) => e.message), []);
    assert.equal(document.querySelectorAll('#recipe-list article').length, 7);
    assert.equal(document.querySelectorAll('#planning-grid [data-day-index]').length, 7);
    assert.equal(document.querySelectorAll('#planning-grid [data-slot]').length, 42);
    assert.ok(document.querySelectorAll('#shopping-list-categories [data-act="toggle-item"]').length > 0);
});

/* ==========================================================
   Correctif : plan() ne matérialise plus les semaines vides
   ========================================================== */

test('naviguer entre les semaines n écrit aucune semaine vide', async () => {
    const { document, click, stored, $ } = await boot();

    const next = document.querySelector('[data-act="week"][data-delta="1"]');
    const prev = document.querySelector('[data-act="week"][data-delta="-1"]');
    for (let i = 0; i < 6; i++) click(next);
    for (let i = 0; i < 12; i++) click(prev);
    click(document.querySelector(SAVE_BTN));

    const weeks = stored().weeks;
    assert.deepEqual(Object.keys(weeks), [],
        `dix-huit navigations ont gravé ${Object.keys(weeks).length} semaine(s) vide(s)`);
});

test('seule une semaine réellement remplie est conservée', async () => {
    const { document, click, stored } = await boot();

    // On pose un repas sur la semaine affichée, puis on se promène.
    const slot = document.querySelector('#planning-grid button[data-slot]');
    click(slot);
    click(document.querySelector('#slot-picker-list [data-pick-recipe]'));

    const next = document.querySelector('[data-act="week"][data-delta="1"]');
    for (let i = 0; i < 4; i++) click(next);
    click(document.querySelector(SAVE_BTN));

    const weeks = stored().weeks;
    assert.equal(Object.keys(weeks).length, 1, 'exactement la semaine remplie');
});

test('l export ne contient pas de semaine vide', async () => {
    const { window, document, click, stored } = await boot();
    const next = document.querySelector('[data-act="week"][data-delta="1"]');
    for (let i = 0; i < 3; i++) click(next);

    let exported = null;
    window.Blob = class { constructor(parts) { exported = JSON.parse(parts[0]); } };
    window.URL.createObjectURL = () => 'blob:x';
    window.URL.revokeObjectURL = () => {};
    click(document.querySelector('[data-act="export"]'));

    assert.ok(exported, 'export produit');
    assert.deepEqual(Object.keys(exported.weeks), []);
});

/* ==========================================================
   Correctif : accessibilité des créneaux
   ========================================================== */

test('un créneau libre est un bouton, donc atteignable au clavier', async () => {
    const { document } = await boot();
    const slot = document.querySelector('#planning-grid [data-slot]');
    assert.equal(slot.tagName, 'BUTTON');
    assert.match(slot.getAttribute('aria-label'), /créneau libre/);
});

test('cliquer un créneau libre ouvre le choix de recette', async () => {
    const { document, click, $ } = await boot();
    const slot = document.querySelector('#planning-grid button[data-slot][data-slotkey="midi_plat"]');
    click(slot);
    assert.equal($('slot-picker-modal').hidden, false);
    // Seules les recettes du bon type sont proposées
    const titles = [...document.querySelectorAll('#slot-picker-list [data-pick-recipe]')]
        .map((b) => b.textContent.trim());
    assert.ok(titles.length >= 3, 'des plats sont proposés');
});

test('le choix d une recette la pose dans le créneau visé', async () => {
    const { document, click, stored } = await boot();
    const slot = document.querySelector('#planning-grid button[data-slot][data-slotkey="soir_plat"]');
    const day = slot.dataset.day;
    click(slot);
    const pick = document.querySelector('#slot-picker-list [data-pick-recipe]');
    const id = Number(pick.dataset.pickRecipe);
    click(pick);
    click(document.querySelector(SAVE_BTN));

    const week = Object.values(stored().weeks)[0];
    assert.equal(week[day]['soir_plat'], id);
});

test('modifier les portions conserve le focus sur le bouton', async () => {
    const { document, window, click } = await boot();
    // On pose d'abord un repas
    const slot = document.querySelector('#planning-grid button[data-slot][data-slotkey="midi_plat"]');
    click(slot);
    click(document.querySelector('#slot-picker-list [data-pick-recipe]'));

    const plus = document.querySelector('#planning-grid [data-act="portion"][data-delta="1"]');
    plus.focus();
    click(plus);

    const active = window.document.activeElement;
    assert.equal(active.dataset.act, 'portion');
    assert.equal(active.dataset.delta, '1');
});

/* ==========================================================
   Correctif : addShoppingItem enregistre
   ========================================================== */

test('ajouter un produit déjà présent cumule la quantité ET l enregistre', async () => {
    const { document, click, stored, $ } = await boot();

    // « Blanc de poulet » de la banque d'aliments -> courses, deux fois.
    click($('tab-foodbank-btn'));
    const row = [...document.querySelectorAll('#foodbank-list > div')]
        .find((d) => /poulet/i.test(d.textContent));
    assert.ok(row, 'la banque contient bien un produit à base de poulet');
    const add = row.querySelector('[data-act="bank-to-shopping"]');
    click(add);
    click(add);
    click(document.querySelector(SAVE_BTN));

    const list = stored().shoppingList;
    const matches = list.filter((i) => /poulet/i.test(i.name));
    assert.equal(matches.length, 1, 'une seule ligne pour le même produit');
    assert.equal(matches[0].qty, 2, 'la quantité cumulée est bien persistée');
});

/* ==========================================================
   Correctif : l auto-remplissage demande confirmation
   ========================================================== */

test('Auto-Remplir sur une semaine vide ne demande rien', async () => {
    const { document, click, $ } = await boot();
    click(document.querySelector('[data-act="autofill"]'));
    await new Promise((r) => setTimeout(r, 10));
    assert.equal($('confirm-modal').hidden, true);
    assert.ok(document.querySelectorAll('#planning-grid [data-act="remove-meal"]').length > 0);
});

test('Auto-Remplir sur une semaine remplie demande confirmation et respecte le refus', async () => {
    const { document, click, $ } = await boot();

    const slot = document.querySelector('#planning-grid button[data-slot][data-slotkey="midi_plat"]');
    const day = slot.dataset.day;
    click(slot);
    click(document.querySelector('#slot-picker-list [data-pick-recipe]'));
    const before = document.querySelectorAll('#planning-grid [data-act="remove-meal"]').length;

    click(document.querySelector('[data-act="autofill"]'));
    await new Promise((r) => setTimeout(r, 10));
    assert.equal($('confirm-modal').hidden, false, 'la confirmation est demandée');

    click(document.querySelector('[data-act="confirm-cancel"]'));
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(document.querySelectorAll('#planning-grid [data-act="remove-meal"]').length, before,
        'le refus laisse le planning intact');
});

/* ==========================================================
   Liste de courses : déduction du frigo
   ========================================================== */

test('la génération déduit le contenu du frigo', async () => {
    const { document, click, stored, $ } = await boot();

    // Le jeu de démonstration contient 800 g de poulet au frigo (péremption J+3)
    // et le Colombo en réclame 800 g pour 4 portions.
    const slot = document.querySelector('#planning-grid button[data-slot][data-slotkey="midi_plat"]');
    click(slot);
    const colombo = [...document.querySelectorAll('#slot-picker-list [data-pick-recipe]')]
        .find((b) => /Colombo/.test(b.textContent));
    assert.ok(colombo, 'le Colombo est proposé');
    click(colombo);

    click($('tab-shopping-btn'));
    click(document.querySelector('[data-act="gen-shopping"]'));
    click(document.querySelector(SAVE_BTN));

    const auto = stored().shoppingList.filter((i) => i.auto);
    assert.ok(auto.length > 0, 'des lignes ont été générées');
    assert.equal(auto.find((i) => /poulet/i.test(i.name)), undefined,
        'le poulet du frigo couvre le besoin : aucune ligne de courses');
    assert.ok(auto.find((i) => /pomme/i.test(i.name)), 'les pommes de terre restent à acheter');
});

/* ==========================================================
   Autonomie hors ligne et sécurité
   ========================================================== */

test('aucune police d icônes distante n est chargée', async () => {
    assert.equal(/Material\+Symbols/.test(HTML), false, 'la police Material Symbols a disparu');
    assert.equal(/material-symbols-outlined/.test(HTML), false, 'plus aucune ligature d icône');
    assert.ok(HTML.includes('id="icon-sprite"'), 'le sprite local est en place');
});

test('chaque référence d icône pointe vers un symbole défini', async () => {
    const { document } = await boot();
    const defined = new Set([...document.querySelectorAll('#icon-sprite symbol')].map((s) => s.id));
    assert.ok(defined.size >= 30, `${defined.size} symboles définis`);

    const used = new Set();
    for (const m of HTML.matchAll(/href="#(i-[a-z_]+)"/g)) used.add(m[1]);
    for (const m of HTML.matchAll(/#i-\$\{[^}]*\}/g)) used.add('dynamique');
    used.delete('dynamique');

    const missing = [...used].filter((id) => !defined.has(id));
    assert.deepEqual(missing, [], `icônes référencées sans définition : ${missing.join(', ')}`);
});

test('la page déclare une CSP qui scelle ses scripts par empreinte', async () => {
    const meta = HTML.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
    assert.ok(meta, 'la CSP est présente');
    const policy = meta[1];
    assert.match(policy, /default-src 'none'/);
    assert.match(policy, /script-src 'sha256-[^']+'/);
    assert.equal(/script-src[^;]*unsafe-inline/.test(policy), false,
        'les scripts ne dépendent pas de unsafe-inline');
    assert.match(policy, /connect-src 'self'/);
});

test('la CSP laisse passer une photo de recette collée par l utilisateur', async () => {
    // Le formulaire propose un champ « Image (URL) » : une CSP en
    // `img-src 'self' data:` le rendrait inopérant sans le dire.
    assert.ok(/id="recipe-image"/.test(HTML), 'le champ URL d image existe');
    const policy = HTML.match(/content="([^"]*img-src[^"]+)"/)[1];
    assert.match(policy, /img-src[^;]*https:/);
});

test('les empreintes de la CSP correspondent aux scripts réellement présents', async () => {
    const crypto = await import('node:crypto');
    const policy = HTML.match(/content="([^"]*script-src[^"]+)"/)[1];
    for (const m of HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
        const hash = crypto.createHash('sha256').update(m[1], 'utf8').digest('base64');
        assert.ok(policy.includes(`'sha256-${hash}'`), 'empreinte de script absente de la CSP');
    }
});

/* ==========================================================
   Impression et partage
   ========================================================== */

test('la liste de courses est imprimable', async () => {
    const { document, click, $ } = await boot();
    let printed = false;
    document.defaultView.print = () => { printed = true; };

    click($('tab-shopping-btn'));
    click(document.querySelector('[data-act="print-shopping"]'));

    assert.ok(printed, 'window.print a été appelé');
    const area = $('print-area');
    assert.match(area.innerHTML, /Liste de courses/);
    assert.ok(area.querySelectorAll('li').length > 0, 'la zone d impression contient des lignes');
});

test('le planning est imprimable sous forme de tableau', async () => {
    const { document, click, $ } = await boot();
    let printed = false;
    document.defaultView.print = () => { printed = true; };

    click(document.querySelector('[data-act="autofill"]'));
    await new Promise((r) => setTimeout(r, 10));
    click(document.querySelector('[data-act="print"]'));

    assert.ok(printed);
    assert.equal($('print-area').querySelectorAll('tbody tr').length, 7, 'sept jours');
});

/* ==========================================================
   Modales
   ========================================================== */

test('ouvrir une modale neutralise l arrière-plan', async () => {
    const { document, click, $ } = await boot();
    click(document.querySelector('[data-act="modal"][data-target="settings-modal"]'));
    assert.equal($('settings-modal').hidden, false);
    assert.equal(document.querySelector('main').inert, true, 'le fond est inerte');

    click($('settings-modal').querySelector('[data-act="close-modal"]'));
    assert.equal(document.querySelector('main').inert, false);
});

test('Échap ferme la modale ouverte', async () => {
    const { document, window, click, $ } = await boot();
    click(document.querySelector('[data-act="modal"][data-target="ai-modal"]'));
    assert.equal($('ai-modal').hidden, false);

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal($('ai-modal').hidden, true);
});

test('toutes les modales sont nommées pour les lecteurs d écran', async () => {
    const { document } = await boot();
    document.querySelectorAll('.modal').forEach((m) => {
        const labelled = m.getAttribute('aria-labelledby');
        if (m.id === 'recipe-detail-modal') return;   // nommée à l'ouverture, titre dynamique
        assert.ok(labelled, `${m.id} n'a pas d'aria-labelledby`);
        assert.ok(document.getElementById(labelled), `${m.id} cible un identifiant inexistant`);
    });
});

/* ==========================================================
   Score d'équilibre
   ========================================================== */

test('le score affiché est un score, pas un taux de remplissage', async () => {
    const { document, click, $ } = await boot();
    assert.equal($('nutri-score-pct').textContent, '0');
    assert.match($('nutri-score-desc').textContent, /Aucun repas/);

    click(document.querySelector('[data-act="autofill"]'));
    await new Promise((r) => setTimeout(r, 10));

    const score = Number($('nutri-score-pct').textContent);
    assert.ok(score > 0 && score <= 100, `score attendu dans 1..100, obtenu ${score}`);
    assert.match($('nutri-score-desc').textContent, /kcal\/jour/);
    assert.ok($('nutri-score-advice').textContent.length > 0, 'un conseil est affiché');
});
