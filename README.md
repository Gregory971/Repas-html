# PlanRepas

Application web de planification de repas : planning hebdomadaire, recettes, liste de
courses, inventaire du frigo et banque d'aliments.

**âž¡ï¸ [Ouvrir l'application](https://gregory971.github.io/Repas-html/)**

Fichier HTML unique, sans build ni dÃ©pendance Ã  installer. Version courante : **v0.21**.

## FonctionnalitÃ©s

- Planning hebdomadaire midi / soir sur plusieurs semaines, avec navigation par dates
- Glisser-dÃ©poser des recettes (souris) et mode Â« placement Â» en deux touches (tactile)
- Portions ajustables par repas et accompagnements
- Liste de courses gÃ©nÃ©rÃ©e depuis le planning, quantitÃ©s agrÃ©gÃ©es et rangÃ©es par rayon
- Inventaire du frigo avec dates de pÃ©remption
- GÃ©nÃ©rateur de menu local (Ã©quilibrÃ©, vÃ©gÃ©tarien, express, antillais)
- Exclusions d'ingrÃ©dients, score d'Ã©quilibre, impression, thÃ¨me clair / sombre
- Export et import JSON

## DonnÃ©es

Tout est stockÃ© dans le `localStorage` de votre navigateur, sous la clÃ© `planrepas_v21`.
**Rien n'est envoyÃ© sur un serveur.** Les donnÃ©es sont propres Ã  chaque navigateur et Ã 
chaque appareil : utilisez l'export / import JSON pour les transfÃ©rer.

L'application rÃ©cupÃ¨re automatiquement les sauvegardes des versions antÃ©rieures
(`planrepas_*` de la v0.20, `pr15_data` Ã  `pr7_data` des versions v0.7 Ã  v0.15). Ces clÃ©s
sont lues sans jamais Ãªtre modifiÃ©es. En cas de besoin :
**RÃ©glages â†’ RÃ©cupÃ©rer mes donnÃ©es des versions v0.7 Ã  v0.15**.

> Sauvegardez rÃ©guliÃ¨rement via le bouton d'export : vider les donnÃ©es de navigation
> efface le `localStorage`.

## Connexion rÃ©seau

La mise en page utilise Tailwind CSS et Google Fonts via CDN : une connexion est
nÃ©cessaire au chargement de la page. L'application prÃ©vient si la feuille de style n'a pas
pu Ãªtre rÃ©cupÃ©rÃ©e. Une fois chargÃ©e, l'utilisation se fait entiÃ¨rement hors ligne.

## Structure du dÃ©pÃ´t

| Chemin | RÃ´le |
|---|---|
| `index.html` | Application servie par GitHub Pages â€” copie de la version courante |
| `Repas v0.21 Modern UX.html` | Fichier de travail de la version courante |
| `archives/` | Versions prÃ©cÃ©dentes, v0.1 Ã  v0.20 |

Ã€ chaque nouvelle version : crÃ©er `Repas v0.N.html`, dÃ©placer la prÃ©cÃ©dente dans
`archives/`, puis recopier la nouvelle vers `index.html` pour mettre le site Ã  jour.

## Licence

Projet personnel, usage libre.
