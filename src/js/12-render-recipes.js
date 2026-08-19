/* Rendu de la colonne des recettes et filtres associés. */

const ingredientNames = (recipe) => (recipe.ingredients || []).map((i) => i.name).join(' ');

function isBanned(recipe) {
    const banned = state.settings.banned;
    if (!banned.length) return false;
    const hay = (recipe.title + ' ' + ingredientNames(recipe)).toLowerCase();
    return banned.some((b) => hay.includes(b));
}

function matchesSearch(recipe) {
    if (!searchQuery) return true;
    const hay = (recipe.title + ' ' + (recipe.tags || []).join(' ') + ' ' + ingredientNames(recipe)).toLowerCase();
    return hay.includes(searchQuery);
}

function visibleRecipes() {
    return state.recipes.filter((r) => {
        if (!matchesSearch(r)) return false;
        if (activeCategoryFilter === 'all') return true;
        if (activeCategoryFilter === 'healthy') return (r.tags || []).some((t) => t.toLowerCase() === 'healthy');
        return r.type === activeCategoryFilter;
    });
}

/** Recettes qui consomment un produit proche de la péremption. */
function urgentRecipeIds() {
    const urgent = urgentFridgeNames(state.fridge);
    if (!urgent.size) return new Set();
    return new Set(state.recipes.filter((r) => urgencyScore(r, urgent) > 0).map((r) => r.id));
}

function renderRecipes() {
    const container = $('recipe-list');
    const filtered = visibleRecipes();
    const urgentIds = urgentRecipeIds();
    $('recipe-count-badge').textContent = `(${filtered.length})`;

    if (!filtered.length) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Aucune recette ne correspond.</p>';
        return;
    }

    container.innerHTML = filtered.map((recipe) => {
        const banned = isBanned(recipe);
        const urgent = urgentIds.has(recipe.id);
        const typeClass = TYPE_CLASSES[recipe.type] || TYPE_CLASSES.plat;
        return `
        <article class="glass-panel rounded-xl p-3 flex flex-col gap-2 glass-card-hover relative group cursor-pointer"
                 draggable="true" data-recipe-id="${recipe.id}">
            <div class="flex gap-3 items-center">
                <img src="${esc(imgFor(recipe))}" data-fallback="${esc(recipeArtCached(recipe))}" loading="lazy" decoding="async"
                     width="64" height="64" class="h-16 w-16 rounded-lg object-cover shrink-0 bg-surface-lowest" alt="">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between mb-1 gap-1">
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${typeClass} capitalize inline-block">${esc(recipe.type)}</span>
                        <span class="flex items-center gap-1">
                            ${urgent ? '<span class="text-xs" title="Utilise un produit qui périme bientôt">⏳</span>' : ''}
                            ${banned ? '<span class="text-xs" title="Contient un ingrédient exclu">🚫</span>' : ''}
                            <button type="button" data-act="place" class="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded text-slate-400 hover:text-primary transition-all" title="Placer dans le planning" aria-label="Placer ${esc(recipe.title)} dans le planning">
                                ${icon('add_task', 'text-[15px]')}
                            </button>
                        </span>
                    </div>
                    <h3 class="text-xs font-bold text-white truncate" title="${esc(recipe.title)}">${esc(recipe.title)}</h3>
                    <div class="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                        <span class="flex items-center gap-0.5">${icon('schedule', 'text-[13px]')}${esc(recipe.time)} min</span>
                        <span aria-hidden="true">•</span>
                        <span>${esc(recipe.calories)} kcal</span>
                    </div>
                </div>
            </div>
        </article>`;
    }).join('');
}

function setCategoryFilter(cat) {
    activeCategoryFilter = cat;
    document.querySelectorAll('#category-chips .chip-btn').forEach((btn) => {
        const active = btn.dataset.filter === cat;
        btn.className = 'chip-btn px-3 py-1 rounded-full text-xs transition-all ' +
            (active ? 'bg-primary text-canvas font-bold' : 'bg-white/5 text-slate-300 hover:bg-white/10 font-medium border border-white/5');
        btn.setAttribute('aria-pressed', String(active));
    });
    renderRecipes();
}
