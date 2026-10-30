# Galarneau Braille Suite

Traducteur braille basé sur Electron, en mémoire de Roland Galarneau, un
Québécois ayant contribué au développement de l'impression braille au Québec
avec l'appareil Converto-Braille.

## Objectif du projet

Créer une application desktop simple pour traduire :

- du texte vers le braille ;
- du braille vers le texte ;
- avec un mode hybride:
   - preview temps reel avec **liblouis-js** ;
   - traduction complete avec le moteur natif **liblouisutdml**
      quand `file2brl` (`file2brl.exe` sous Windows) est disponible.

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
- **liblouis** (bindings JavaScript) pour le preview et la saisie instantanee ;
- **liblouisutdml** (binaire `file2brl` / `file2brl.exe`) pour la traduction
   complete en production ;
- **BRLAPI** (Linux, optionnel) via appel JavaScript direct pour envoyer un
   repere tactile vers un afficheur braille ;
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
- Linux (optionnel, pour BRLAPI): `brltty` (libbrlapi)

Note BRLAPI Linux : la sortie vers afficheur repose sur la dépendance
optionnelle `koffi`. Si BRLAPI est signalé indisponible dans l'application,
vérifie que `koffi` est bien installé dans `node_modules`.

## Installation

```bash
npm install
```

## Lancement

```bash
npm start
```

## Activer le moteur natif (liblouisutdml)

Le preview reste en `liblouis-js` par defaut. Pour la traduction complete via
`Ctrl/Cmd+T`, l'application tente d'utiliser `file2brl` (ou `file2brl.exe`
sous Windows).

1. Telecharger les binaires `liblouisutdml` pour ta plateforme.
2. Placer le binaire natif dans:

```text
native/liblouisutdml/bin/file2brl.exe   (Windows)
native/liblouisutdml/bin/file2brl       (Linux)
```

3. Placer les tables liblouis (incluant `unicode.dis`) dans:

```text
native/liblouisutdml/share/liblouis/tables
```

4. Optionnel: tu peux aussi utiliser des dossiers specifiques plateforme et
   architecture:

```text
native/liblouisutdml/linux-x64/bin/file2brl
native/liblouisutdml/linux-x64/share/liblouis/tables
```

5. Optionnel: definir des variables d'environnement si tu preferes un autre
   emplacement:
   - `GBS_LIBLOUISUTDML_FILE2BRL` (chemin complet vers `file2brl`/`file2brl.exe`)
   - `GBS_LIBLOUISUTDML_BIN` (dossier contenant `file2brl`/`file2brl.exe`)
   - `GBS_LIBLOUIS_TABLES_DIR` (dossier de tables liblouis avec `unicode.dis`)

Sous Linux, verifie que le binaire est executable:

```bash
chmod +x native/liblouisutdml/bin/file2brl
```

Si `file2brl` est absent ou echoue, l'application bascule automatiquement sur
`liblouis-js` et affiche un message d'information.

## Générer un exécutable (Electron Builder)

Construire l’exécutable Linux (AppImage) :

```bash
npm run dist:linux
```

Construire les artefacts Windows (NSIS + ZIP) :

```bash
npm run dist:win
```

Le build utilise l'icone versionnee `build/icons/app-icon.ico`.

Optionnel: regenerer l'icone `.ico` depuis la source SVG (ImageMagick requis):

```bash
npm run assets:icon:win
```

Construire les artefacts Windows signes (NSIS + ZIP) :

```bash
npm run dist:win:signed
```

Variables de signature supportees :

- `CSC_LINK` (+ `CSC_KEY_PASSWORD` si necessaire) ;
- `WIN_CSC_LINK` (+ `WIN_CSC_KEY_PASSWORD` si necessaire) ;
- `CSC_NAME` (si le certificat est deja dans le store Windows).

Construire avec la cible par défaut configurée :

```bash
npm run dist
```

Les artefacts sont générés dans le dossier `dist/`.

Pour Windows, la commande `npm run dist:win` génère notamment:

- un installateur NSIS (`.exe`) ;
- une archive ZIP (`.zip`).

Le build signe utilise les memes artefacts, avec signature de code appliquee
si les variables de certificat sont correctement definies.

### Exécuter l’AppImage sous Linux

Rendre d’abord le fichier exécutable, puis lancer l’application :

```bash
chmod +x "dist/Galarneau Braille Suite-1.0.0-x86_64.AppImage"
"./dist/Galarneau Braille Suite-1.0.0-x86_64.AppImage"
```

Si tu obtiens l’erreur `dlopen(): error loading libfuse.so.2`, installe FUSE 2
selon ta distribution, puis relance :

- Debian/Ubuntu : `sudo apt install libfuse2` (ou `libfuse2t64` selon la version)
- Fedora : `sudo dnf install fuse fuse-libs`
- Arch : `sudo pacman -S fuse2`

Alternative sans installer FUSE (plus lente au démarrage) :

```bash
"./dist/Galarneau Braille Suite-1.0.0-x86_64.AppImage" --appimage-extract-and-run
```

Le binaire non empaqueté est aussi disponible ici :
`dist/linux-unpacked/galarneau-braille-suite`

## Utilisation

1. Au démarrage, l’écran affiche un **espace vide** avec :
   - le texte normal `galarneau braille suite version 1.0 en la mémoire de Roland Galarneau.` ;
   - sa traduction braille en français via la table `fr-bfu-g2` ;
   - le focus clavier sur la zone de traduction braille.
   - ce numéro de version est à mettre à jour lors d’une évolution importante.
2. Utiliser `Ctrl/Cmd + N` pour afficher la section **Créer un nouveau document**.
   Tu peux aussi utiliser `Ctrl/Cmd + O` pour ouvrir un document Galarneau
   (`.gnp`, `.gnb`, `.gbs`) ou importer un fichier externe (`.doc`, `.docx`,
   `.odt`, `.odf`, `.pdf`, `.rtf`, `.txt`, `.md`, `.markdown`).
3. Dans **Créer un nouveau document**, choisir :
   - le type de document : normal (`.gnp`) ou braille (`.gnb`) ;
   - la table de traduction braille ;
   - le nombre de lignes par page ;
   - le nombre de caractères par ligne.
4. Cliquer sur **Créer le document**.
5. L’éditeur s’ouvre uniquement après création du document.
6. Saisir le contenu dans les lignes de l’éditeur (et ajouter des pages si
   nécessaire).
   En document normal (`.gnp`), l’éditeur reste large pour écrire librement
   (les paramètres lignes/page et caractères/ligne ne limitent pas cette saisie).
   En document braille (`.gnb`), chaque ligne affiche un repère compact à
   gauche au format `l#p#c#`, où `c` suit la position réelle du curseur dans le
   contenu affiché.
   En document braille, si un mot dépasse la longueur disponible, il est
   automatiquement renvoyé à la ligne suivante. Quand la dernière ligne d’une
   page déborde, une nouvelle page est créée automatiquement.
7. Pour centrer un titre, place le curseur sur sa ligne puis utilise
   **Centrer la ligne active**.
   Après centrage, le curseur revient au début de la ligne pour permettre de
   vérifier immédiatement les espaces de tête (utile avec un afficheur braille).
8. Si besoin, active **Afficher les espaces avec des points (·)** pour voir
   clairement les espaces dans la ligne active sans modifier le texte.
9. Enregistrer le document avec **Enregistrer le document**.
   - document normal : extension `.gnp`
   - document braille : extension `.gnb`
10. En document normal (`.gnp`), choisir le sens de traduction (texte → braille ou braille → texte).
11. En document normal (`.gnp`), activer ou désactiver la **traduction en temps réel** selon ton besoin :
   - activée : conversion instantanée vers le braille pendant la saisie ;
   - désactivée : traduction ponctuelle via bouton ou raccourci clavier.
12. En document normal (`.gnp`), consulter la traduction affichée **sous chaque ligne de l’éditeur** pendant la saisie.
13. En document braille (`.gnb`), tu peux saisir au clavier standard et chaque ligne est convertie en braille à mesure de la frappe (sans panneau de traduction séparé).
   Le repère `l#p#c#` s’ajuste aussi après abrègement (ex.: si la ligne affichée
   devient plus courte après conversion, `c` suit cette nouvelle longueur).
   Pour obtenir l’abrègement des mots, utilise une table abrégée (ex. `fr-bfu-g2`).
   Selon la règle liblouis, certaines contractions se stabilisent au plus tard
   quand tu appuies sur l’espace.
   La coupure automatique des mots se fait selon la longueur braille réellement
   affichée après traduction (et non selon la longueur du texte source tapé).
   Sous Linux, si BRLAPI est disponible, tu peux activer la sortie BRLAPI
   depuis les options du panneau **Créer un nouveau document** ou via
   `Ctrl/Cmd + Maj + B`. La ligne active est alors envoyée vers l’afficheur
   avec un en-tête tactile: points `1-2-3-7`, repère `p#l#c#`, puis points
   `4-5-6-8`; ensuite un segment de comptage affiche la limite
   `caractères/ligne` (exemple: à 30 caractères, le marqueur points `4-5-6-8`
   est placé au 30e emplacement).
14. Cliquer sur **Traduire le document** (ou utiliser `Ctrl/Cmd + T`) pour un document normal.
15. Si le document actif est un `.gnp` et que la traduction va vers le braille :
   - l’éditeur bascule automatiquement sur le contenu braille (le texte imprimé n’est plus la base d’édition active) ;
   - le contenu est redimensionné selon les paramètres braille choisis (caractères/ligne et lignes/page) ;
   - un fichier `.gnb` compagnon est généré automatiquement avec le même nom de base quand l’enregistrement est possible.

### Mise en forme BFU (italique, gras, surlignage)

En document normal (`.gnp`), tu peux marquer l’emphase BFU avant la traduction braille :

- boutons **Gras BFU**, **Italique BFU**, **Surligner BFU** ;
- raccourcis `Ctrl/Cmd + B`, `Ctrl/Cmd + I`, `Ctrl/Cmd + U` ;
- balises reconnues :
   - gras : `<b>...</b>`, `<strong>...</strong>`, `<gras>...</gras>` ;
   - italique : `<i>...</i>`, `<em>...</em>`, `<italique>...</italique>` ;
   - soulignement : `<u>...</u>`, `<underline>...</underline>`, `<souligne>...</souligne>`, `<surligne>...</surligne>`, `<surlignage>...</surlignage>`.

Comportement du raccourci italique :

- avec une sélection, `Ctrl/Cmd + I` applique les balises d’italique à la sélection ;
- sans sélection, `Ctrl/Cmd + I` active le mode italique (insertion de `<i>`) et la même combinaison le désactive (insertion de `</i>`) ;
- en mode document normal (`.gnp`), la ligne active prend un rendu visuel italique tant que le curseur est dans une zone italique active.

Avec la table `fr-bfu-g2`, ces styles sont convertis selon les classes d’emphase
liblouis/BFU (`italic`, `underline`, `bold`) et les indicateurs définis dans la
table BFU française de référence :

- début de mot emphase : `456` ;
- fin de mot emphase : `6-3` ;
- début de phrase emphase : `25-456` ;
- fermeture de phrase emphase : `before 456` ;
- seuil phrase emphase : `4` mots.

Notes de conformité (vérifiées sur les sources officielles liblouis/BFU) :

- classes déclarées : `emphclass italic`, `emphclass underline`, `emphclass bold` ;
- indicateurs de mot : `begemphword ... 456` et `endemphword ... 6-3` ;
- indicateurs de phrase : `begemphphrase ... 25-456`, `endemphphrase ... before 456`, `lenemphphrase ... 4` ;
- caractères exclus de l’emphase : `noemphchars ... ,\s`.

Le terme « surlignage » dans l’UI est mappé à la classe BFU `underline`
(soulignement), car la table BFU de référence ne définit pas de classe
d’emphase distincte nommée « surlignage ».

Compatibilité moteur: si la classe `underline` est déclarée par la table mais
n’émet pas d’indicateur visible avec la version liblouis active, l’application
applique un fallback sur la classe `italic` pour conserver un marquage BFU
explicite du texte souligné/surligné.

### Références de conformité BFU

- Table liblouis française abrégée BFU :
   <https://raw.githubusercontent.com/liblouis/liblouis/master/tables/fr-bfu-g2.ctb>
- Table liblouis BFU 6 points (déclaration des classes et indicateurs d’emphase) :
   <https://raw.githubusercontent.com/liblouis/liblouis/master/tables/fr-bfu-comp6.utb>
- Manuel liblouis (opcodes d’emphase) :
   <https://liblouis.io/documentation/liblouis/Emphasis-Opcodes.html>
- Manuel liblouis (API `lou_getTypeformForEmphClass`) :
   <https://liblouis.io/documentation/liblouis/lou_005fgetTypeformForEmphClass.html>

### Menu Fichier

Le menu **Fichier** de l’application contient :

- **Nouveau**
- **Ouvrir…**
- **Enregistrer**
- **Enregistrer sous…**

L'action **Ouvrir…** accepte les documents natifs (`.gnp`, `.gnb`, `.gbs`) et
importe aussi des documents externes (`.doc`, `.docx`, `.odt`, `.odf`, `.pdf`,
`.rtf`, `.txt`, `.md`, `.markdown`) en les convertissant vers un document
normal interne.

### Menu Traduire

Le menu **Traduire** (à côté de **Fichier**) contient :

- **Traduire le document**
- **Basculer la traduction en temps réel** (case à cocher)

### Menu Édition

Le menu **Édition** contient aussi :

- **Centrer la ligne active** (`Ctrl/Cmd + E`)
- **Appliquer le gras BFU** (`Ctrl/Cmd + B`)
- **Appliquer l’italique BFU** (`Ctrl/Cmd + I`)
- **Appliquer le surlignage BFU** (`Ctrl/Cmd + U`)

### Raccourcis clavier

- `Ctrl/Cmd + N` : afficher la création d’un nouveau document `.gnp`/`.gnb`
- `Ctrl/Cmd + O` : ouvrir un document `.gnp`/`.gnb`/`.gbs` ou importer un fichier `.doc`/`.docx`/`.odt`/`.odf`/`.pdf`/`.rtf`/`.txt`/`.md`/`.markdown`
- `Ctrl/Cmd + S` : enregistrer le document actif (`.gnp` ou `.gnb`)
- `Ctrl/Cmd + Shift + S` : enregistrer le document actif sous…
- `Ctrl/Cmd + T` : traduire le document en une seule fois
- `Ctrl/Cmd + Shift + T` : basculer la traduction en temps réel
- `Ctrl/Cmd + E` : centrer la ligne active (pratique pour les titres)
- `Ctrl/Cmd + B` : appliquer le gras BFU à la sélection de la ligne active
- `Ctrl/Cmd + I` : appliquer l’italique BFU, ou activer/désactiver le mode italique si aucune sélection
- `Ctrl/Cmd + U` : appliquer le surlignage BFU à la sélection de la ligne active
- `Flèche haut` / `Flèche bas` : monter / descendre d’une ligne (les lignes vides intermédiaires sont accessibles)
- `Entrée` en document normal (`.gnp`) : couper la ligne active à la position du curseur
- `Entrée` en document braille (`.gnb`) : aller à la ligne suivante, sans entrer dans les lignes vides de fin de contenu

### Saisie braille au clavier (8 points)

Dans l’éditeur, tu peux choisir **Mode de saisie → Clavier braille 8 points**.

Correspondance des touches :

- point 1 = `F`
- point 2 = `D`
- point 3 = `S`
- point 4 = `J`
- point 5 = `K`
- point 6 = `L`
- point 7 = `A`
- point 8 = `;`

Appuie les touches d’un caractère en combinaison (ensemble), puis relâche :
l’application insère le caractère braille Unicode correspondant.

Un repère visuel des points 1→8 est affiché dans l’éditeur et indique les
points actifs pendant une combinaison.

## Formats de document `.gnp` et `.gnb`

Les documents de Galarneau Braille Suite utilisent maintenant deux extensions :

- **`.gnp`** : document normal (texte standard)
- **`.gnb`** : document braille

Chaque fichier contient la configuration initiale complète du document :

- table de traduction braille ;
- nombre de lignes par page ;
- nombre de caractères par ligne ;
- sens de traduction par défaut ;
- mode de saisie (standard ou braille 8 points) ;
- option de traduction en temps réel (activée/désactivée) ;
- option d’affichage des espaces visibles (activée/désactivée) ;
- pages et contenu ligne par ligne.

Un document `.gnp` ou `.gnb` ouvert dans l’application recharge
automatiquement ses paramètres initiaux.

Quand un document `.gnp` est traduit vers le braille via la traduction
complète (`Ctrl/Cmd + T`), un fichier `.gnb` séparé est généré
automatiquement avec le même nom de base.

## Accessibilité

L’interface est structurée pour une utilisation clavier et lecteur d’écran :

- zones nommées avec titres et labels explicites ;
- messages d’état annoncés via `aria-live` ;
- messages d’erreur annoncés en mode assertif (`role="alert"`) ;
- focus initial sur la traduction braille de l’écran d’accueil ;
- gestion de focus à la création du document (focus sur la première ligne) ;
- lien d’évitement clavier en début de page ;
- indication caractères saisis / caractères max par ligne en visuel (sans annonce
   vocale à chaque frappe) ;
- repère compact `l#p#c#` sur chaque ligne braille, mis à jour selon la position du curseur ;
- repère `l#p#c#` visuel uniquement (pas d’annonce vocale à chaque caractère) ;
- pas de libellé verbal "zone d’édition" ajouté sur chaque champ de ligne ;
- repère visuel des points braille actifs en mode 8 points ;
- traduction intégrée sous chaque ligne de l’éditeur en document normal (`.gnp`) ;
- en document braille (`.gnb`), saisie standard possible avec conversion braille instantanée directement dans la ligne ;
- en braille, renvoi automatique des mots à la ligne suivante et pagination
   automatique en fin de page ;
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
8. En document normal (`.gnp`), la traduction intégrée sous chaque ligne est visible et se met à jour sans panneau séparé.
9. L’ouverture / l’enregistrement d’un `.gnp` ou `.gnb` conserve bien la configuration
   initiale (table, lignes/page, caractères/ligne, direction).
10. La saisie braille 8 points (`F D S J K L A ;`) fonctionne sur les lignes de
   l’éditeur.
11. En document normal (`.gnp`), la vue traduite en temps réel se met à jour pendant la saisie.
12. En document braille (`.gnb`), la saisie standard est convertie en braille à mesure de la frappe.
13. En document normal (`.gnp`), `Ctrl/Cmd+T` vers braille bascule bien l’éditeur
   sur le document braille.
14. Le bouton **Centrer la ligne active** et `Ctrl/Cmd+E` centrent bien la
    ligne ciblée et annoncent le statut.
15. Avec **Afficher les espaces** activé, la zone **Repère des espaces**
    montre bien les espaces avec « · » et le nombre d’espaces en tête.
16. En saisie continue braille (`.gnb`), vérifier qu’un mot trop long est
   poussé automatiquement sur la ligne suivante et qu’une nouvelle page est
   ajoutée quand la page courante est pleine.
17. Vérifier que `Flèche haut`/`Flèche bas` déplacent bien le focus ligne par
   ligne, y compris sur les lignes vides intermédiaires.
18. Vérifier que `Entrée` coupe bien la ligne en document normal (`.gnp`) et
   qu’en document braille (`.gnb`), le focus va bien vers la ligne suivante
   sans entrer dans des lignes vides en fin de contenu.

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
