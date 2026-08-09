# PlanRepas

Application web de planification de repas : planning hebdomadaire, recettes, liste de
courses, inventaire du frigo et banque d'aliments.

**➡️ [Ouvrir l'application](https://gregory971.github.io/Repas-html/)**

Fichier HTML unique, sans build ni dépendance à installer. Version courante : **v0.21**.

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

## Connexion réseau

La mise en page utilise Tailwind CSS et Google Fonts via CDN : une connexion est
nécessaire au chargement de la page. L'application prévient si la feuille de style n'a pas
pu être récupérée. Une fois chargée, l'utilisation se fait entièrement hors ligne.

## Structure du dépôt

| Chemin | Rôle |
|---|---|
| `index.html` | Application servie par GitHub Pages — copie de la version courante |
| `Repas v0.21 Modern UX.html` | Fichier de travail de la version courante |
| `archives/` | Versions précédentes, v0.1 à v0.20 |

À chaque nouvelle version : créer `Repas v0.N.html`, déplacer la précédente dans
`archives/`, puis recopier la nouvelle vers `index.html` pour mettre le site à jour.

## Licence

Projet personnel, usage libre.
