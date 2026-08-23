/*
 * Télécharge les photos retenues sur Wikimedia Commons et les range dans
 * data/photos/, puis écrit les crédits et met à jour data/seed.json.
 *
 * La sélection ci-dessous est faite à la main, fichier par fichier. Une
 * sélection automatique « premier résultat » ramenait la capitale du
 * Sri Lanka pour « Colombo de poulet » et celle du Ghana pour « Accras » :
 * les plats sans photo certaine n'en reçoivent aucune, c'est préférable à
 * une image hors sujet.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'PlanRepas/0.24 (planificateur de repas personnel; https://github.com/Gregory971/Repas-html)';
const PHOTOS = path.join(ROOT, 'data', 'photos');

/** Plat -> nom exact du fichier Commons retenu après relecture. */
const CHOIX = {
    'Velouté de potiron': 'Pumpkin soup .jpg',
    "Soupe à l'oignon": 'Mmm...onion soup (5344349906).jpg',
    'Salade César': 'Caesar salad (2).jpg',
    'Accras de morue': 'Accras de morue 2.jpg',
    'Accras de légumes': 'Accras et sauce chili.jpg',
    'Bœuf bourguignon': 'Boeuf bourguignon servi avec des pâtes.jpg',
    'Ratatouille niçoise': 'Ratatouille.jpg',
    'Coq au vin': 'Coq au vin.jpg',
    'Quiche lorraine': 'Quiche Lorraine-2009.jpg',
    'Pot-au-feu': 'Pot-au-feu2.jpg',
    'Blanquette de veau': "Blanquette de veau à l'ancienne.jpg",
    'Risotto aux champignons': 'Mushroom Risotto (4789418371).jpg',
    'Omelette aux fines herbes': 'Omelette with bread and parsley 01.jpg',
    'Pâtes carbonara': 'Spaghetti alla Carbonara.jpg',
    'Burger maison': 'Homemade Cheeseburger.JPG',
    'Pizza margherita': 'Eq it-na pizza-margherita sep2005 sml.jpg',
    'Fish and chips': 'Fish and chips.jpg',
    'Cassoulet': 'Cassoulet Carcassonne FRA 001.JPG',
    'Tarte aux légumes du soleil': 'Vegetable Tart (4366625703).jpg',
    'Rougail saucisses': 'Rougail Saucisse 04-07-07.jpg',
    'Poulet boucané': 'Poulet boucané.jpg',
    'Tarte aux pommes': "Tarte aux pommes Bouquet de Rose at L'Arpège (Paris).jpg",
    'Mousse au chocolat': 'Mousse au Chocolat 2010 001.JPG',
    'Tiramisu': 'Dessert Tiramisu.jpg',
    'Crème brûlée': 'Creme brulee (2).jpg',
    'Clafoutis aux cerises': 'Clafoutis aux Cerises.jpg',
    'Banane flambée': 'Bananas Foster.jpg',
    'Salade de fruits tropicaux': 'Koh Mak, Thailand, Tropical breakfast, Fruit salad.jpg',
    'Sorbet coco-papaye': 'Salon agriculture 2009 - Sorbet coco.jpg',
    'Colombo de poisson': 'Colombo de poisson.jpg',
    "Poulet à l'ananas rapide": 'Chicken & Pineapple Rice Bake.jpg',
    'Poulet au lait de coco, tomates et safran': 'Chilli Coconut Chicken curry 1.jpg',
    'Cari de sauté de porc': 'Cari porc chouchou 01.jpg',
    'Curry de poulet au lait de coco': 'Coconut Chicken Curry.jpg',
    'Riz créole aux épices': 'Riz créole.jpg'
};

/*
 * Écartés volontairement, faute de photo certaine sur Commons :
 * Salade de tomates au basilic, Féroce d'avocat, Soupe de giraumon,
 * Boudin créole, Gratin de christophine (3 variantes), Bokit poulet,
 * Flan coco, Gâteau patate, Gâteau banane-coco, Dombré de morue,
 * Salade créole, Colombo de poulet, Colombo de légumes, Colombo de porc,
 * Purée de fruit à pain. Ces plats gardent leur vignette générée.
 */


/** Demande à Commons une vignette d'une largeur donnée. */
async function thumbUrl(file, width) {
    const api = 'https://commons.wikimedia.org/w/api.php?action=query&format=json'
        + `&titles=${encodeURIComponent('File:' + file)}`
        + `&prop=imageinfo&iiprop=url&iiurlwidth=${width}`;
    const res = await fetch(api, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const pages = (await res.json())?.query?.pages;
    const info = pages && Object.values(pages)[0]?.imageinfo?.[0];
    return info ? (info.thumburl || info.url).split('?')[0] : null;
}

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const candidats = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'photo-candidates.json'), 'utf8'));
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'seed.json'), 'utf8'));

fs.mkdirSync(PHOTOS, { recursive: true });
const credits = [];
let total = 0;

for (const [plat, fichier] of Object.entries(CHOIX)) {
    const entree = candidats.find((c) => c.title === plat);
    const choisi = entree?.candidates.find((c) => c.file === fichier);
    if (!choisi) { console.error(`! ${plat} : « ${fichier} » absent des candidats`); continue; }

    // Réécrire la largeur dans l'URL renvoie un 400 : on la redemande à l'API,
    // qui fabrique une URL de vignette valide.
    const url = await thumbUrl(choisi.file, 480);
    if (!url) { console.error(`! ${plat} : vignette indisponible`); continue; }
    let res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status === 429) {                       // quota Commons : on patiente
        await new Promise((r) => setTimeout(r, 5000));
        res = await fetch(url, { headers: { 'User-Agent': UA } });
    }
    if (!res.ok) { console.error(`! ${plat} : HTTP ${res.status}`); continue; }

    const nom = `${slug(plat)}.jpg`;
    const octets = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(path.join(PHOTOS, nom), octets);
    total += octets.length;

    credits.push({ plat, fichier: choisi.file, auteur: choisi.auteur, licence: choisi.licence, source: choisi.page });
    console.log(`${nom.padEnd(40)} ${(octets.length / 1024).toFixed(0)} Ko  ${choisi.licence}`);
    await new Promise((r) => setTimeout(r, 700));
}

// Rattachement aux recettes : uniquement les photos effectivement présentes,
// pour ne jamais référencer un fichier manquant.
const obtenues = new Set(credits.map((c) => c.plat));
let attachees = 0;
seed.recipes.forEach((r) => {
    if (obtenues.has(r.title)) { r.image = `data/photos/${slug(r.title)}.jpg`; attachees++; }
    else delete r.image;
});

fs.writeFileSync(path.join(ROOT, 'data', 'seed.json'), JSON.stringify(seed, null, 1), 'utf8');
fs.writeFileSync(path.join(ROOT, 'data', 'photo-credits.json'), JSON.stringify({
    _description: 'Photos issues de Wikimedia Commons, sous licence libre. Auteur et licence de chaque image.',
    photos: credits
}, null, 1), 'utf8');

console.log(`\n${credits.length} photos, ${(total / 1024 / 1024).toFixed(2)} Mo`);
console.log(`${attachees} recettes illustrées sur ${seed.recipes.length}`);
