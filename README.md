# PlanRepas

Application web de planification de repas : planning hebdomadaire, recettes, liste de
courses, inventaire du frigo et banque d'aliments.

**➡️ [Ouvrir l'application](https://gregory971.github.io/Repas-html/)**

Page unique et autonome, sans dépendance à installer. Version courante : **v0.23**.

Fonctionne **hors ligne** et s'**installe** comme une application (menu du navigateur →
« Installer » / « Ajouter à l'écran d'accueil »).

## Fonctionnalités

- Planning hebdomadaire midi / soir sur plusieurs semaines, avec navigation par dates
- Glisser-déposer des recettes (souris), mode « placement » en deux touches (tactile),
  et choix d'une recette directement depuis un créneau libre
- Portions ajustables par repas et accompagnements
- Liste de courses générée depuis le planning : quantités agrégées, rangées par rayon
  dans l'ordre du magasin, et **déduction de ce qui est déjà au frigo**
- Inventaire du frigo avec quantités et dates de péremption
- Générateur de menu local (équilibré, végétarien, express, antillais) qui **met en avant
  les recettes consommant les produits proches de la péremption**
- Score d'équilibre de la semaine : couverture, variété, apport calorique, part végétale
- Impression et partage du planning **comme de la liste de courses**
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
