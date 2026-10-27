# Galarneau Braille Suite

Traducteur braille basé sur Electron, en mémoire de Roland Galarneau, un
Québécois ayant contribué au développement de l'impression braille au Québec
avec l'appareil Converto-Braille.

## Objectif du projet

Créer une application desktop simple pour traduire :

- du texte vers le braille ;
- du braille vers le texte ;
- avec les tables de traduction de **liblouis-js**.

## Origine du nom

Le nom **Galarneau Braille Suite** rend hommage à **Roland Galarneau**,
inventeur québécois de Hull, reconnu pour ses travaux sur la production
informatisée de documents braille. Dans les années 1960, il développe le
**Converto-Braille**, une machine pionnière qui facilite la conversion de texte
imprimé en braille et améliore l'accès à la lecture pour les personnes ayant
une déficience visuelle.

Sources consultées :

- Ingenium — *Writing in braille was made easy by the Converto-Braille* :
  <https://ingeniumcanada.org/channel/innovation/writing-braille-was-made-easy-converto-braille>
- Historica Canada — *Le Converto-Braille transforme du texte en braille* :
  <https://www.historicacanada.ca/fr/productions/videos-educatives/innovations-canadiennes/le-converto-braille-transforme-du-texte-en-braille>
- IEEE Region 7 — *Canadian Computers Aid the Visually Impaired* :
  <https://ewh.ieee.org/reg/7/millennium/braille/braille_galarneau.html>

## Stack technique

- **Electron** pour l'application bureau ;
- **liblouis** (bindings JavaScript) pour la traduction braille ;
- HTML/CSS/JS (sans framework) pour l'interface.

## Arborescence

```text
.
├── package.json
├── src
│   ├── main
│   │   ├── braille-service.js
│   │   ├── gbs-document-service.js
│   │   ├── main.js
│   │   └── preload.js
│   └── renderer
│       ├── app.js
│       ├── index.html
│       └── styles.css
└── README.md
```

## Prérequis

- Node.js 20+ recommandé
- npm 10+ recommandé

## Installation

```bash
npm install
```

## Lancement

```bash
npm start
```

## Générer un exécutable (Electron Builder)

Construire l’exécutable Linux (AppImage) :

```bash
npm run dist:linux
```

Construire avec la cible par défaut configurée :

```bash
npm run dist
```

Les artefacts sont générés dans le dossier `dist/`.

## Utilisation

1. Au démarrage, l’écran affiche un **espace vide** avec :
   - le texte normal `galarneau braille suite version 1.0 en la mémoire de Roland Galarneau.` ;
   - sa traduction braille en français via la table `fr-bfu-g2` ;
   - un texte expliquant l’origine du nom, et sa version braille (table `fr-bfu-g2`) ;
   - le focus clavier sur la zone de traduction braille.
   - ce numéro de version est à mettre à jour lors d’une évolution importante.
2. Utiliser `Ctrl/Cmd + N` pour afficher la section **Créer un nouveau document**.
3. Dans **Créer un nouveau document**, choisir :
   - la table de traduction braille ;
   - le nombre de lignes par page ;
   - le nombre de caractères par ligne.
4. Cliquer sur **Créer le document**.
5. L’éditeur s’ouvre uniquement après création du document.
6. Saisir le contenu dans les lignes de l’éditeur (et ajouter des pages si
   nécessaire).
7. Pour centrer un titre, place le curseur sur sa ligne puis utilise
   **Centrer la ligne active**.
   Après centrage, le curseur revient au début de la ligne pour permettre de
   vérifier immédiatement les espaces de tête (utile avec un afficheur braille).
8. Si besoin, active **Afficher les espaces avec des points (·)** pour voir
   clairement les espaces dans la ligne active sans modifier le texte.
9. Enregistrer le document avec **Enregistrer le document .gbs**.
10. Choisir le sens de traduction (texte → braille ou braille → texte).
11. Activer ou désactiver la **traduction en temps réel** selon ton besoin :
   - activée : conversion instantanée vers le braille pendant la saisie ;
   - désactivée : traduction ponctuelle via bouton ou raccourci clavier.
12. Consulter l’**aperçu braille en direct** pendant la saisie.
13. Cliquer sur **Traduire le document** (ou utiliser `Ctrl/Cmd + T`).

### Menu Fichier

Le menu **Fichier** de l’application contient :

- **Nouveau**
- **Ouvrir…**
- **Enregistrer**
- **Enregistrer sous…**

### Menu Traduire

Le menu **Traduire** (à côté de **Fichier**) contient :

- **Traduire le document**
- **Basculer la traduction en temps réel** (case à cocher)

### Menu Édition

Le menu **Édition** contient aussi :

- **Centrer la ligne active** (`Ctrl/Cmd + E`)

### Raccourcis clavier

- `Ctrl/Cmd + N` : afficher la création d’un nouveau document `.gbs`
- `Ctrl/Cmd + O` : ouvrir un document `.gbs`
- `Ctrl/Cmd + S` : enregistrer le document `.gbs`
- `Ctrl/Cmd + Shift + S` : enregistrer le document `.gbs` sous…
- `Ctrl/Cmd + T` : traduire le document en une seule fois
- `Ctrl/Cmd + Shift + T` : basculer la traduction en temps réel
- `Ctrl/Cmd + E` : centrer la ligne active (pratique pour les titres)

### Saisie braille au clavier (8 points)

Dans l’éditeur, tu peux choisir **Mode de saisie → Clavier braille 8 points**.

Correspondance des touches :

- point 1 = `S`
- point 2 = `D`
- point 3 = `F`
- point 4 = `J`
- point 5 = `K`
- point 6 = `L`
- point 7 = `A`
- point 8 = `;`

Appuie les touches d’un caractère en combinaison (ensemble), puis relâche :
l’application insère le caractère braille Unicode correspondant.

Un repère visuel des points 1→8 est affiché dans l’éditeur et indique les
points actifs pendant une combinaison.

## Format de document `.gbs`

Les documents de Galarneau Braille Suite utilisent l’extension **`.gbs`**.

Chaque fichier `.gbs` contient la configuration initiale complète du document :

- table de traduction braille ;
- nombre de lignes par page ;
- nombre de caractères par ligne ;
- sens de traduction par défaut ;
- mode de saisie (standard ou braille 8 points) ;
- option de traduction en temps réel (activée/désactivée) ;
- option d’affichage des espaces visibles (activée/désactivée) ;
- pages et contenu ligne par ligne.

Un document `.gbs` ouvert dans l’application recharge automatiquement ses
paramètres initiaux.

## Accessibilité

L’interface est structurée pour une utilisation clavier et lecteur d’écran :

- zones nommées avec titres et labels explicites ;
- messages d’état annoncés via `aria-live` ;
- messages d’erreur annoncés en mode assertif (`role="alert"`) ;
- focus initial sur la traduction braille de l’écran d’accueil ;
- gestion de focus à la création du document (focus sur la première ligne) ;
- lien d’évitement clavier en début de page ;
- indication caractères saisis / caractères max par ligne ;
- repère visuel des points braille actifs en mode 8 points ;
- aperçu braille en direct pendant l’édition ;
- résultat de traduction en lecture seule avec description dédiée ;
- support d’accessibilité rendu activé côté Electron.

## Validation multi-lecteurs d’écran

Objectif : comportement cohérent avec **NVDA**, **JAWS**, **VoiceOver** et
**Orca**.

### Matrice de validation manuelle

Pour chaque lecteur, vérifier les points suivants :

1. Le lien d’évitement est atteignable au clavier au démarrage.
2. Au démarrage, le focus arrive bien sur la traduction braille de l’écran d’accueil.
3. Les champs de création (table, lignes/page, caractères/ligne) sont lus avec
   leur libellé après `Ctrl/Cmd+N`.
4. L’éditeur est absent tant que le document n’est pas créé.
5. Après création, le focus va sur la première ligne de la page 1.
6. Les annonces d’état (succès/erreur) sont vocalisées.
7. Le bouton **Ajouter une page** ajoute bien une page et place le focus sur sa
   première ligne.
8. Le résultat de traduction est lisible en mode lecture seule.
9. L’ouverture / l’enregistrement d’un `.gbs` conserve bien la configuration
   initiale (table, lignes/page, caractères/ligne, direction).
10. La saisie braille 8 points (`S D F J K L A ;`) fonctionne sur les lignes de
   l’éditeur.
11. L’aperçu braille en direct se met à jour pendant la saisie.
12. Avec la traduction en temps réel désactivée, `Ctrl/Cmd+T` lance bien la
    traduction complète.
13. Le bouton **Centrer la ligne active** et `Ctrl/Cmd+E` centrent bien la
    ligne ciblée et annoncent le statut.
14. Avec **Afficher les espaces** activé, la zone **Repère des espaces**
    montre bien les espaces avec « · » et le nombre d’espaces en tête.

Environnements recommandés :

- NVDA + Windows
- JAWS + Windows
- VoiceOver + macOS
- Orca + Linux

## Tables configurées par défaut

- Français (France) — braille intégral (`fr-fr-g1`)
- Français (Canada) — braille intégral (`fr-ca-g1`)
- Français BFU — braille abrégé (`fr-bfu-g2`)
- Anglais UEB — braille intégral (`en-ueb-g1`)

Tu peux en ajouter d'autres dans `src/main/braille-service.js`.
