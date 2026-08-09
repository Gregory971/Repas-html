# PlanRepas

Application web de planification de repas : planning hebdomadaire, recettes, liste de
courses, inventaire du frigo et banque d'aliments.

**➡️ [Ouvrir l'application](https://gregory971.github.io/Repas-html/)**

Fichier HTML unique, sans dépendance à installer. Version courante : **v0.22**.

Fonctionne **hors ligne** et s'**installe** comme une application (menu du navigateur →
« Installer » / « Ajouter à l'écran d'accueil »).

## Fonctionnalités

- Planning hebdomadaire midi / soir sur plusieurs semaines, avec navigation par dates
- Glisser-déposer des recettes (souris) et mode « placement » en deux touches (tactile)
- Portions ajustables par repas et accompagnements
- Liste de courses générée depuis le planning, quantités agrégées et rangées par rayon
- Inventaire du frigo avec dates de péremption
- Générateur de menu local (équilibré, végétarien, express, antillais)
- Exclusions d'ingrédients, score d'équilibre, impression, thème clair / sombre
- Export et import JSON

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

Le CSS est pré-compilé dans la page : aucun script tiers n'est chargé au démarrage.
Un service worker met l'application en cache dès la première visite, elle reste donc
utilisable sans réseau. Seules les polices Google sont distantes ; elles sont mises en
cache au premier chargement. Un bandeau signale le mode hors ligne, un autre propose de
recharger quand une nouvelle version est déployée.

## Structure du dépôt

| Chemin | Rôle |
|---|---|
| `index.html` | Application servie par GitHub Pages — copie de la version courante |
| `Repas v0.22.html` | Fichier de travail de la version courante |
| `manifest.json`, `sw.js`, `icon-*.png` | Installation et fonctionnement hors ligne |
| `archives/` | Versions précédentes, v0.1 à v0.21 |
| `tools/build-css.js` | Recompile le bloc `<style id="tw">` depuis le markup |

À chaque nouvelle version : créer `Repas v0.N.html`, déplacer la précédente dans
`archives/`, **relancer la compilation du CSS**, puis recopier vers `index.html` :

```bash
npm i -D tailwindcss@3
node tools/build-css.js "Repas v0.N.html"
cp "Repas v0.N.html" index.html
```

Pensez à incrémenter `VERSION` dans `sw.js` pour que les navigateurs récupèrent la
nouvelle version. Le script de compilation échoue si une classe utilisée dans le markup
n'a pas de règle CSS correspondante.

## Licence

Projet personnel, usage libre.
