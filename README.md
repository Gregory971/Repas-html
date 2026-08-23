# PlanRepas

Application web de planification de repas : planning hebdomadaire, recettes, liste de
courses, inventaire du frigo et banque d'aliments.

**➡️ [Ouvrir l'application](https://gregory971.github.io/Repas-html/)**

Page unique et autonome, sans dépendance à installer. Version courante : **v0.24**.

Fonctionne **hors ligne** et s'**installe** comme une application (menu du navigateur →
« Installer » / « Ajouter à l'écran d'accueil »).

## Fonctionnalités

- Planning hebdomadaire midi / soir sur plusieurs semaines, avec navigation par dates
- Glisser-déposer des recettes (souris), mode « placement » en deux touches (tactile),
  et choix d'une recette directement depuis un créneau libre
- Portions ajustables par repas et accompagnements
- Liste de courses générée depuis le planning : quantités agrégées et arrondies à ce qui
  s'achète, rangées par rayon dans l'ordre du magasin, et **déduction de ce qui est déjà
  au frigo**
- Inventaire du frigo avec quantités et dates de péremption
- Générateur de menu local (équilibré, végétarien, express, antillais) qui **met en avant
  les recettes consommant les produits proches de la péremption**
- Score d'équilibre de la semaine : couverture, variété, part végétale
- Impression et partage du planning **comme de la liste de courses**
- Photo par recette : depuis l'appareil photo ou la galerie, ou par adresse web
- Panneaux latéraux repliables sur grand écran, barre de navigation sur mobile
- Exclusions d'ingrédients, thème clair / sombre, export et import JSON

## Données

Tout est stocké dans le `localStorage` de votre navigateur, sous la clé `planrepas_v21`.
**Rien n'est envoyé sur un serveur.** Les données sont propres à chaque navigateur et à
chaque appareil : utilisez l'export / import JSON pour les transférer.

L'application récupère automatiquement les sauvegardes des versions antérieures
(`planrepas_*` de la v0.20, `pr15_data` à `pr7_data` des versions v0.7 à v0.15). Ces clés
sont lues sans jamais être modifiées. En cas de besoin :
**Réglages → Récupérer mes données des versions v0.7 à v0.15**.

> Sauvegardez régulièrement via le bouton d'export : vider les données de navigation
> efface le `localStorage`.

## Catalogue de recettes

`data/seed.json` contient les recettes et les aliments livrés avec le site. Un navigateur
qui ouvre l'application pour la première fois les charge automatiquement : inutile de
réimporter un JSON sur chaque appareil.

Sur un appareil déjà utilisé, rien n'est écrasé. Pour compléter une collection existante :
**Réglages → Ajouter les recettes du catalogue publié**. Sont ajoutées les recettes et les
aliments absents, ainsi que les photos des recettes qui n'en ont pas encore. Une photo
déjà présente n'est jamais remplacée, et le planning, les courses et les réglages ne
bougent pas.

Le catalogue ne contient **que** des recettes et des aliments — aucun réglage, aucun
planning, aucune liste de courses, aucune liste d'exclusions. Un test le vérifie à chaque
construction. Pour le régénérer depuis un export de l'application :

```bash
node -e "const s=require('./chemin/vers/export.json');require('fs').writeFileSync('data/seed.json',JSON.stringify({version:21,recipes:s.recipes,foodBank:s.foodBank},null,1))"
npm run check
```

## Photos des plats

35 des 52 recettes du catalogue sont illustrées par des photos issues de
**Wikimedia Commons**, sous licence libre. Les fichiers sont hébergés dans `data/photos/`
plutôt qu'appelés à distance, et `data/photo-credits.json` porte pour chacun l'auteur, la
licence et la page d'origine.

Le choix est fait **fichier par fichier**, à la main. Une sélection automatique du premier
résultat ramenait la capitale du Sri Lanka pour « Colombo de poulet » et celle du Ghana
pour « Accras » : les plats sans photo certaine — surtout les spécialités antillaises —
n'en reçoivent aucune et gardent leur vignette générée à partir de leur nom.

Pour vos propres plats, le formulaire de recette accepte une photo depuis l'appareil :
elle est réduite à 640 px et enregistrée **sur cet appareil uniquement**, jamais publiée.

## Importer des recettes depuis le web

`tools/import-recipes.mjs` récupère des recettes sur les sites qui publient des données
structurées `schema.org/Recipe`, et les met au format de l'application :

```bash
node tools/import-recipes.mjs "https://exemple.org/ma-recette/"
node tools/import-recipes.mjs --liste "https://exemple.org/categorie/" --max 10
node tools/import-recipes.mjs --depuis mes-urls.txt      # une URL par ligne
```

Deux lectures sont tentées, dans cet ordre : les données structurées
`schema.org/Recipe`, puis, à défaut, le HTML de l'article — un titre « Ingrédients »
suivi d'une liste, un titre « Préparation » suivi d'une autre. Ce repli refuse toute page
qui ne fournit pas au moins trois ingrédients et deux étapes, pour qu'une page de sommaire
ne finisse pas dans la collection.

Le résultat va dans `data/imported.json`. Chargez-le ensuite dans l'application avec le
bouton **Importer** de l'en-tête : les recettes absentes sont ajoutées, les vôtres, votre
planning et vos réglages ne bougent pas. Chaque fiche importée affiche un lien vers sa
page d'origine.

Sites vérifiés :

| Site | État |
|---|---|
| 750g.com | ✅ données structurées complètes |
| cuisine-creole.com | ✅ structurées sur une partie, HTML lisible sur le reste |
| cookpad.com | ✅ données structurées complètes |
| tatiemaryse.com | ❌ aucune donnée structurée publiée — non importable |

Le script s'identifie, respecte les règles `robots.txt` du site et espace ses requêtes
d'une seconde. Titres nettoyés de leurs appendices de référencement, mentions de
préparation retirées des noms d'ingrédients, « sel et poivre » séparé en deux articles,
durées ISO converties en minutes.

> **`data/imported.json` est exclu du dépôt, et le catalogue publié n'est jamais modifié
> par ce script.** Une liste d'ingrédients ne se protège pas, mais le texte des étapes et
> les photos appartiennent à leurs auteurs : les charger dans votre application relève de
> l'usage privé, les republier sur un site public non.

## Panneaux latéraux

Sur grand écran, les colonnes « Recettes » et « Courses / Frigo / Aliments » se replient
en un rail vertical pour laisser toute la largeur au planning. L'état est mémorisé.
Sur mobile, c'est la barre du bas qui choisit la section affichée.

## Hors ligne

Aucun script tiers n'est chargé, et les icônes sont un sprite SVG local : la page est
complète dès le premier affichage, même sans réseau. Seules les polices de texte Google
sont distantes ; chargées en `display=swap`, elles n'ont jamais bloqué l'affichage, et le
service worker les met en cache au premier passage.

Une politique de sécurité (`Content-Security-Policy`) interdit toute connexion sortante et
n'autorise les scripts de la page que par leur empreinte, calculée à la construction.

## Structure du dépôt

| Chemin | Rôle |
|---|---|
| `index.html` | **Application livrée — fichier généré, ne pas éditer à la main** |
| `src/template.html` | Markup et styles écrits à la main |
| `src/js/*.js` | Modules ES concaténés dans la page à la construction |
| `src/icons.svg` | Sprite d'icônes local |
| `data/seed.json` | Catalogue de recettes et d'aliments livré avec le site |
| `data/photos/` | Photos des plats (Wikimedia Commons, licences libres) |
| `data/photo-credits.json` | Auteur, licence et source de chaque photo |
| `tools/find-photos.mjs`, `tools/fetch-photos.mjs` | Recherche et récupération des photos |
| `tools/import-recipes.mjs` | Import de recettes depuis des sites tiers (usage privé) |
| `tools/build.js` | Assemble `index.html` depuis `src/` |
| `tools/build-css.js` | Recompile le bloc `<style id="tw">` depuis le markup |
| `tests/` | Tests des fonctions pures et de la page assemblée |
| `manifest.json`, `sw.js`, `icon-*.png` | Installation et fonctionnement hors ligne |
| `archives/` | Versions précédentes, v0.1 à v0.22 |

`index.html` est un artefact de construction : toute modification passe par `src/`.

## Développement

```bash
npm install          # tailwindcss + jsdom
npm run build        # src/ -> index.html, puis recompilation du CSS
npm test             # tests unitaires et d'intégration
npm run check        # construit puis teste
```

Le découpage en modules n'existe que dans les sources : `tools/build.js` retire les
`import` / `export` et concatène tout dans l'IIFE de la page. L'application reste donc
livrée comme un fichier unique, tandis que les fonctions pures (analyse des ingrédients,
normalisation, agrégation des courses, générateur, score) restent importables et testées.

La construction échoue si une classe utilisée dans le markup n'a pas de règle CSS, si un
marqueur du gabarit n'a pas été remplacé, ou s'il reste de la syntaxe de module.

### Publier une version

Les versions sont des **tags git** : il n'y a plus de copie `Repas v0.N.html` à la racine.

1. modifier `src/`, puis `npm run check`
2. porter le numéro dans `package.json` (`version`) et dans `sw.js` (`VERSION`) —
   sans quoi les navigateurs conservent l'ancien cache
3. commiter, `git tag v0.23`, pousser

## Licence

Projet personnel, usage libre.
