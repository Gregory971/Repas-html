/* Actions sur le planning : pose, retrait, portions, accompagnements, glisser-déposer. */

function setMeal(day, slotKey, recipeId) {
    const recipe = recipeById(recipeId);
    if (!recipe) return;
    const entry = dayEntry(day);
    entry[slotKey] = recipe.id;
    if (!entry.portions[slotKey]) entry.portions[slotKey] = state.settings.household;
    saveData();
    renderPlanning();
}

function removeMeal(day, slotKey) {
    const entry = dayEntry(day);
    entry[slotKey] = null;
    delete entry.portions[slotKey];
    delete entry.acc[slotKey];
    saveData();
    keepFocus(renderPlanning);
}

function updatePortion(day, slotKey, delta) {
    const entry = dayEntry(day);
    if (!entry[slotKey]) return;
    const current = entry.portions[slotKey] || state.settings.household;
    entry.portions[slotKey] = Math.min(50, Math.max(1, current + delta));
    saveData();
    keepFocus(renderPlanning);
}

function removeAcc(day, slotKey, index) {
    const entry = dayEntry(day);
    const list = entry.acc[slotKey];
    if (!Array.isArray(list)) return;
    list.splice(index, 1);
    if (!list.length) delete entry.acc[slotKey];
    saveData();
    keepFocus(renderPlanning);
}

/* ---------- Accompagnements ---------- */

function renderAccPicker() {
    $('acc-picker-list').innerHTML = ACCOMPAGNEMENTS.map((acc) => `
        <button type="button" data-acc="${esc(acc.name)}" class="p-2 rounded-xl glass-panel hover:bg-tertiary/20 hover:border-tertiary/40 flex items-center justify-between text-left transition-all">
            <span class="text-xs font-bold text-white">${esc(acc.name)}</span>
            <span class="text-[10px] text-slate-400">${esc(acc.time)}</span>
        </button>`).join('');
}

$('acc-picker-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-acc]');
    if (!btn || !accTarget) return;
    const entry = dayEntry(accTarget.day);
    const key = accTarget.slotKey;
    if (!entry.acc[key]) entry.acc[key] = [];
    if (entry.acc[key].length >= 8) { showToast('8 accompagnements maximum', 'error'); return; }
    entry.acc[key].push(btn.dataset.acc);
    accTarget = null;
    saveData();
    closeModal('acc-modal');
    renderPlanning();
});

/* ---------- Sélecteur de recette pour un créneau ---------- */

/**
 * Un créneau vide n'ouvrait rien en v0.22 : il n'était cliquable qu'en mode
 * placement, ce que rien n'indiquait. Il propose désormais les recettes du
 * type attendu.
 */
function openSlotPicker(day, slotKey) {
    slotTarget = { day, slotKey };
    const type = slotKey.split('_')[1];
    const urgent = urgentFridgeNames(state.fridge);

    const candidates = state.recipes
        .filter((r) => r.type === type)
        .map((r) => ({ r, score: urgencyScore(r, urgent), banned: isBanned(r) }))
        .sort((a, b) => b.score - a.score || a.r.title.localeCompare(b.r.title, 'fr'));

    $('slot-picker-title').textContent = `${SLOT_LABELS[slotKey]} — ${day}`;
    $('slot-picker-list').innerHTML = candidates.length
        ? candidates.map(({ r, score, banned }) => `
            <button type="button" data-pick-recipe="${r.id}" class="p-2 rounded-xl glass-panel hover:bg-primary/15 hover:border-primary/40 flex items-center gap-2 text-left transition-all">
                <img src="${esc(imgFor(r))}" data-fallback="${esc(recipeArtCached(r))}" width="40" height="40" loading="lazy" class="h-10 w-10 rounded-lg object-cover shrink-0 bg-surface-lowest" alt="">
                <span class="min-w-0 flex-1">
                    <span class="block text-xs font-bold text-white truncate">${esc(r.title)}</span>
                    <span class="block text-[10px] text-slate-400">${esc(r.time)} min • ${esc(r.calories)} kcal</span>
                </span>
                ${score ? '<span class="text-xs shrink-0" title="Utilise un produit qui périme bientôt">⏳</span>' : ''}
                ${banned ? '<span class="text-xs shrink-0" title="Contient un ingrédient exclu">🚫</span>' : ''}
            </button>`).join('')
        : `<p class="text-xs text-slate-400 text-center py-6">Aucune recette de type « ${esc(type)} ».</p>`;

    openModal('slot-picker-modal');
}

$('slot-picker-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pick-recipe]');
    if (!btn || !slotTarget) return;
    const { day, slotKey } = slotTarget;
    slotTarget = null;
    closeModal('slot-picker-modal');
    setMeal(day, slotKey, btn.dataset.pickRecipe);
    showToast('Repas placé !');
});

/* ---------- Délégation sur la grille ---------- */

const grid = $('planning-grid');

function handleSlotActivation(slot, actionEl) {
    const act = actionEl ? actionEl.dataset.act : null;
    const day = slot.dataset.day;
    const slotKey = slot.dataset.slotkey;

    if (act === 'remove-meal') { removeMeal(day, slotKey); return; }
    if (act === 'portion') { updatePortion(day, slotKey, Number(actionEl.dataset.delta)); return; }
    if (act === 'remove-acc') { removeAcc(day, slotKey, Number(actionEl.dataset.index)); return; }
    if (act === 'open-acc') { accTarget = { day, slotKey }; openModal('acc-modal'); return; }

    if (placingRecipeId !== null) {
        setMeal(day, slotKey, placingRecipeId);
        showToast('Repas placé !');
        cancelPlacing();
        return;
    }

    // Créneau libre cliqué hors mode placement : on propose des recettes.
    if (!plan()[day] || !plan()[day][slotKey]) openSlotPicker(day, slotKey);
}

grid.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-act]');
    if (actionEl && grid.contains(actionEl) && actionEl.dataset.act === 'detail') {
        showRecipeDetail(actionEl.dataset.recipeId);
        return;
    }
    const slot = e.target.closest('[data-slot]');
    if (!slot) return;
    handleSlotActivation(slot, actionEl && grid.contains(actionEl) ? actionEl : null);
});

// Un créneau occupé n'est pas un bouton (il en contient) : on lui donne
// l'activation au clavier que le navigateur ne fournit pas.
grid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const slot = e.target.closest('[data-slot]');
    if (!slot || slot !== e.target || slot.tagName === 'BUTTON') return;
    e.preventDefault();
    handleSlotActivation(slot, null);
});

/* ---------- Glisser-déposer (souris) ---------- */

let dragRecipeId = null;

$('recipe-list').addEventListener('dragstart', (e) => {
    const card = e.target.closest('[data-recipe-id]');
    if (!card) return;
    dragRecipeId = Number(card.dataset.recipeId);
    e.dataTransfer.effectAllowed = 'copy';
    try { e.dataTransfer.setData('text/plain', String(dragRecipeId)); } catch (err) { /* Safari */ }
});
$('recipe-list').addEventListener('dragend', () => { dragRecipeId = null; });

grid.addEventListener('dragover', (e) => {
    const slot = e.target.closest('[data-slot]');
    if (!slot) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!slot.classList.contains('drag-over')) {
        grid.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
        slot.classList.add('drag-over');
    }
});
grid.addEventListener('dragleave', (e) => {
    const slot = e.target.closest('[data-slot]');
    if (slot && !slot.contains(e.relatedTarget)) slot.classList.remove('drag-over');
});
grid.addEventListener('drop', (e) => {
    const slot = e.target.closest('[data-slot]');
    if (!slot) return;
    e.preventDefault();
    slot.classList.remove('drag-over');
    let id = dragRecipeId;
    if (!id) { id = Number(e.dataTransfer.getData('text/plain')); }
    if (Number.isFinite(id) && id) setMeal(slot.dataset.day, slot.dataset.slotkey, id);
    dragRecipeId = null;
});

/* ---------- Mode placement (tactile / clavier) ---------- */

/** Rend les créneaux occupés atteignables au clavier pendant un placement. */
function markSlotsReachable(on) {
    grid.querySelectorAll('[data-slot]').forEach((slot) => {
        if (slot.tagName === 'BUTTON') return;          // déjà focusable
        slot.tabIndex = on ? 0 : -1;
    });
}

function startPlacing(recipeId) {
    const recipe = recipeById(recipeId);
    if (!recipe) return;
    placingRecipeId = recipe.id;
    document.body.classList.add('placing');
    $('placing-label').textContent = `« ${recipe.title} » → choisissez un créneau`;
    $('placing-bar').hidden = false;
    markSlotsReachable(true);
    const first = grid.querySelector('[data-slot]');
    if (first) first.focus();
}

function cancelPlacing() {
    placingRecipeId = null;
    document.body.classList.remove('placing');
    $('placing-bar').hidden = true;
    markSlotsReachable(false);
}

$('placing-bar').addEventListener('click', (e) => {
    if (e.target.closest('[data-act="cancel-place"]')) cancelPlacing();
});

$('recipe-list').addEventListener('click', (e) => {
    const card = e.target.closest('[data-recipe-id]');
    if (!card) return;
    if (e.target.closest('[data-act="place"]')) { startPlacing(card.dataset.recipeId); return; }
    showRecipeDetail(card.dataset.recipeId);
});

$('day-chips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-day-index]');
    if (btn) selectDay(Number(btn.dataset.dayIndex));
});
