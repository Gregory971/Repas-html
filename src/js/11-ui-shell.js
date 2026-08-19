/*
 * Briques d'interface transverses : notifications, modales, confirmation,
 * conservation du focus entre deux rendus.
 */

/* ---------- Notifications ---------- */

function showToast(msg, type) {
    const container = $('toast-container');
    const toast = document.createElement('div');
    const ok = type !== 'error';
    toast.className = 'toast px-4 py-2.5 rounded-xl font-bold text-xs shadow-lg flex items-center gap-2 pointer-events-auto ' +
        (ok ? 'bg-primary text-canvas' : 'bg-danger text-white');
    toast.innerHTML = icon(ok ? 'check_circle' : 'error', 'text-sm');
    const text = document.createElement('span');
    text.textContent = msg;               // textContent : aucune injection possible
    toast.append(text);
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
}

/* ---------- Modales ---------- */

const modalStack = [];
let lastFocused = null;

/**
 * Neutralise l'arrière-plan pendant qu'une modale est ouverte.
 * Sans cela, la tabulation sortait de la boîte de dialogue et continuait
 * dans la page, alors que `aria-modal` promet le contraire.
 */
function setBackgroundInert(on) {
    Array.from(document.body.children).forEach((el) => {
        if (el.id === 'toast-container' || el.classList.contains('modal')) return;
        el.inert = on;
    });
}

function focusablesIn(el) {
    return Array.from(el.querySelectorAll(
        'a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((n) => n.offsetParent !== null || n === document.activeElement);
}

function openModal(id) {
    const el = $(id);
    if (!el || !el.hidden) return;
    if (!modalStack.length) { lastFocused = document.activeElement; setBackgroundInert(true); }
    // Une modale ouverte au-dessus d'une autre neutralise celle du dessous.
    const below = modalStack[modalStack.length - 1];
    if (below && $(below)) $(below).inert = true;

    el.hidden = false;
    modalStack.push(id);
    const first = focusablesIn(el)[0];
    if (first) setTimeout(() => first.focus(), 30);
}

function closeModal(id) {
    const target = id || modalStack[modalStack.length - 1];
    const el = $(target);
    if (!el || el.hidden) return;
    el.hidden = true;
    const i = modalStack.lastIndexOf(target);
    if (i >= 0) modalStack.splice(i, 1);

    const below = modalStack[modalStack.length - 1];
    if (below && $(below)) $(below).inert = false;

    if (!modalStack.length) {
        setBackgroundInert(false);
        if (lastFocused && lastFocused.focus) lastFocused.focus();
    }
}

function toggleModal(id) { ($(id) && $(id).hidden) ? openModal(id) : closeModal(id); }

/** Boucle de tabulation à l'intérieur de la modale du dessus. */
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !modalStack.length) return;
    const el = $(modalStack[modalStack.length - 1]);
    if (!el) return;
    const items = focusablesIn(el);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (placingRecipeId !== null) { cancelPlacing(); return; }
        if (modalStack.length) closeModal();
    }
});

/* ---------- Confirmation ---------- */

let confirmResolve = null;

/**
 * Remplace `confirm()`. La boîte native bloque le fil d'exécution et jure
 * dans une application installée ; celle-ci suit le thème et se ferme au clavier.
 */
function confirmDialog(message, { danger = true, confirmLabel = 'Confirmer' } = {}) {
    $('confirm-message').textContent = message;
    const btn = $('confirm-accept');
    btn.textContent = confirmLabel;
    btn.className = 'px-4 py-2 rounded-lg font-bold text-xs shadow-md ' +
        (danger ? 'bg-danger text-white shadow-danger/20' : 'bg-primary text-canvas shadow-primary/20');
    openModal('confirm-modal');
    return new Promise((resolve) => { confirmResolve = resolve; });
}

function settleConfirm(value) {
    closeModal('confirm-modal');
    const resolve = confirmResolve;
    confirmResolve = null;
    if (resolve) resolve(value);
}

$('confirm-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-act="confirm-accept"]')) settleConfirm(true);
    else if (e.target.closest('[data-act="confirm-cancel"]') || e.target === $('confirm-modal')) settleConfirm(false);
});

/* ---------- Conservation du focus entre deux rendus ---------- */

/**
 * Le planning est reconstruit en entier à chaque modification. Sans ce relais,
 * un clic sur « + » renvoyait le focus sur `body` : impossible d'incrémenter
 * les portions deux fois de suite au clavier.
 */
function focusSignature() {
    const el = document.activeElement;
    if (!el || el === document.body || !el.dataset) return null;
    const slot = el.closest('[data-slot]');
    if (slot && el.dataset.act) {
        return {
            day: slot.dataset.day, key: slot.dataset.slotkey,
            act: el.dataset.act, delta: el.dataset.delta || '', index: el.dataset.index || ''
        };
    }
    if (slot && slot === el) return { day: slot.dataset.day, key: slot.dataset.slotkey, act: '' };
    return el.id ? { id: el.id } : null;
}

function restoreFocus(sig) {
    if (!sig) return;
    if (sig.id) { const el = $(sig.id); if (el) el.focus(); return; }

    const slot = document.querySelector(
        `[data-slot][data-day="${CSS.escape(sig.day)}"][data-slotkey="${CSS.escape(sig.key)}"]`);
    if (!slot) return;
    if (!sig.act) { slot.focus(); return; }

    let sel = `[data-act="${sig.act}"]`;
    if (sig.delta) sel += `[data-delta="${sig.delta}"]`;
    if (sig.index) sel += `[data-index="${sig.index}"]`;
    const target = slot.querySelector(sel) || slot;
    if (target.focus) target.focus();
}

/** Exécute un rendu en rendant le focus à l'élément équivalent. */
function keepFocus(render) {
    const sig = focusSignature();
    render();
    restoreFocus(sig);
}

/* ---------- Repli des images ---------- */

// Photo distante indisponible -> bascule sur la vignette générée
// (capture : l'évènement « error » ne remonte pas).
document.addEventListener('error', (e) => {
    const img = e.target;
    if (img && img.tagName === 'IMG' && img.dataset.fallback && img.src !== img.dataset.fallback) {
        img.src = img.dataset.fallback;
    }
}, true);
