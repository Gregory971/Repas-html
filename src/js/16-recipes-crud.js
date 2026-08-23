/* Recettes : détail, création, édition, suppression. Modale d'ajout d'élément. */

function showRecipeDetail(id) {
    const recipe = recipeById(id);
    if (!recipe) return;

    const tags = (recipe.tags || []).map((t) =>
        `<span class="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300">${esc(t)}</span>`).join('');

    // Quantités mises à l'échelle du foyer à partir des portions de la recette
    const people = state.settings.household;
    const factor = people / (recipe.servings || 4);

    $('recipe-detail-content').innerHTML = `
        <div class="flex items-start justify-between border-b border-white/10 pb-3 gap-2">
            <h3 class="font-h1 text-lg font-bold text-white min-w-0 break-words" id="recipe-detail-title">${esc(recipe.title)}</h3>
            <div class="flex items-center gap-2 shrink-0">
                <button type="button" data-act="edit-recipe" data-id="${recipe.id}" class="text-xs px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white font-semibold flex items-center gap-1 border border-white/5">
                    ${icon('edit', 'text-xs')} Modifier
                </button>
                <button type="button" data-act="delete-recipe" data-id="${recipe.id}" class="text-xs px-2.5 py-1 rounded-lg bg-danger/10 hover:bg-danger/20 text-danger font-semibold flex items-center gap-1 border border-danger/20">
                    ${icon('delete', 'text-xs')} Supprimer
                </button>
                <button type="button" data-act="close-modal" class="text-slate-400 hover:text-white" aria-label="Fermer">${icon('close')}</button>
            </div>
        </div>
        <img src="${esc(imgFor(recipe))}" data-fallback="${esc(recipeArtCached(recipe))}" loading="lazy" decoding="async" width="480" height="160" class="w-full h-40 object-cover rounded-xl border border-white/10 bg-surface-lowest" alt="">
        ${tags ? `<div class="flex flex-wrap gap-1">${tags}</div>` : ''}
        <div class="flex items-center justify-around bg-surface-lowest p-2 rounded-xl border border-white/5 text-center">
            <div><span class="text-[10px] text-slate-400 block font-bold">TEMPS</span><span class="text-xs font-bold text-white">${esc(recipe.time)} min</span></div>
            <div><span class="text-[10px] text-slate-400 block font-bold">PORTIONS</span><span class="text-xs font-bold text-white">${esc(recipe.servings)}</span></div>
            <div><span class="text-[10px] text-slate-400 block font-bold">TYPE</span><span class="text-xs font-bold text-primary capitalize">${esc(recipe.type)}</span></div>
        </div>
        <div>
            <h4 class="text-xs font-bold text-white mb-1">Ingrédients <span class="font-normal text-slate-400">(pour ${people} personne${people > 1 ? 's' : ''})</span> :</h4>
            <ul class="list-disc list-inside text-xs text-slate-300 flex flex-col gap-1">
                ${recipe.ingredients.length
                    ? recipe.ingredients.map((i) => `<li>${esc(ingLabel(i, factor))}</li>`).join('')
                    : '<li class="list-none text-slate-400">Non renseignés</li>'}
            </ul>
        </div>
        <div>
            <h4 class="text-xs font-bold text-white mb-1">Préparation :</h4>
            <ol class="list-decimal list-inside text-xs text-slate-300 flex flex-col gap-1">
                ${(recipe.steps.length ? recipe.steps : ['Non renseignée']).map((s) => `<li>${esc(s)}</li>`).join('')}
            </ol>
        </div>`;
    $('recipe-detail-modal').setAttribute('aria-labelledby', 'recipe-detail-title');
    openModal('recipe-detail-modal');
}

function openRecipeForm(recipe) {
    const form = $('recipe-form');
    form.reset();
    setPhotoPreview('');
    $('edit-recipe-id').value = recipe ? recipe.id : '';
    $('recipe-modal-title').textContent = recipe ? 'Modifier la recette' : 'Nouvelle recette';
    if (recipe) {
        $('recipe-name').value = recipe.title;
        $('recipe-type').value = recipe.type;
        $('recipe-time').value = recipe.time;
        $('recipe-servings').value = recipe.servings || 4;
        $('recipe-ingredients').value = (recipe.ingredients || []).map((i) => ingLabel(i)).join('\n');
        $('recipe-steps').value = (recipe.steps || []).join('\n');
        $('recipe-tags').value = (recipe.tags || []).join(', ');
        $('recipe-image').value = recipe.image || '';
        setPhotoPreview(safeImg(recipe.image));
    } else {
        $('recipe-time').value = 25;
        $('recipe-servings').value = state.settings.household;
        $('recipe-type').value = 'plat';
    }
    openModal('add-recipe-modal');
}

$('recipe-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('recipe-name').value.trim();
    if (!title) return;

    const data = {
        title: title.slice(0, 120),
        type: TYPES.includes($('recipe-type').value) ? $('recipe-type').value : 'plat',
        time: clampInt($('recipe-time').value, 0, 600, 20),
        servings: clampInt($('recipe-servings').value, 1, 50, 4),
        ingredients: $('recipe-ingredients').value.split('\n').map(parseIngLine).filter(Boolean).slice(0, 60),
        steps: $('recipe-steps').value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 60),
        tags: $('recipe-tags').value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12),
        image: $('recipe-image').value.trim()
    };

    const editId = Number($('edit-recipe-id').value);
    const existing = editId ? recipeById(editId) : null;

    if (existing) {
        Object.assign(existing, data);
    } else {
        if (!data.tags.length) data.tags = ['Fait Maison'];
        state.recipes.push(Object.assign({ id: generateId() }, data));
    }

    saveData();
    closeModal('add-recipe-modal');
    renderRecipes();
    renderPlanning();
    showToast('Recette enregistrée avec succès !');
});

async function deleteRecipe(id) {
    const recipe = recipeById(id);
    if (!recipe) return;
    const ok = await confirmDialog(
        `Supprimer « ${recipe.title} » ? Elle sera retirée de tous les plannings.`,
        { confirmLabel: 'Supprimer' });
    if (!ok) return;

    state.recipes = state.recipes.filter((r) => r.id !== recipe.id);
    Object.values(state.weeks).forEach((week) => {
        DAYS.forEach((day) => {
            const entry = week[day];
            if (!entry) return;
            SLOT_KEYS.forEach((k) => {
                if (entry[k] === recipe.id) {
                    entry[k] = null;
                    if (entry.portions) delete entry.portions[k];
                    if (entry.acc) delete entry.acc[k];
                }
            });
        });
    });

    saveNow();
    closeModal('recipe-detail-modal');
    renderRecipes();
    renderPlanning();
    showToast('Recette supprimée');
}

$('recipe-detail-content').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'edit-recipe') {
        closeModal('recipe-detail-modal');
        openRecipeForm(recipeById(btn.dataset.id));
    } else if (btn.dataset.act === 'delete-recipe') {
        deleteRecipe(btn.dataset.id);
    }
});

/* ---------- Modale d'ajout d'élément (courses / frigo / aliments) ---------- */

function openItemModal() {
    const titles = { shopping: 'Ajouter aux courses', fridge: 'Ajouter au frigo', foodbank: 'Nouvel aliment' };
    $('item-modal-title').textContent = titles[activeTab];
    $('item-form').reset();
    $('item-cat-wrap').hidden = activeTab === 'fridge';
    $('item-qty-wrap').hidden = activeTab === 'foodbank';
    $('item-expiry-wrap').hidden = activeTab !== 'fridge';
    if (activeTab === 'fridge') $('item-expiry').value = isoDate(addDays(new Date(), 3));
    openModal('item-modal');
}

$('item-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('item-name').value.trim();
    if (!name) return;

    // La quantité est saisie librement (« 500 g », « 2 »), puis structurée.
    const parsed = parseQty($('item-qty').value.trim());

    if (activeTab === 'shopping') {
        addShoppingItem({
            category: $('item-cat').value.trim() || undefined,
            name, qty: parsed.qty, unit: parsed.unit
        });
        renderShoppingList();
    } else if (activeTab === 'fridge') {
        const expiry = $('item-expiry').value || isoDate(addDays(new Date(), 3));
        state.fridge.push({
            id: generateId(), name: name.slice(0, 80),
            qty: parsed.qty, unit: parsed.unit, expiry
        });
        saveData();
        renderFridge();
        renderRecipes();          // le badge « périme bientôt » peut changer
    } else {
        state.foodBank.push({
            id: generateId(), category: $('item-cat').value.trim() || 'Autre',
            name: name.slice(0, 80), unit: 'pce'
        });
        saveData();
        renderFoodBank();
    }
    closeModal('item-modal');
    showToast('Élément ajouté !');
});
