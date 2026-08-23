/* Rendu de la grille de planning, des chips de jour et du score d'équilibre. */

function renderSlot(day, slotKey) {
    const entry = plan()[day] || {};
    const label = SLOT_LABELS[slotKey];
    const recipe = recipeById(entry[slotKey]);
    const dayAttr = esc(day);
    const slotAttr = esc(slotKey);

    if (!recipe) {
        // Un vrai bouton : atteignable au clavier, et il ouvre le sélecteur de
        // recette au lieu de rester inerte hors du mode placement.
        return `
        <button type="button" data-slot data-day="${dayAttr}" data-slotkey="${slotAttr}"
                class="h-16 w-full glass-panel border-dashed border-2 border-white/10 rounded-xl flex items-center justify-center text-slate-500 hover:border-primary/50 hover:bg-primary/5 focus:border-primary focus:outline-none transition-all"
                aria-label="${esc(label)} — ${dayAttr}, créneau libre">
            <span class="text-[10px] font-bold capitalize pointer-events-none">${esc(label)}</span>
        </button>`;
    }

    const portion = (entry.portions && entry.portions[slotKey]) || state.settings.household;
    const accList = (entry.acc && entry.acc[slotKey]) || [];
    const accHtml = accList.map((acc, i) => `
        <span class="px-1.5 py-0.5 rounded bg-tertiary/20 text-tertiary-glow text-[9px] font-bold flex items-center gap-1 border border-tertiary/30">
            ${esc(acc)}
            <button type="button" data-act="remove-acc" data-index="${i}" class="hover:text-white" aria-label="Retirer ${esc(acc)}">&times;</button>
        </span>`).join('');

    return `
    <div class="glass-panel rounded-xl p-2 flex flex-col gap-1 border border-white/10 relative group glass-card-hover"
         data-slot data-day="${dayAttr}" data-slotkey="${slotAttr}" tabindex="-1"
         aria-label="${esc(label)} — ${dayAttr} : ${esc(recipe.title)}">
        <button type="button" data-act="remove-meal" class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-400 hover:text-danger transition-all" aria-label="Retirer ${esc(recipe.title)}">
            ${icon('close', 'text-[14px]')}
        </button>
        <span class="text-[10px] font-bold text-slate-400 capitalize">${esc(label)}</span>
        <button type="button" data-act="detail" data-recipe-id="${recipe.id}" class="text-xs font-bold text-white truncate text-left hover:text-primary" title="${esc(recipe.title)}">${esc(recipe.title)}</button>

        <div class="flex flex-wrap gap-1 my-0.5">
            ${accHtml}
            <button type="button" data-act="open-acc" class="text-[9px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 transition-all">+ Acc.</button>
        </div>

        <div class="flex items-center justify-between mt-auto pt-1 border-t border-white/5">
            <span class="text-[10px] text-slate-400">${esc(recipe.time)} min</span>
            <div class="flex items-center bg-canvas rounded-full px-1 border border-white/10">
                <button type="button" data-act="portion" data-delta="-1" class="text-slate-400 hover:text-white px-1 text-[11px]" aria-label="Diminuer les portions">−</button>
                <span class="text-[10px] font-bold px-1 text-primary">${portion}p</span>
                <button type="button" data-act="portion" data-delta="1" class="text-slate-400 hover:text-white px-1 text-[11px]" aria-label="Augmenter les portions">+</button>
            </div>
        </div>
    </div>`;
}

function renderPlanning() {
    const grid = $('planning-grid');
    const start = weekStart();
    const todayIso = isoDate(new Date());
    const showMidi = activePeriodFilter === 'all' || activePeriodFilter === 'midi';
    const showSoir = activePeriodFilter === 'all' || activePeriodFilter === 'soir';

    grid.innerHTML = DAYS.map((day, index) => {
        const date = addDays(start, index);
        const isToday = isoDate(date) === todayIso;
        return `
        <div class="flex flex-col gap-2.5 h-full min-w-0${index === selectedDayIndex ? ' day-active' : ''}" data-day-index="${index}">
            <div class="text-center py-1.5 border-b ${isToday ? 'border-primary/50 bg-primary/5 rounded-t-lg' : 'border-white/5'}">
                <span class="text-[10px] font-bold tracking-wider ${isToday ? 'text-primary' : 'text-slate-400'} block uppercase">${esc(day.substring(0, 3))}</span>
                <span class="text-sm font-extrabold ${isToday ? 'text-white' : 'text-slate-300'}">${date.getDate()}</span>
            </div>
            <div class="flex-1 flex flex-col gap-2 overflow-y-auto">
                ${showMidi ? `
                    <div class="text-[10px] font-bold text-primary px-1">☀️ MIDI</div>
                    ${renderSlot(day, 'midi_entrée')}
                    ${renderSlot(day, 'midi_plat')}
                    ${renderSlot(day, 'midi_dessert')}` : ''}
                ${showSoir ? `
                    <div class="text-[10px] font-bold text-secondary px-1 mt-1">🌙 SOIR</div>
                    ${renderSlot(day, 'soir_entrée')}
                    ${renderSlot(day, 'soir_plat')}
                    ${renderSlot(day, 'soir_dessert')}` : ''}
            </div>
        </div>`;
    }).join('');

    if (placingRecipeId !== null) markSlotsReachable(true);
    renderDayChips();
    updateWeekLabels();
    updateNutritionalSummary();
}

/** Chips de sélection du jour, affichées uniquement sur petit écran. */
function renderDayChips() {
    const start = weekStart();
    const todayIso = isoDate(new Date());
    $('day-chips').innerHTML = DAYS.map((day, index) => {
        const date = addDays(start, index);
        const active = index === selectedDayIndex;
        const isToday = isoDate(date) === todayIso;
        return `
        <button type="button" role="tab" aria-selected="${active}" data-day-index="${index}"
                class="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                    active ? 'bg-primary text-canvas border-primary'
                           : (isToday ? 'bg-white/5 text-primary border-primary/30' : 'bg-white/5 text-slate-300 border-white/5')}">
            ${esc(day.substring(0, 3))} ${date.getDate()}
        </button>`;
    }).join('');
}

function selectDay(index) {
    selectedDayIndex = Math.min(6, Math.max(0, index));
    $('planning-grid').querySelectorAll('[data-day-index]').forEach((col) => {
        col.classList.toggle('day-active', Number(col.dataset.dayIndex) === selectedDayIndex);
    });
    renderDayChips();
}

/** Bascule de section sur mobile (barre de navigation du bas). */
function setMobileView(view) {
    mobileView = view;
    document.body.dataset.view = view;
    document.querySelectorAll('#mobile-nav [data-view]').forEach((btn) => {
        const active = btn.dataset.view === view;
        btn.classList.toggle('text-primary', active);
        btn.classList.toggle('text-slate-400', !active);
        btn.setAttribute('aria-current', active ? 'page' : 'false');
    });
}

/* ---------- Score d'équilibre ---------- */

function updateNutritionalSummary() {
    const result = nutritionScore(plan(), recipeById);

    $('nutri-score-pct').textContent = String(result.score);
    $('nutri-score-desc').textContent = nutritionSummary(result);
    $('nutri-score-advice').textContent = nutritionAdvice(result);
    $('nutri-score-ring').setAttribute('aria-label', `Score d'équilibre : ${result.score} sur 100`);

    [['entree', 'entrée'], ['plat', 'plat'], ['dessert', 'dessert']].forEach(([slug, type]) => {
        $(`bar-${slug}`).style.width = `${Math.min(100, Math.round((result.counts[type] / 14) * 100))}%`;
        $(`count-${slug}`).textContent = `${result.counts[type]}/14`;
    });
}
