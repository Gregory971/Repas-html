/* Colonne de droite : liste de courses, frigo, banque d'aliments. */

function switchTab(tab) {
    activeTab = tab;
    ['shopping', 'fridge', 'foodbank'].forEach((t) => {
        const active = t === tab;
        const btn = $(`tab-${t}-btn`);
        btn.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ' +
            (active ? 'bg-surface text-white shadow-sm' : 'text-slate-400 hover:text-white');
        btn.setAttribute('aria-selected', String(active));
        $(`tab-${t}-content`).hidden = !active;
    });
    $('right-btn-label').textContent =
        { shopping: 'Ajouter un ingrédient', fridge: 'Ajouter au frigo', foodbank: 'Créer un aliment' }[tab];
}

/* ---------- Liste de courses ---------- */

/** Libellé de quantité d'une ligne de courses, « ×3 » si aucune quantité chiffrée. */
function shoppingQtyLabel(item) {
    if (item.qty != null) return qtyLabel(item.qty, item.unit);
    return item.count > 1 ? `×${item.count}` : '1';
}

function renderShoppingList() {
    const container = $('shopping-list-categories');
    if (!state.shoppingList.length) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Liste vide. Utilisez « Auto-Générer ».</p>';
        return;
    }

    const byCat = new Map();
    state.shoppingList.forEach((item) => {
        if (!byCat.has(item.category)) byCat.set(item.category, []);
        byCat.get(item.category).push(item);
    });

    // Les rayons suivent le parcours du magasin, pas l'ordre de saisie.
    const groups = [...byCat.entries()].sort((a, b) =>
        sectionRank(a[1][0].section) - sectionRank(b[1][0].section) || a[0].localeCompare(b[0], 'fr'));

    container.innerHTML = groups.map(([cat, items]) => `
        <div class="flex flex-col gap-1.5">
            <h4 class="text-[11px] font-bold text-primary flex items-center gap-1 border-b border-white/5 pb-1">
                ${icon('shopping_basket', 'text-[13px]')} ${esc(cat)}
            </h4>
            <div class="flex flex-col gap-1">
                ${items.map((item) => `
                    <div class="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-all group">
                        <button type="button" data-act="toggle-item" data-id="${item.id}" class="flex items-center gap-2 flex-1 min-w-0 text-left">
                            <span class="w-4 h-4 rounded border shrink-0 ${item.checked ? 'bg-primary border-primary' : 'border-slate-500'} flex items-center justify-center">
                                ${item.checked ? icon('check', 'text-[12px] text-canvas') : ''}
                            </span>
                            <span class="text-xs truncate ${item.checked ? 'line-through text-slate-500' : 'text-slate-200'}">${esc(item.name)}</span>
                            ${item.inFridge ? '<span class="text-[10px] shrink-0" title="Déjà partiellement au frigo">🧊</span>' : ''}
                        </button>
                        <span class="flex items-center gap-1 shrink-0">
                            <span class="text-[11px] text-slate-400 font-bold">${esc(shoppingQtyLabel(item))}</span>
                            <button type="button" data-act="del-item" data-id="${item.id}" class="opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-500 hover:text-danger transition-all" aria-label="Supprimer ${esc(item.name)}">
                                ${icon('close', 'text-[14px]')}
                            </button>
                        </span>
                    </div>`).join('')}
            </div>
        </div>`).join('');
}

/**
 * Ajoute une ligne, ou cumule la quantité si le produit est déjà présent.
 * La v0.22 sortait ici sans enregistrer : la quantité modifiée était perdue
 * au rechargement.
 */
function addShoppingItem({ category, section, name, qty, unit, auto }) {
    const existing = state.shoppingList.find((i) => namesMatch(i.name, name));
    if (existing) {
        if (qty != null && existing.qty != null) {
            const a = toBase(existing.qty, existing.unit);
            const b = toBase(qty, unit);
            if (a.unit === b.unit) { existing.qty = Math.round((a.qty + b.qty) * 100) / 100; existing.unit = a.unit; }
            else existing.count = (existing.count || 1) + 1;
        } else if (qty != null) {
            existing.qty = qty;
            existing.unit = unit || '';
        } else {
            existing.count = (existing.count || 1) + 1;
        }
        existing.checked = false;
        saveData();
        return existing;
    }

    const finalSection = SECTION_LABELS[section] ? section : guessSection(name);
    const item = {
        id: generateId(),
        category: String(category || SECTION_LABELS[finalSection] || 'Divers').slice(0, 40),
        section: finalSection,
        name: String(name).trim().slice(0, 80),
        qty: qty == null ? null : qty,
        unit: String(unit || '').slice(0, 24),
        count: 1,
        checked: false,
        auto: !!auto
    };
    state.shoppingList.push(item);
    saveData();
    return item;
}

function generateShoppingFromPlanning() {
    const result = buildShoppingList(plan(), recipeById, {
        household: state.settings.household,
        existing: state.shoppingList,
        fridge: state.fridge,
        deduct: state.settings.deductFridge,
        today: new Date()
    });

    if (!result.added && !result.covered) {
        showToast('Aucun repas planifié cette semaine', 'error');
        return;
    }

    state.shoppingList = result.list;
    saveData();
    renderShoppingList();

    showToast(result.covered
        ? `${result.added} ingrédients ajoutés — ${result.covered} déjà au frigo`
        : `${result.added} ingrédients ajoutés à la liste !`);
}

/* ---------- Frigo ---------- */

function fridgeStatus(expiry) {
    const days = daysUntil(expiry);
    if (days == null) return { key: 'ok', label: 'Date inconnue', days: 99 };
    if (days < 0) return { key: 'danger', label: days === -1 ? 'Expiré (hier)' : `Expiré depuis ${-days} jours`, days };
    if (days === 0) return { key: 'danger', label: "Expire aujourd'hui", days };
    if (days === 1) return { key: 'warning', label: 'Expire demain', days };
    if (days <= 3) return { key: 'warning', label: `Expire dans ${days} jours`, days };
    return { key: 'ok', label: `Expire dans ${days} jours`, days };
}

function renderFridge() {
    const container = $('fridge-inventory-list');
    if (!state.fridge.length) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Frigo vide.</p>';
        return;
    }
    const borders = {
        danger: 'border-l-4 border-l-danger bg-danger/5',
        warning: 'border-l-4 border-l-warning bg-warning/5',
        ok: 'border-l-4 border-l-primary bg-primary/5'
    };
    const sorted = [...state.fridge].sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)));
    container.innerHTML = sorted.map((item) => {
        const st = fridgeStatus(item.expiry);
        const qty = qtyLabel(item.qty, item.unit);
        return `
        <div class="glass-panel p-2.5 rounded-lg flex items-center justify-between gap-2 ${borders[st.key]}">
            <div class="min-w-0">
                <h5 class="text-xs font-bold text-white truncate">${esc(item.name)}</h5>
                <span class="text-[10px] text-slate-400">${qty ? esc(qty) + ' • ' : ''}${esc(st.label)}</span>
            </div>
            <button type="button" data-act="del-fridge" data-id="${item.id}" class="text-slate-400 hover:text-danger shrink-0" aria-label="Supprimer ${esc(item.name)}">
                ${icon('delete', 'text-sm')}
            </button>
        </div>`;
    }).join('');
}

/* ---------- Banque d'aliments ---------- */

function renderFoodBank() {
    const container = $('foodbank-list');
    const list = state.foodBank.filter((f) =>
        !foodBankQuery || (f.name + ' ' + f.category).toLowerCase().includes(foodBankQuery));

    if (!list.length) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Aucun aliment trouvé.</p>';
        return;
    }
    container.innerHTML = list.map((item) => `
        <div class="glass-panel p-2 rounded-lg flex items-center justify-between gap-2 group">
            <div class="min-w-0">
                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-primary border border-white/5 mr-1">${esc(item.category)}</span>
                <span class="text-xs font-bold text-white">${esc(item.name)}</span>
            </div>
            <span class="flex items-center gap-1 shrink-0">
                <button type="button" data-act="bank-to-shopping" data-id="${item.id}" class="p-1 rounded hover:bg-primary/20 text-primary" title="Ajouter aux courses" aria-label="Ajouter ${esc(item.name)} aux courses">
                    ${icon('add_shopping_cart', 'text-sm')}
                </button>
                <button type="button" data-act="del-bank" data-id="${item.id}" class="p-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-500 hover:text-danger transition-all" aria-label="Supprimer ${esc(item.name)}">
                    ${icon('delete', 'text-[14px]')}
                </button>
            </span>
        </div>`).join('');
}

/* ---------- Délégation colonne de droite ---------- */

$('right-column').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = Number(btn.dataset.id);

    switch (btn.dataset.act) {
        case 'tab': switchTab(btn.dataset.tab); break;
        case 'toggle-item': {
            const item = state.shoppingList.find((i) => i.id === id);
            if (item) { item.checked = !item.checked; saveData(); keepFocus(renderShoppingList); }
            break;
        }
        case 'del-item':
            state.shoppingList = state.shoppingList.filter((i) => i.id !== id);
            saveData(); renderShoppingList();
            break;
        case 'del-fridge':
            state.fridge = state.fridge.filter((i) => i.id !== id);
            saveData(); renderFridge(); renderRecipes();
            break;
        case 'del-bank':
            state.foodBank = state.foodBank.filter((i) => i.id !== id);
            saveData(); renderFoodBank();
            break;
        case 'bank-to-shopping': {
            const food = state.foodBank.find((f) => f.id === id);
            if (food) {
                addShoppingItem({ category: food.category, name: food.name, qty: 1, unit: food.unit });
                renderShoppingList();
                showToast(`${food.name} ajouté aux courses !`);
            }
            break;
        }
        case 'gen-shopping': generateShoppingFromPlanning(); break;
        case 'uncheck-all':
            state.shoppingList.forEach((i) => { i.checked = false; });
            saveData(); renderShoppingList();
            break;
        case 'share-shopping': shareShoppingList(); break;
        case 'print-shopping': printShoppingList(); break;
        case 'right-add': openItemModal(); break;
    }
});
