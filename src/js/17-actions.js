/* Aujourd'hui, réglages, générateur, thème, import/export, impression, partage. */

/* ---------- Aujourd'hui ---------- */

function showTodayModal() {
    const now = new Date();
    const todayName = DAYS[(now.getDay() + 6) % 7];
    // Le « jour » est toujours dans la semaine réelle, quelle que soit la semaine affichée.
    const realWeek = state.weeks[isoDate(startOfWeek(now))] || EMPTY_WEEK;
    const entry = realWeek[todayName] || {};

    // Classes écrites en clair : jamais de nom de classe Tailwind construit dynamiquement
    const block = (emoji, label, borderClass, titleClass, prefix) => {
        const items = TYPES.map((t) => {
            const r = recipeById(entry[`${prefix}_${t}`]);
            if (!r) return '';
            const acc = (entry.acc && entry.acc[`${prefix}_${t}`]) || [];
            return `<li class="flex items-start justify-between gap-2 py-0.5">
                <span class="text-xs text-slate-200"><span class="capitalize text-slate-400">${esc(t)} :</span> <strong class="text-white">${esc(r.title)}</strong>${acc.length ? ` <span class="text-tertiary-glow">+ ${esc(acc.join(', '))}</span>` : ''}</span>
                <span class="text-[10px] text-slate-400 whitespace-nowrap">${esc(r.time)} min</span>
            </li>`;
        }).filter(Boolean).join('');
        return `
        <div class="glass-panel p-3 rounded-xl border ${borderClass}">
            <h4 class="text-xs font-bold ${titleClass} mb-1">${emoji} ${label}</h4>
            ${items ? `<ul class="flex flex-col divide-y divide-white/5">${items}</ul>` : '<p class="text-xs text-slate-400">Rien de prévu.</p>'}
        </div>`;
    };

    $('today-modal-body').innerHTML =
        `<p class="text-xs text-slate-400">${esc(todayName)} ${esc(fmtDay.format(now))}</p>` +
        block('☀️', 'MIDI', 'border-primary/20', 'text-primary', 'midi') +
        block('🌙', 'SOIR', 'border-secondary/20', 'text-secondary', 'soir');
    openModal('today-modal');
}

/* ---------- Réglages ---------- */

function saveSettings() {
    state.settings.household = clampInt($('household-size').value, 1, 20, 4);
    state.settings.banned = $('banned-ingredients').value.split('\n')
        .map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 60);
    state.settings.deductFridge = $('deduct-fridge').checked;
    saveNow();
    closeModal('settings-modal');
    renderRecipes();
    renderPlanning();
    showToast('Réglages mis à jour !');
}

function fillSettingsForm() {
    $('household-size').value = state.settings.household;
    $('banned-ingredients').value = state.settings.banned.join('\n');
    $('deduct-fridge').checked = state.settings.deductFridge !== false;

    const legacy = readLegacyV15();
    $('legacy-status').textContent = legacy
        ? `Sauvegarde détectée : « ${legacy.key} » — ${(legacy.data.recipes || []).length} recettes. Cette clé n'est jamais modifiée.`
        : 'Aucune sauvegarde v0.7–v0.15 détectée dans ce navigateur.';
}

async function importLegacy() {
    const legacy = readLegacyV15();
    if (!legacy) { showToast('Aucune donnée v0.7–v0.15 trouvée', 'error'); return; }

    const converted = normalize(convertV15(legacy.data));
    const ok = await confirmDialog(
        `Remplacer les données actuelles par « ${legacy.key} » ? ` +
        `${converted.recipes.length} recettes, ${Object.keys(converted.weeks).length} semaines, ` +
        `${converted.foodBank.length} aliments. La sauvegarde d'origine reste intacte.`,
        { confirmLabel: 'Remplacer' });
    if (!ok) return;

    state = converted;
    weekOffset = 0;
    saveNow();
    applyTheme();
    fillSettingsForm();
    closeModal('settings-modal');
    renderAll();
    showToast(`${converted.recipes.length} recettes récupérées !`);
}

/* ---------- Générateur ---------- */

function runGenerator(preference, keepExisting) {
    const pool = state.recipes.filter((r) => !isBanned(r));
    const result = pickMenu({
        recipes: pool,
        week: plan(),
        preference,
        keepExisting,
        household: state.settings.household,
        fridge: state.fridge,
        today: new Date()
    });

    if (result.error) { showToast(result.error, 'error'); return; }

    state.weeks[weekKey()] = result.week;
    saveNow();
    renderPlanning();
    showToast(`${result.placed} repas planifiés !`);
}

/** L'auto-remplissage écrase la semaine : il se confirme, comme « Effacer ». */
async function autofill() {
    const current = plan();
    const hasMeals = DAYS.some((d) => current[d] && SLOT_KEYS.some((k) => current[d][k]));
    if (hasMeals) {
        const ok = await confirmDialog(
            'Remplacer tous les repas déjà planifiés cette semaine ?',
            { confirmLabel: 'Remplacer' });
        if (!ok) return;
    }
    runGenerator('balanced', false);
}

async function clearPlanning() {
    const ok = await confirmDialog('Réinitialiser le planning de la semaine affichée ?', { confirmLabel: 'Effacer' });
    if (!ok) return;
    delete state.weeks[weekKey()];
    saveNow();
    renderPlanning();
    showToast('Planning effacé');
}

function changeWeek(delta) {
    weekOffset = Math.min(260, Math.max(-260, weekOffset + delta));
    renderPlanning();
}

function switchPeriodFilter(period) {
    activePeriodFilter = period;
    ['all', 'midi', 'soir'].forEach((p) => {
        $(`period-btn-${p}`).className = 'px-2.5 py-1 rounded-lg font-bold ' +
            (p === period ? 'bg-surface text-white' : 'text-slate-400 hover:text-white');
        $(`period-btn-${p}`).setAttribute('aria-pressed', String(p === period));
    });
    renderPlanning();
}

/* ---------- Thème ---------- */

function applyTheme() {
    const dark = state.settings.theme !== 'light';
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('light', !dark);
    $('theme-icon').innerHTML = `<use href="#i-${dark ? 'light_mode' : 'dark_mode'}"/>`;
}

function toggleTheme() {
    state.settings.theme = state.settings.theme === 'light' ? 'dark' : 'light';
    applyTheme();
    saveNow();
}

/* ---------- Import / export / réinitialisation ---------- */

function exportData() {
    state.weeks = pruneEmptyWeeks(state.weeks);
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planrepas-export-${isoDate(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); // évite la fuite mémoire
    showToast('Export généré !');
}

$('import-file').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        let parsed;
        try {
            parsed = JSON.parse(String(reader.result));
        } catch (err) {
            showToast('Fichier JSON invalide', 'error');
            return;
        }
        const ok = await confirmDialog('Remplacer toutes les données actuelles par le contenu du fichier ?',
            { confirmLabel: 'Importer' });
        if (!ok) return;
        state = normalize(parsed);
        weekOffset = 0;
        saveNow();
        applyTheme();
        fillSettingsForm();
        renderAll();
        showToast('Import réussi !');
    };
    reader.onerror = () => showToast('Lecture du fichier impossible', 'error');
    reader.readAsText(file);
    e.target.value = ''; // permet de réimporter le même fichier
});

async function resetAll() {
    const ok = await confirmDialog('Effacer définitivement toutes les données (recettes, plannings, listes) ?',
        { confirmLabel: 'Tout effacer' });
    if (!ok) return;
    state = defaultState();
    weekOffset = 0;
    saveNow();
    applyTheme();
    fillSettingsForm();
    closeModal('settings-modal');
    renderAll();
    showToast('Données réinitialisées');
}

/* ---------- Impression et partage ---------- */

/**
 * L'impression passe par une zone dédiée plutôt que par une pile de règles
 * `!important` masquant la mise en page de l'écran. Cela permet surtout
 * d'imprimer la liste de courses, ce que la v0.22 ne savait pas faire alors
 * que c'est l'usage le plus courant.
 */
function printArea(title, body) {
    $('print-area').innerHTML = `<h1>${esc(title)}</h1>${body}`;
    window.print();
}

function printPlanning() {
    const start = weekStart();
    const week = plan();
    const rows = DAYS.map((day, i) => {
        const entry = week[day] || {};
        const cell = (prefix) => TYPES.map((t) => {
            const r = recipeById(entry[`${prefix}_${t}`]);
            if (!r) return '';
            const acc = (entry.acc && entry.acc[`${prefix}_${t}`]) || [];
            return `<div><em>${esc(t)}</em> : ${esc(r.title)}${acc.length ? ` <small>+ ${esc(acc.join(', '))}</small>` : ''}</div>`;
        }).join('') || '<div class="muted">—</div>';
        return `<tr>
            <th>${esc(day)}<br><small>${esc(fmtDay.format(addDays(start, i)))}</small></th>
            <td>${cell('midi')}</td>
            <td>${cell('soir')}</td>
        </tr>`;
    }).join('');

    printArea(`Planning du ${fmtDay.format(start)} au ${fmtDay.format(addDays(start, 6))}`,
        `<table><thead><tr><th>Jour</th><th>Midi</th><th>Soir</th></tr></thead><tbody>${rows}</tbody></table>`);
}

function shoppingGroups() {
    const byCat = new Map();
    state.shoppingList.forEach((item) => {
        if (!byCat.has(item.category)) byCat.set(item.category, []);
        byCat.get(item.category).push(item);
    });
    return [...byCat.entries()].sort((a, b) =>
        sectionRank(a[1][0].section) - sectionRank(b[1][0].section) || a[0].localeCompare(b[0], 'fr'));
}

function printShoppingList() {
    if (!state.shoppingList.length) { showToast('Liste de courses vide', 'error'); return; }
    const body = shoppingGroups().map(([cat, items]) => `
        <h2>${esc(cat)}</h2>
        <ul>${items.map((i) =>
            `<li>${i.checked ? '☑' : '☐'} ${esc(i.name)} <strong>${esc(shoppingQtyLabel(i))}</strong></li>`).join('')}</ul>`).join('');
    printArea('Liste de courses', body);
}

/** Texte brut de la liste, pour le partage natif ou le presse-papiers. */
function shoppingListText() {
    return ['Liste de courses — PlanRepas']
        .concat(shoppingGroups().map(([cat, items]) =>
            `\n${cat}\n` + items.map((i) => `- ${i.name} (${shoppingQtyLabel(i)})`).join('\n')))
        .join('\n');
}

async function shareShoppingList() {
    if (!state.shoppingList.length) { showToast('Liste de courses vide', 'error'); return; }
    const text = shoppingListText();
    try {
        if (navigator.share) {
            await navigator.share({ title: 'Liste de courses', text });
            return;
        }
        await navigator.clipboard.writeText(text);
        showToast('Liste copiée dans le presse-papiers !');
    } catch (e) {
        if (e && e.name === 'AbortError') return;      // partage annulé par l'utilisateur
        showToast('Partage impossible sur cet appareil', 'error');
    }
}

/**
 * Bouton « Ajouter les recettes du catalogue publié » : complète la collection
 * locale sans rien écraser.
 */
async function loadCatalogManually() {
    let catalog;
    try {
        catalog = await fetchCatalog();
    } catch (e) {
        showToast('Catalogue indisponible (hors ligne ?)', 'error');
        return;
    }

    const added = mergeCatalog(catalog);
    if (!added.recipes && !added.foodBank) {
        showToast('Toutes les recettes du catalogue sont déjà présentes');
        return;
    }

    saveNow();
    renderRecipes();
    renderFoodBank();
    renderPlanning();
    closeModal('settings-modal');
    showToast(`${added.recipes} recettes et ${added.foodBank} aliments ajoutés`);
}
