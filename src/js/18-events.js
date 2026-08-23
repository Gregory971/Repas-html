/* Délégation globale : en-tête, barre d'outils du planning, modales. */

/**
 * Actions traitées ici. Les conteneurs qui ont leur propre délégation
 * (grille, colonne de droite, détail de recette, liste de recettes) exposent
 * d'autres verbes : cette liste explicite remplace la cascade de `contains()`
 * de la v0.22, qui était illisible et fragile.
 */
const GLOBAL_ACTS = new Set([
    'modal', 'close-modal', 'today', 'save', 'export', 'import', 'theme',
    'new-recipe', 'week', 'week-today', 'period', 'autofill', 'print',
    'clear', 'view', 'apply-update', 'save-settings', 'import-legacy', 'load-catalog',
    'reset-all', 'run-ai', 'panel', 'pick-photo', 'drop-photo'
]);

document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || !GLOBAL_ACTS.has(btn.dataset.act)) return;

    switch (btn.dataset.act) {
        case 'modal': toggleModal(btn.dataset.target); break;
        case 'close-modal': {
            const modal = btn.closest('.modal');
            closeModal(modal ? modal.id : undefined);
            break;
        }
        case 'today': showTodayModal(); break;
        case 'save': saveNow(true); break;
        case 'export': exportData(); break;
        case 'import': $('import-file').click(); break;
        case 'theme': toggleTheme(); break;
        case 'new-recipe': openRecipeForm(null); break;
        case 'week': changeWeek(Number(btn.dataset.delta)); break;
        case 'week-today': weekOffset = 0; renderPlanning(); break;
        case 'period': switchPeriodFilter(btn.dataset.period); break;
        case 'autofill': autofill(); break;
        case 'print': printPlanning(); break;
        case 'clear': clearPlanning(); break;
        case 'view': setMobileView(btn.dataset.view); break;
        case 'apply-update': applyUpdate(); break;
        case 'save-settings': saveSettings(); break;
        case 'import-legacy': importLegacy(); break;
        case 'load-catalog': loadCatalogManually(); break;
        case 'panel': togglePanel(btn.dataset.panel); break;
        case 'pick-photo': $('recipe-photo-file').click(); break;
        case 'drop-photo': clearRecipePhoto(); break;
        case 'reset-all': resetAll(); break;
        case 'run-ai':
            closeModal('ai-modal');
            runGenerator($('ai-preference').value, $('ai-keep').checked);
            break;
    }
});

// Fermeture d'une modale par clic sur le fond
document.querySelectorAll('.modal').forEach((m) => {
    m.addEventListener('mousedown', (e) => {
        if (e.target !== m) return;
        if (m.id === 'confirm-modal') return;      // géré par settleConfirm
        closeModal(m.id);
    });
});

$('category-chips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (btn) setCategoryFilter(btn.dataset.filter);
});

const applySearch = debounce(() => renderRecipes(), 150);
$('global-search').addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    applySearch();
});

const applyBankSearch = debounce(() => renderFoodBank(), 150);
$('foodbank-search').addEventListener('input', (e) => {
    foodBankQuery = e.target.value.trim().toLowerCase();
    applyBankSearch();
});

// Sauvegarde garantie avant fermeture de l'onglet
window.addEventListener('beforeunload', () => { saveData.flush(); });
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveData.flush();
});
