/*
 * Panneaux latéraux repliables et photo de recette.
 *
 * Repli : sur grand écran seulement. Sur mobile, la barre du bas sert déjà
 * à choisir la section affichée, replier n'y aurait aucun sens.
 */

/* ---------- Panneaux repliables ---------- */

function applyPanels() {
    ['left', 'right'].forEach((side) => {
        const ouvert = state.settings.panels[side] !== false;
        document.body.dataset[side === 'left' ? 'panelLeft' : 'panelRight'] = ouvert ? 'open' : 'closed';
        document.querySelectorAll(`[data-act="panel"][data-panel="${side}"]`).forEach((btn) => {
            btn.setAttribute('aria-expanded', String(ouvert));
        });
    });
}

function togglePanel(side) {
    if (side !== 'left' && side !== 'right') return;
    state.settings.panels[side] = state.settings.panels[side] === false;
    applyPanels();
    saveData();
}

/* ---------- Photo de recette ---------- */

const PHOTO_MAX = 640;          // côté le plus long, en pixels
const PHOTO_QUALITE = 0.72;

/**
 * Réduit une image choisie par l'utilisateur et la rend en data URL JPEG.
 * Le redimensionnement est indispensable : une photo de téléphone dépasse
 * à elle seule le quota du localStorage.
 */
function shrinkImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            const ratio = Math.min(1, PHOTO_MAX / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * ratio));
            canvas.height = Math.max(1, Math.round(img.height * ratio));
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('canvas indisponible')); return; }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            try {
                resolve(canvas.toDataURL('image/jpeg', PHOTO_QUALITE));
            } catch (e) {
                reject(e);
            }
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image illisible')); };
        img.src = url;
    });
}

/** Affiche (ou masque) l'aperçu du formulaire de recette. */
function setPhotoPreview(src) {
    const preview = $('recipe-photo-preview');
    const clear = $('recipe-photo-clear');
    if (src) {
        preview.src = src;
        preview.hidden = false;
        clear.hidden = false;
    } else {
        preview.removeAttribute('src');
        preview.hidden = true;
        clear.hidden = true;
    }
}

function clearRecipePhoto() {
    $('recipe-image').value = '';
    $('recipe-photo-file').value = '';
    setPhotoPreview('');
}

document.addEventListener('change', async (e) => {
    if (e.target !== $('recipe-photo-file')) return;
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!/^image\//.test(file.type)) {
        showToast('Ce fichier n\u2019est pas une image', 'error');
        return;
    }
    try {
        const dataUrl = await shrinkImage(file);
        $('recipe-image').value = dataUrl;
        setPhotoPreview(dataUrl);
    } catch (err) {
        showToast('Photo illisible', 'error');
    }
});
