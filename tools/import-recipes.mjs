/*
 * Importe des recettes depuis des sites qui publient des données structurées
 * schema.org/Recipe (JSON-LD), et les met au format de PlanRepas.
 *
 *     node tools/import-recipes.mjs <url> [<url> ...]
 *     node tools/import-recipes.mjs --liste <url-de-categorie> [--max 10]
 *
 * Le résultat va dans data/imported.json, **exclu du dépôt** : ces recettes
 * viennent de sites tiers, leur texte et leurs photos appartiennent à leurs
 * auteurs. Les charger dans votre application est un usage privé ; les
 * republier sur un site public ne l'est pas. Le catalogue publié
 * (data/seed.json) n'est jamais touché par ce script.
 *
 * Le script s'identifie, respecte les règles robots.txt qu'il rencontre et
 * espace ses requêtes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIngLine } from '../src/js/03-ingredients.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = path.join(ROOT, 'data', 'imported.json');
const UA = 'PlanRepasImport/1.0 (importateur personnel de recettes; +https://github.com/Gregory971/Repas-html)';
const DELAI = 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- robots.txt ---------- */

const robotsCache = new Map();

/** Règles Disallow du groupe « User-agent: * », converties en expressions. */
async function robotsRules(origin) {
    if (robotsCache.has(origin)) return robotsCache.get(origin);
    let regles = [];
    try {
        const res = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': UA } });
        if (res.ok) {
            let dansGroupe = false;
            for (const ligne of (await res.text()).split('\n')) {
                const l = ligne.trim();
                if (/^user-agent:/i.test(l)) dansGroupe = l.split(':')[1].trim() === '*';
                else if (dansGroupe && /^disallow:/i.test(l)) {
                    const motif = l.slice(l.indexOf(':') + 1).trim();
                    if (motif) regles.push(motif);
                }
            }
        }
    } catch { /* pas de robots.txt lisible : on n'invente pas d'interdiction */ }
    robotsCache.set(origin, regles);
    return regles;
}

async function autorise(url) {
    const u = new URL(url);
    const regles = await robotsRules(u.origin);
    const chemin = u.pathname + u.search;
    return !regles.some((motif) => {
        const rx = new RegExp('^' + motif.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*'));
        return rx.test(chemin);
    });
}

/* ---------- Récupération ---------- */

async function recupere(url) {
    if (!await autorise(url)) throw new Error('interdit par robots.txt');
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
}

/** Tous les nœuds JSON-LD de type Recipe d'une page, @graph compris. */
export function extraitRecipes(html) {
    const trouves = [];
    for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
        let data;
        try { data = JSON.parse(m[1].trim()); } catch { continue; }
        const pile = Array.isArray(data) ? [...data] : [data];
        while (pile.length) {
            const n = pile.shift();
            if (!n || typeof n !== 'object') continue;
            if (Array.isArray(n['@graph'])) pile.push(...n['@graph']);
            if ([].concat(n['@type'] || []).includes('Recipe')) trouves.push(n);
        }
    }
    return trouves;
}

/* ---------- Conversion vers le format PlanRepas ---------- */

/** « PT1H30M » -> 90. Les sites mélangent durées ISO et texte libre. */
export function dureeEnMinutes(valeur) {
    if (valeur == null) return null;
    const s = String(valeur);
    const iso = s.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
    if (iso && (iso[1] || iso[2] || iso[3])) {
        return (+(iso[1] || 0)) * 1440 + (+(iso[2] || 0)) * 60 + (+(iso[3] || 0));
    }
    const h = s.match(/(\d+)\s*h(?:eure)?s?\s*(\d+)?/i);
    if (h) return (+h[1]) * 60 + (+(h[2] || 0));
    const min = s.match(/(\d+)\s*(?:min|mn)/i);
    if (min) return +min[1];
    const nu = s.match(/^\s*(\d+)\s*$/);
    return nu ? +nu[1] : null;
}

/**
 * « 4 personnes », « pour 6 », « 200 pièces » -> nombre de parts.
 * Cookpad annonce parfois un nombre de pièces produites : au-delà de 20,
 * la valeur ne décrit plus des convives, on retombe sur 4.
 */
export function nombreDeParts(valeur) {
    if (valeur == null) return 4;
    const s = Array.isArray(valeur) ? String(valeur[0]) : String(valeur);
    const m = s.match(/(\d+)/);
    if (!m) return 4;
    const n = +m[1];
    return n >= 1 && n <= 20 ? n : 4;
}

const MOTS_ENTREE =
    /(entr[ée]e|ap[ée]ritif|amuse|soupe|potage|velout[ée]|salade compos|accras?|acras|beignets?|f[ée]roce|souskay|bokit)/i;
const MOTS_DESSERT =
    /(dessert|g[âa]teau|tarte sucr|p[âa]tisserie|glace|sorbet|cr[èe]me|mousse|flan|biscuit|confiture|blanc-manger|doucelette|tourment d.amour)/i;

/* ---------- Nettoyage des libellés ---------- */

/**
 * Les titres de ces sites portent souvent un appendice de référencement :
 * « Colombo de porc : la recette antillaise facile ». On garde la tête.
 */
export function nettoieTitre(brut) {
    const t = nettoieTexte(brut);
    const i = t.indexOf(' : ');
    if (i >= 12 && t.length > 34) {
        const queue = t.slice(i + 3);
        if (/recette|facile|rapide|saveur|astuce|maison|d[ée]licieu|authentique|traditionnel|inratable|meilleur/i.test(queue)
            || queue.length >= 12) return t.slice(0, i);
    }
    return t;
}

/** Mentions de préparation qui n'ont rien à faire sur une liste de courses. */
const PREPARATION = /\s*[,(]\s*(?:[ée]minc|hach|coup|r[âa]p|pel|lav|[ée]gout|d[ée]cortiq|d[ée]sar[êe]t|cisel|facultatif|optionnel|au go[ûu]t|selon|pour (?:servir|la finition|d[ée]corer)|en (?:d[ée]s|rondelles|lamelles|morceaux|fin(?:es)? tranches|fin de cuisson))[^,)]*\)?/i;

/** Nom d'ingrédient prêt pour la liste de courses. */
export function nettoieNomIngredient(nom) {
    let n = String(nom || '').trim();
    n = n.replace(PREPARATION, '');                  // « oignon, émincé » -> « oignon »
    n = n.replace(/\s*\([^)]*\)\s*$/, '');           // parenthèse finale résiduelle
    // Répété : « de la farine » porte deux articles successifs.
    let avant;
    do { avant = n; n = n.replace(/^(?:de |d'|d’|du |des |la |le |les |l')\s*/i, ''); } while (n !== avant);
    n = n.replace(/\s*(?:en fin de cuisson|pour la cuisson|si besoin|au besoin)\s*$/i, '');
    return n.replace(/[\s,;.]+$/, '').trim();
}

/**
 * « sel et poivre » désigne deux produits : la liste de courses doit les
 * distinguer. On ne coupe que sur des ingrédients sans quantité, pour ne pas
 * casser « 200 g de riz et haricots ».
 */
export function eclateIngredient(ligne) {
    const base = parseIngLine(ligne);
    if (!base) return [];
    if (base.qty != null) return [base];
    const parts = base.name.split(/\s+(?:et|&|\+)\s+/i).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2 || parts.length > 3 || parts.some((p) => p.length > 22)) return [base];
    return parts.map((p) => ({ ...base, name: p }));
}

/** Type de plat : la catégorie annoncée d'abord, le titre en dernier recours. */
export function devineType(recette) {
    const champs = [recette.recipeCategory, recette.keywords, recette.name]
        .flat().filter(Boolean).map(String).join(' ');
    if (MOTS_DESSERT.test(champs)) return 'dessert';
    if (MOTS_ENTREE.test(champs)) return 'entrée';
    return 'plat';
}

/** Les étapes arrivent en texte, en tableau, ou en HowToStep/HowToSection. */
export function extraitEtapes(instructions) {
    const out = [];
    const visite = (n) => {
        if (!n) return;
        if (typeof n === 'string') {
            // Un bloc unique contenant plusieurs phrases : on le découpe.
            const texte = nettoieTexte(n);
            if (texte.length > 300) out.push(...decoupeEnEtapes(texte));
            else if (texte) out.push(texte);
            return;
        }
        if (Array.isArray(n)) { n.forEach(visite); return; }
        if (typeof n !== 'object') return;
        if (Array.isArray(n.itemListElement)) { n.itemListElement.forEach(visite); return; }
        const texte = nettoieTexte(n.text || n.name || '');
        if (texte) out.push(texte);
    };
    visite(instructions);
    return out.filter(Boolean).slice(0, 60);
}

const nettoieTexte = (s) => String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’')
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    // Retirer une balise laisse une espace avant la ponctuation : « balises . ».
    // Limité au point et à la virgule : en français « : » et « ! » en prennent une.
    .replace(/\s+([.,…])/g, '$1')
    .trim();

/** Découpe un pavé d'instructions en étapes lisibles. */
function decoupeEnEtapes(texte) {
    return texte
        .split(/(?<=[.!?])\s+(?=[A-ZÀ-Þ0-9])/)
        .map((s) => s.trim())
        .filter((s) => s.length > 3);
}

/** Première image utilisable, quel que soit l'emballage schema.org. */
export function extraitImage(image) {
    const visite = (n) => {
        if (!n) return '';
        if (typeof n === 'string') return n;
        if (Array.isArray(n)) { for (const x of n) { const u = visite(x); if (u) return u; } return ''; }
        if (typeof n === 'object') return visite(n.url || n.contentUrl || '');
        return '';
    };
    const url = visite(image);
    return /^https?:\/\//.test(url) ? url : '';
}

/** Un nœud JSON-LD Recipe -> une recette au format de l'application. */
export function versRecette(node, sourceUrl) {
    const title = nettoieTitre(node.name);
    if (!title) return null;

    const ingredients = [].concat(node.recipeIngredient || node.ingredients || [])
        .flatMap((s) => eclateIngredient(nettoieTexte(s)))
        .map((i) => ({ ...i, name: nettoieNomIngredient(i.name) }))
        .filter((i) => i.name)
        .slice(0, 60);
    if (!ingredients.length) return null;

    const total = dureeEnMinutes(node.totalTime)
        ?? ((dureeEnMinutes(node.prepTime) || 0) + (dureeEnMinutes(node.cookTime) || 0) || null);

    const tags = [].concat(node.keywords || [])
        .flatMap((k) => String(k).split(','))
        .map((k) => nettoieTexte(k))
        .filter((k) => k && k.length <= 24)
        .slice(0, 6);

    return {
        title: title.slice(0, 120),
        type: devineType(node),
        time: total && total > 0 && total <= 600 ? total : 30,
        servings: nombreDeParts(node.recipeYield),
        tags,
        ingredients,
        steps: extraitEtapes(node.recipeInstructions),
        image: extraitImage(node.image),
        source: sourceUrl
    };
}

/* ---------- Parcours d'une page de liste ---------- */

/** Liens de la page qui ressemblent à des fiches recette du même domaine. */
function liensRecettes(html, base) {
    const origine = new URL(base).origin;
    const urls = [...html.matchAll(/href="([^"#?]+)"/g)]
        .map((m) => { try { return new URL(m[1], base).href.replace(/\/$/, '/'); } catch { return ''; } })
        .filter((u) => u.startsWith(origine));

    const MOTIFS = [
        /750g\.com\/[a-z0-9-]+-r\d+\.htm$/i,
        /cookpad\.com\/fr\/recettes\/\d+/i,
        /cuisine-creole\.com\/[a-z0-9-]{6,}\/$/i
    ];
    return [...new Set(urls.filter((u) => MOTIFS.some((rx) => rx.test(u))))];
}

/* ---------- Programme ---------- */

const lanceDirectement = process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (lanceDirectement) {
    const args = process.argv.slice(2);
    if (!args.length) {
        console.error('usage : node tools/import-recipes.mjs <url> [...]  |  --liste <url> [--max N]');
        process.exit(1);
    }

    const modeListe = args.includes('--liste');
    const maxIdx = args.indexOf('--max');
    const MAX = maxIdx >= 0 ? Number(args[maxIdx + 1]) : 12;
    const cibles = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--max');

    let aVisiter = [];
    if (modeListe) {
        for (const listing of cibles) {
            try {
                const html = await recupere(listing);
                const trouves = liensRecettes(html, listing).slice(0, MAX);
                console.log(`${listing}\n  ${trouves.length} fiche(s) reperee(s)`);
                aVisiter.push(...trouves);
            } catch (e) {
                console.error(`! ${listing} : ${e.message}`);
            }
            await sleep(DELAI);
        }
    } else {
        aVisiter = cibles;
    }

    const recettes = [];
    const echecs = [];

    for (const [i, url] of aVisiter.entries()) {
        try {
            const html = await recupere(url);
            const noeuds = extraitRecipes(html);
            if (!noeuds.length) throw new Error('aucune donnée structurée Recipe');
            const r = versRecette(noeuds[0], url);
            if (!r) throw new Error('recette inexploitable (titre ou ingrédients manquants)');
            recettes.push(r);
            console.log(`${String(i + 1).padStart(3)}/${aVisiter.length}  ${r.title.slice(0, 46).padEnd(48)} ${r.ingredients.length} ingr. ${r.steps.length} étapes ${r.image ? 'photo' : '—'}`);
        } catch (e) {
            echecs.push({ url, raison: e.message });
            console.error(`${String(i + 1).padStart(3)}/${aVisiter.length}  ! ${url.slice(0, 60)} : ${e.message}`);
        }
        await sleep(DELAI);
    }

    // Fusion avec un import précédent, sans doublon de titre
    const cle = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
    let existantes = [];
    if (fs.existsSync(SORTIE)) {
        try { existantes = JSON.parse(fs.readFileSync(SORTIE, 'utf8')).recipes || []; } catch { /* fichier illisible */ }
    }
    const vues = new Set(existantes.map((r) => cle(r.title)));
    const nouvelles = recettes.filter((r) => !vues.has(cle(r.title)) && vues.add(cle(r.title)) !== false);

    fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
    fs.writeFileSync(SORTIE, JSON.stringify({
        planrepasImport: 'recipes',
        _avertissement: 'Recettes importées de sites tiers, pour usage personnel. Ne pas publier.',
        recipes: [...existantes, ...nouvelles]
    }, null, 1), 'utf8');

    console.log(`\n${nouvelles.length} nouvelle(s) recette(s), ${existantes.length + nouvelles.length} au total dans data/imported.json`);
    if (echecs.length) console.log(`${echecs.length} echec(s).`);
    console.log('Chargez data/imported.json dans l’application avec le bouton Importer (fleche vers le haut) de l’en-tete.');
}
