/* Démarrage, état réseau, service worker. */

function renderAll() {
    renderRecipes();
    renderPlanning();
    renderShoppingList();
    renderFridge();
    renderFoodBank();
}

applyTheme();
renderAccPicker();
setCategoryFilter('all');
switchPeriodFilter('all');
switchTab('shopping');
setMobileView('planning');
fillSettingsForm();
renderAll();

if (legacyNotice) {
    saveNow();                       // fige la reprise pour les prochains chargements
    setTimeout(() => showToast(legacyNotice), 400);
}

// Appareil vierge : on installe le catalogue publie plutot que le jeu de
// demonstration. L'interface est deja affichee, on la reactualise ensuite.
if (needsCatalog && location.protocol !== 'file:') {
    seedFromCatalog()
        .then((count) => {
            renderRecipes();
            renderFoodBank();
            renderPlanning();
            setTimeout(() => showToast(`${count} recettes chargées`), 400);
        })
        .catch(() => { /* catalogue indisponible : le jeu de démonstration reste en place */ });
}

/* ---------- État réseau ---------- */

function updateOnlineBadge() {
    $('offline-badge').hidden = navigator.onLine !== false;
}
window.addEventListener('online', updateOnlineBadge);
window.addEventListener('offline', updateOnlineBadge);
updateOnlineBadge();

/* ----------------------------------------------------------
   SERVICE WORKER — fonctionnement hors ligne et installation
   Ignoré en file:// (les service workers exigent HTTPS)
   ---------------------------------------------------------- */

let waitingWorker = null;

if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then((reg) => {
            // Une version déjà en attente au chargement
            if (reg.waiting && navigator.serviceWorker.controller) {
                waitingWorker = reg.waiting;
                $('update-badge').hidden = false;
            }
            reg.addEventListener('updatefound', () => {
                const sw = reg.installing;
                if (!sw) return;
                sw.addEventListener('statechange', () => {
                    // « installed » avec un contrôleur actif = mise à jour, pas première install
                    if (sw.state === 'installed' && navigator.serviceWorker.controller) {
                        waitingWorker = sw;
                        $('update-badge').hidden = false;
                    }
                });
            });
        }).catch(() => { /* hors ligne ou non supporté : l'application fonctionne quand même */ });

        let reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (reloading) return;
            reloading = true;
            location.reload();
        });
    });
}

function applyUpdate() {
    $('update-badge').hidden = true;
    if (waitingWorker) waitingWorker.postMessage('SKIP_WAITING');
    else location.reload();
}
