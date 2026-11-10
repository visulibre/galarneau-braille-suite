# Mémoire projet — Galarneau Braille Suite

## État actuel

- Application Electron hybride fonctionnelle:
  - preview/saisie instantanee via liblouis-js ;
  - traduction complete en mode production via liblouisutdml natif
    (Windows/Linux) quand `file2brl` est disponible, avec fallback
    automatique vers liblouis-js.
- Les options de structure de pages (imprimees/braille, numerotation,
  separateurs, numero de depart) configurees dans l'UI sont transmises au
  moteur natif `file2brl`.
- Les sauts de page explicites (`\f`) produits par le moteur natif sont
  conserves jusqu'au renderer pour permettre le decoupage correct des pages
  braille.
- L'envoi d'un document braille `.gnb` convertit les cellules Unicode à six
  points en Braille ASCII BRF, puis transmet les octets au spouleur RAW par
  défaut (CUPS sous Linux, Winspool sous Windows); les cellules 7/8 points sont
  refusées car le BRF standard ne les représente pas.
- L'export BRF sauvegarde ce même flux en fichier `.brf` via le dialogue natif,
  sans modifier le document `.gnb`.
- À valider avec les modèles d'embosseuses et pilotes visés; si un appareil
  exige le flux BRF brut, ajouter ensuite un parcours de spool/export adapté.
- Runtime natif present dans le projet:
  - `native/liblouisutdml/bin/file2brl.exe` ;
  - DLL associees (`liblouis.dll`, `liblouisutdml.dll`) ;
  - tables liblouis sous `native/liblouisutdml/share/liblouis/tables`
    (incluant `unicode.dis`).
- Version projet: `1.0.0`.
- Workflow au démarrage:
  - écran **Espace vide** affiché ;
  - création de document masquée ;
  - `Ctrl/Cmd + N` ouvre le panneau de création ;
  - focus initial sur la zone de traduction braille d’accueil.
- Message d’accueil affiché en texte normal **et** traduit en braille
  (`fr-bfu-g2`):
  - `galarneau braille suite version 1.0 en la mémoire de Roland Galarneau.`
- Panneau d’accueil simplifié: affichage direct du texte normal et de sa
  traduction braille, sans libellés de zone visibles.
- Packaging configuré avec **electron-builder** pour générer:
  - Linux AppImage ;
  - Windows NSIS (`.exe`) et ZIP (`.zip`).
- Packaging Windows outille:
  - icone Windows dediee versionnee (`build/icons/app-icon.ico`) ;
  - script optionnel de regeneration d'icone
    `npm run assets:icon:win` depuis `build/icons/app-icon.svg` ;
  - build standard `npm run dist:win` (NSIS + ZIP) ;
  - build signe `npm run dist:win:signed` avec verification prealable des
    variables de certificat.
- Packaging Linux outille:
  - icone Linux dediee (`build/icons/app-icon.png`) derivee du SVG projet ;
  - configuration `build.linux.icon` pour fiabiliser `npm run dist:linux`
    (AppImage).
- Build AppImage Linux via conteneur Podman documente:
  - image de build dediee (`build/linux-appimage/Dockerfile`) ;
  - script PowerShell de build conteneurisee
    (`scripts/build-linux-appimage-podman.ps1`) pour contourner les problemes
    de symlink AppImage sur certains environnements Windows.
- Chargement des tables `liblouis` validé en mode packagé
  (`app.asar.unpacked`).
- Exécution AppImage: dépendance système `libfuse.so.2` requise, avec fallback
  possible via `--appimage-extract-and-run`.
- Configuration workspace VS Code ajoutée pour réduire les demandes
  d’autorisation Copilot (auto-approbation terminal, éditions et URLs).
- Conformité BFU revue avec les sources liblouis officielles: classes
  `italic`/`underline`/`bold`, indicateurs d’emphase (`456`, `6-3`,
  `25-456`, fermeture `before 456`, seuil `4`) et caractères exclus `,\s`.
- Correctif bas niveau appliqué sur la traduction emphase: écriture des
  `typeform` en 16 bits (formtype liblouis), ce qui stabilise la traduction
  stylée et supprime les aborts observés.
- Compatibilité BFU ajoutée pour le soulignement/surlignage: si la classe
  `underline` n’émet pas d’indicateur visible avec la version moteur active,
  fallback automatique vers `italic` afin de conserver un marquage BFU.
- Commandes BFU explicites alignées sur la demande utilisateur:
  `Ctrl/Cmd+B` (gras), `Ctrl/Cmd+I` (italique), `Ctrl/Cmd+U` (surlignage),
  avec libellés UI/menu harmonisés sur « surlignage BFU ».
- Mode italique interactif en document normal (`.gnp`): `Ctrl/Cmd+I` sans
  sélection active/désactive l’italique (insertion `<i>` / `</i>`), notification
  d’état affichée, et rendu visuel italique de la ligne active lorsque le
  curseur est dans une zone italique.
- Correctif navigation horizontale du repère compact: `c` dans `l#p#c#`
  se met désormais à jour en continu avec `Flèche gauche/droite` (ainsi que
  `Home`/`End`) grâce à un rafraîchissement après déplacement réel du curseur.
- Configuration avancée de pagination enrichie (création de document +
  persistance): génération de table des matières braille (`contents`) avec
  options d'inclusion des numéros imprimés/braille, et découpage optionnel en
  volumes avec taille maximale de pages par volume.
- Traduction complète `.gnp -> .gnb` mise à jour pour les volumes:
  génération automatique de plusieurs fichiers braille (`-vol01`, `-vol02`,
  etc.) quand le découpage en volumes est actif, puis bascule de l'éditeur sur
  le premier volume.
- Paramètres natifs `file2brl` alignés avec les clés documentées
  (`printPages`, `braillePages`, `contents`, etc.) pour appliquer la pagination
  et la table des matières côté moteur de production.
- Raccourci `Ctrl/Cmd+Entrée` en document normal (`.gnp`) : insertion d'un
  saut de page imprimée forcé enregistré dans le document, pris en charge en
  preview et en traduction complète ; la pagination braille est recalculée en
  continu pour réutiliser les lignes restantes de la page braille en cours.
- Ouverture étendue des fichiers: support natif `.gnp`/`.gnb`/`.gbs` conservé,
  avec import texte de documents externes `.doc`, `.docx`, `.odt`, `.odf`,
  `.xls`, `.xlsx`, `.pdf`, `.rtf`, `.txt`, `.md`, `.markdown` convertis
  automatiquement en document normal interne.
- Import Excel enrichi (`.xls` / `.xlsx`): generation automatique d'un tableau
  avec delimiteurs braille (`points 1-2-3-4-5-6`) et lignes de structure
  conformes a la demande utilisateur (bord haut, ligne d'entete, separateur,
  lignes de contenu, bord de fin).
- Conversion des tableaux Unicode "box drawing" (`U+2500..U+257F`) vers une
  structure braille 6 points avant traduction texte->braille:
  - conservation de la compatibilite BRF (pas de cellules 7/8 points) ;
  - fermeture forcee des lignes de tableau au dernier caractere disponible
    (`charactersPerLine`, ex. colonne 29) quand la largeur le permet.
- Edition de tableaux braille importes: les delimiteurs `points 1-2-3-4-5-6`
  sont proteges (non effacables), et la navigation horizontale du curseur
  saute de cellule en cellule en se positionnant juste apres chaque delimiteur.
  Quand le curseur arrive sur un caractere special de structure, il est
  automatiquement recale sur le texte editable de la cellule (ou, a defaut,
  sur la premiere zone de texte de la ligne).
  Depuis la premiere ligne structurelle du tableau, `Delete` ouvre une
  boîte HTML intégrée (sans `window.confirm`) depuis n'importe quelle position
  du curseur sur cette ligne, avec le focus initial sur la confirmation et une
  annonce accessible demandant de confirmer ou annuler.
  Le reajustement des largeurs se base uniquement sur le texte des cellules
  (titres de colonnes et items), pas sur les caracteres speciaux de structure;
  il s'applique aussi apres la traduction instantanee du texte saisi.
- Creation manuelle de tableaux braille sans dialogue: dans un document `.gnb`,
  une balise seule `<tableau c=3 r=4 e>` saisie au clavier standard est
  remplacée par une structure de tableau vide; `c` et `r` donnent les nombres
  de colonnes (1-32) et de rangées de contenu (1-200), et `e` ajoute l'entête.
  Sans `e`, le tableau n'a pas d'entête. Le menu **Insertion** a été retiré.
- En pagination de tableau, quand un tableau se poursuit page suivante:
  une ligne de fin de tableau est forcee a l'avant-derniere ligne de la page
  courante, la derniere ligne restant reservee au numero de page braille ;
  la page suivante reserve sa premiere ligne au numero de page imprime, puis
  insere une ligne de debut de tableau en deuxieme ligne avant la suite.
- Import enrichi des emphases bureautiques: conservation de `gras/italique/
  soulignement` sur `.docx`, `.odt/.odf` et `.rtf` via conversion en balises
  BFU (`<b>`, `<i>`, `<u>`) avant traduction. Les fichiers `.doc` legacy
  restent pris en charge avec avertissement explicite sur les limites
  possibles de récupération de formatage.
- Import enrichi de l'alignement: conservation du centrage de paragraphes
  sur `.docx`, `.odt/.odf` et `.rtf`, converti en centrage effectif des
  lignes importees selon la largeur (`charactersPerLine`) du document cible.
- Import DOCX enrichi des encadres: detection des paragraphes avec bordures
  Word et marquage automatique en balise `<anc>` dans le document importe,
  avec metadonnees de comptage/positions des encadres detectes.
- Affichage braille externe enrichi (optionnel):
  - Linux via BRLAPI ;
  - Windows via NVDA Controller Client (`nvdaControllerClient64.dll` et
    alias de compatibilite) ;
  mode activable via option dans le panneau de creation de document et via
  raccourci `Ctrl/Cmd+Maj+B`; regles de capacite appliquees:
  - option automatiquement indisponible sous `40` cellules ;
  - les reperes tactiles `points 1-2-3-7` / `points 4-5-6-8` restent actifs ;
  - exception sur afficheur `40` cellules: la section compteur
    `points 1-2-3-7 x/y points 4-5-6-8` est retiree.
  - curseur tactile `points 7-8` insere dans la ligne envoyee a l'afficheur
    pour materialiser la position courante d'edition.
- Passage de maintenance npm appliqué: dépendances de build migrées vers
  `electron@^45.1.0` et `electron-builder@^26.18.0`, audit npm final à
  `0 vulnerability`.
- Configuration npm allow-scripts validée pour les paquets à script
  d'installation utilisés par le projet (`koffi`, `electron-winstaller`),
  ce qui supprime les avertissements au `npm install`.

## Fonctions déjà en place

- Documents `.gnp` (normal) et `.gnb` (braille) avec persistance de la configuration:
  - table braille, lignes/page, caractères/ligne, direction ;
  - mode de saisie (`text` / `braille-eight-key`) ;
  - traduction temps réel ;
  - affichage des espaces visibles.
- Création de document: choix du type dès le formulaire
  (`.gnp` ou `.gnb`).
- Traduction complète depuis un document `.gnp` vers le braille:
  génération automatique d’un fichier compagnon `.gnb` avec le même nom de
  base.
- Menu **Fichier**: Nouveau, Ouvrir, Enregistrer, Enregistrer sous.
- Menu **Traduire**:
  - Traduire le document (`Ctrl/Cmd + T`) ;
  - bascule temps réel en case à cocher (`Ctrl/Cmd + Shift + T`).
- Menu **Édition**:
  - Centrer la ligne active (`Ctrl/Cmd + E`).
- Creation de tableau: en document `.gnb`, saisir au clavier standard une
  balise seule `<tableau c=3 r=4 e>` pour créer un tableau sans dialogue;
  `e` ajoute l'entête. La balise est remplacée par la structure de tableau.
- Saisie braille clavier 8 points:
  - `F D S J K L A ;` pour points `1..8`.
- Traduction intégrée directement sous chaque ligne de l’éditeur en document
  normal (`.gnp`), sans panneau séparé.
- Sur traduction complète `Ctrl/Cmd+T` d’un `.gnp` vers braille, l’éditeur
  bascule automatiquement vers le document braille (le texte normal n’est plus
  la base d’édition active).
- Document braille (`.gnb`) sans panneau de traduction séparé: saisie clavier
  standard disponible avec conversion liblouis instantanée dans la ligne
  (affichage braille direct), et mode braille 8 points toujours disponible.
- Mise en forme BFU (document normal `.gnp`) alignée sur les classes d’emphase
  liblouis (`bold`, `italic`, `underline`) avec vérification dynamique du
  support de la table active et messages d’état associés.
- Pour les tables françaises BFU, les passages de quatre mots ou plus en
  majuscules reçoivent les indicateurs CBFU de début et de fin, en aperçu et en
  production; les emphases de quatre mots ou plus sont aussi normalisées au
  format CBFU; `<anc>` utilise les filets horizontaux CBFU sans bordures
  latérales.
- Les boutons **Titre niveau 1/2** posent les balises explicites `<h1>`/`<h2>`;
  en production, le contenu XML utilise les sémantiques
  `native/liblouisutdml/semantic/semantics.sem` et son fichier INI. Les lignes
  non marquées deviennent des paragraphes; le preview conserve seulement leur
  texte. Les styles BFU et `<anc>` gardent leur fallback JavaScript existant.
- La table doit être choisie explicitement à chaque création; les tables
  françaises intégrale et BFU abrégée restent disponibles.
- Fichiers touchés pour l’alignement CBFU : `src/main/braille-service.js`,
  `src/main/braille-native-service.js`, `src/renderer/app.js`,
  `src/renderer/index.html`, `native/liblouisutdml/semantic/`,
  `tests/bfu-transcription.test.js`, `README.md` et `.github/project-memory.md`.
- Balise de colonne braille persistante (`<cb#>`): insertion d'un décalage de
  début de ligne (espaces braille) appliqué sur la ligne courante puis sur les
  lignes suivantes tant que le bloc n'est pas fermé via `<cb>` ou `</cb>`.
- Balise de paragraphe ponctuelle (`<par>`): insertion d'un retrait de
  2 cellules braille sur la ligne courante uniquement (équivalent imprimé:
  5 caractères), sans persistance sur la ligne suivante.
- Balise d'encadré ponctuelle (`<anc>` / `<anc#>`): filets horizontaux CBFU
  ouvrant (`points 2-3-5-6`) et fermant (`points 1-2-4-5`) avec bordures
  latérales (`points 1-2-3-4-5-6`) en style boite 6 points, avec une ligne
  vide avant/après si du texte voisin existe;
  `<anc#>` fixe une largeur minimale commune au contenu et aux filets.
- Persistance compressee des documents natifs: les fichiers `.gnp` et `.gnb`
  sont stockes compresses (niveau maximal) et decompressees en memoire a
  l'ouverture, avec compatibilite des anciens fichiers non compresses.
- En document normal (`.gnp`), zone d’édition large non contrainte par les
  paramètres braille (lignes/page, caractères/ligne).
- En document braille (`.gnb`), retour automatique des mots: si une ligne
  dépasse la largeur configurée, le mot est déplacé à la ligne suivante; si la
  page est pleine, une nouvelle page est ajoutée automatiquement.
- Repère de position compact au format `l#p#c#` sur les lignes braille,
  mis à jour en temps réel avec le déplacement du curseur et la longueur
  réellement affichée après conversion/abrègement.
- Navigation clavier verticale dédiée:
  - `Flèche haut` / `Flèche bas` ligne par ligne, avec accès aux lignes vides intermédiaires;
  - `Entrée` en normal (`.gnp`) coupe la ligne au curseur;
  - `Entrée` en braille (`.gnb`) coupe aussi la ligne au curseur (texte après
    curseur déplacé sur la ligne suivante).
- Dans l’éditeur, la touche `Tab` est désactivée pour éviter le changement de
  ligne par tabulation ; depuis une ligne de l’éditeur, `Tab` envoie le focus
  vers les options d’édition (mode de saisie, espaces, traduction). Le flux de
  contenu reste piloté par `Entrée` (découpe de ligne) et `Ctrl/Cmd+Entrée`
  (saut de page forcé en `.gnp`).
- Outil “Afficher les espaces” avec repère visuel `·` sur la ligne active.
- Après centrage (`Ctrl/Cmd+E`):
  - en document normal (`.gnp`), curseur placé au début du texte centré pour
    rendre le déplacement visible immédiatement ;
  - en document braille (`.gnb`), curseur replacé au début de ligne pour
    vérifier les espaces en tête (utile afficheur braille) ;
  - en mode braille avec conversion texte→braille en temps réel, les espaces
    de tête ajoutés par le centrage sont désormais conservés après
    retraduction de la ligne.

## Fichiers clés

- `src/main/main.js`: menus, actions, raccourcis.
- `src/main/preload.js`: pont IPC sécurisé.
- `src/main/brlapi-linux-service.js`: pont Linux vers BRLAPI en JavaScript
  direct (koffi).
- `src/main/braille-service.js`: traduction liblouis.
- `src/main/gbs-document-service.js`: lecture/écriture `.gnp` / `.gnb`
  (ouverture legacy `.gbs`).
- `src/renderer/index.html`: structure UI.
- `src/renderer/app.js`: logique principale renderer.
- `src/renderer/styles.css`: styles, accessibilité visuelle.
- `README.md`: documentation utilisateur.

## Règle de version

- Le texte d’accueil contient “version 1.0”.
- En cas de modification importante, mettre à jour:
  - `APP_VERSION_LABEL` dans `src/renderer/app.js` ;
  - `version` dans `package.json` (et `package-lock.json`) ;
  - la documentation si nécessaire.

## Historique des dernières décisions

- 2026-11-09 : detection des encadres DOCX a l'import:
  - detection des bordures de paragraphe DOCX (`w:pBdr`) en direct et via
    styles herites ;
  - conversion automatique des paragraphes detectes en lignes marquees `<anc>`
    lors de l'import ;
  - remontée des metadonnees d'encadres detectes (paragraphes source et lignes
    marquees) dans la reponse d'ouverture ;
  - message de statut ajoute dans le renderer pour confirmer le nombre
    d'encadres detectes a l'import DOCX.
  Fichiers touches: `src/main/gbs-document-service.js`, `src/renderer/app.js`,
  `tests/docx-import.test.js`, `README.md`, `.github/project-memory.md`.

- 2026-11-09 : conversion boxes + fermeture de ligne de tableau en fin de largeur:
  - conversion automatique des caracteres Unicode de contour de tableau
    (`U+2500..U+257F`) vers les contours braille 6 points avant chaque
    traduction texte->braille (preview et production) ;
  - lignes de contenu tableau fermees explicitement par un delimiteur de fin ;
  - alignement du calcul des largeurs de colonnes pour forcer, quand possible,
    un caractere de fin de boite en derniere colonne (`charactersPerLine`) ;
  - import Excel (`.xls/.xlsx`) aligne sur la meme regle de fermeture.
  - validation automatisée explicite de la fermeture au dernier caractère pour
    des largeurs cibles 29 et 40.
  Fichiers touches: `src/renderer/app.js`, `src/renderer/braille-table-layout.js`,
  `src/main/gbs-document-service.js`, `tests/braille-table-layout.test.js`,
  `tests/spreadsheet-table-layout.test.js`, `README.md`,
  `.github/project-memory.md`.
  Reste a faire: valider en usage reel sur DOCX/tableaux complexes et ajuster
  la repartition des colonnes si necessaire.

- 2026-11-09 : encadres `<anc>` passes en style boite 6 points (modele boxes):
  - construction interne d'une boite Unicode (haut, cotes, bas), puis
    conversion en rendu braille 6 points pour rester compatible BRF ;
  - le contenu encadre est desormais borne par des delimiteurs lateraux
    `points 1-2-3-4-5-6` ;
  - les filets haut/bas conservent la distinction CBFU (`2-3-5-6` puis
    `1-2-4-5`).
  Fichiers touches: `src/main/braille-service.js`,
  `tests/bfu-transcription.test.js`, `README.md`,
  `.github/project-memory.md`.

- 2026-11-04 : ajout de l'impression des documents braille:
  - bouton et commande **Fichier > Envoyer le BRF à l'embosseuse**;
  - raccourci `Ctrl/Cmd+P` pour lancer l'envoi au spouleur;
  - flux éditeur converti/validé en Braille ASCII six points et envoyé en mode
    brut à l'imprimante système par défaut; refus des cellules 7/8 points;
  - envoi limité au document/volume actuellement ouvert;
  - export `.brf` du même flux depuis l'éditeur et le menu **Fichier**,
    sans modifier le `.gnb`.
  Fichiers touchés: `src/main/braille-print-service.js`, `src/main/main.js`,
  `src/main/preload.js`, `src/renderer/app.js`, `src/renderer/index.html`,
  `README.md`, `.github/project-memory.md`.

- 2026-11-04 : correctif de reactivite du workspace pour les requetes Copilot:
  - exclusion des dossiers volumineux locaux (`node_modules`, `dist`,
    `coverage`) de la surveillance fichiers et de la recherche VS Code ;
  - objectif: eviter les blocages de l'extension host observes a l'ouverture
    du depot et retablir un envoi de requetes plus stable.
  Fichiers touches: `.vscode/settings.json`, `.github/project-memory.md`.

- 2026-11-03 : ajout de la balise d'encadre braille `<anc>`:
  - `<anc>` ajoute une ligne de debut (bord haut), puis la ligne encadree
    (`points 1-2-3-4-5-6` en debut et fin), puis une ligne de fin ;
  - `<anc#>` force la position minimale du caractere de fin a la colonne
    `# + 1` (ex. `<anc12>` -> fin au minimum en colonne 13) ;
  - les lignes de debut et de fin s'ajustent a la largeur effective de
    l'encadre ;
  - en mode production, presence de `anc` force un traitement liblouis-js pour
    garantir l'encadre ligne par ligne.
  Fichiers touches: `src/main/braille-service.js`, `README.md`,
  `.github/project-memory.md`.

- 2026-11-03 : repositionnement du curseur sur le texte editable en tableau:
  - sur les lignes de tableau avec texte, si le curseur tombe sur la structure
    (delimiteurs), il est recale sur le contenu textuel de la cellule cible ;
  - pour le positionnement initial d'une ligne, fallback sur la premiere zone
    de texte disponible de la ligne si la cellule cible est vide.
  Fichiers touches: `src/renderer/app.js`, `README.md`,
  `.github/project-memory.md`.

- 2026-11-03 : ajout du menu Insertion pour creer des tableaux braille:
  - nouvelle entree **Insertion > Inserer un tableau...** cote menu principal ;
  - dialogue de saisie colonnes/rangees/entete (`oui`/`non`) dans le renderer ;
  - insertion de la structure du tableau a la position active, avec preservation
    des protections et du reajustement deja en place. Cette entree a ensuite ete
    retiree au profit de la balise explicite `<tableau c=# r=# e>`, sans dialogue.
  Fichiers touches: `src/main/main.js`, `src/renderer/app.js`, `README.md`,
  `.github/project-memory.md`.

- 2026-11-03 : compression maximale des documents natifs:
  - enregistrement des `.gnp`/`.gnb` en format compresse (Brotli qualite max) ;
  - decompresion automatique en memoire a l'ouverture ;
  - compatibilite maintenue avec les anciens `.gnp`/`.gnb` non compresses.
  Fichiers touches: `src/main/gbs-document-service.js`, `README.md`,
  `.github/project-memory.md`.

- 2026-11-03 : pagination structuree des tableaux importes Excel:
  - si un tableau atteint la fin de page et continue, insertion d'une ligne
    de fin de tableau a l'avant-derniere ligne ;
  - reservation de la derniere ligne de page pour le numero de page braille ;
  - reprise sur page suivante avec premiere ligne reservee au numero imprime,
    puis ligne de debut de tableau en deuxieme ligne.
  Fichiers touches: `src/main/gbs-document-service.js`, `README.md`,
  `.github/project-memory.md`.

- 2026-11-03 : contraintes d'edition des tableaux braille:
  - ajustement des delimiteurs de colonnes selon la largeur des colonnes
    (entetes + valeurs) ;
  - protection des caracteres delimiteurs `points 1-2-3-4-5-6` contre
    suppression/remplacement ;
  - protection etendue aux autres caracteres speciaux de structure du tableau ;
  - navigation horizontale par sauts de cellule, curseur positionne juste
    apres le delimiteur de debut de cellule.
  - `Delete` sur le premier delimiteur de la premiere ligne demande la
    suppression du bloc tableau complet ; si confirme, tout le tableau est
    retire.
  - le reajustement des colonnes est calcule uniquement depuis le texte des
    cellules (entetes/items).
  Fichiers touches: `src/main/gbs-document-service.js`, `src/renderer/app.js`,
  `README.md`, `.github/project-memory.md`.

- 2026-11-03 : import Excel structure en tableau braille:
  - prise en charge de `.xls` et `.xlsx` dans la boite d'ouverture et le
    pipeline d'import ;
  - generation d'un tableau texte structure avec:
    - bord haut: `123456 ... 1245 ... 123456` ;
    - ligne d'entete: `123456` au debut et avant chaque titre de colonne ;
    - separateur: `123456 ... 2356 ... 123456` ;
    - lignes de contenu: `123456` au debut et avant chaque valeur ;
    - fin de tableau identique au separateur.
  Fichiers touches: `src/main/gbs-document-service.js`, `README.md`,
  `package.json`, `package-lock.json`, `.github/project-memory.md`.

- 2026-11-03 : ajout d'une balise de paragraphe ponctuelle `<par>`:
  - la balise applique un retrait de 2 cellules braille sur la ligne courante
    uniquement ;
  - la ligne suivante revient automatiquement au début normal ;
  - `</par>` est accepté comme fermeture neutre (aucun retrait ajouté).
  Fichiers touches: `src/main/braille-service.js`, `README.md`,
  `.github/project-memory.md`.

- 2026-11-03 : ajout d'une pipeline de build Linux conteneurisee (Podman):
  - creation d'un Dockerfile dedie pour l'environnement electron-builder
    Linux AppImage ;
  - creation d'un script `build-linux-appimage-podman.ps1` qui build l'image,
    lance la build Linux en conteneur et rapatrie l'AppImage dans `dist/` ;
  - README mis a jour avec la commande de build Podman.
  Fichiers touches: `build/linux-appimage/Dockerfile`,
  `scripts/build-linux-appimage-podman.ps1`, `README.md`,
  `.github/project-memory.md`.

- 2026-11-03 : ajout de la balise de colonne braille persistante:
  - prise en charge de `<cb#>` dans le pipeline de traduction pour appliquer un
    décalage de début de ligne sur la ligne courante puis sur les nouvelles
    lignes suivantes ;
  - fermeture explicite via `<cb>` ou `</cb>` ;
  - prise en charge en preview et en production (avec prétraitement avant
    moteur natif quand aucun style BFU n'est présent).
  Fichiers touches: `src/main/braille-service.js`, `README.md`,
  `.github/project-memory.md`.

- 2026-11-03 : amélioration du retour tactile sur afficheur braille externe:
  - ajout d'un marqueur curseur `points 7-8` dans la ligne transmise (BRLAPI
    Linux et NVDA Windows via la meme sortie renderer), positionne selon le
    curseur courant de la ligne active ;
  - statuts UI et README mis a jour pour decrire ce marqueur.
  Fichiers touches: `src/renderer/app.js`, `README.md`,
  `.github/project-memory.md`.

- 2026-11-03 : navigation Tab depuis l’éditeur:
  - `Tab` depuis une ligne de l’éditeur redirige désormais le focus vers les
    options d’édition (mode de saisie en priorité), au lieu d’un blocage sec ;
  - comportement demandé pour atteindre rapidement les options comme
    "clavier braille".
  Fichiers touches: `src/renderer/app.js`, `README.md`,
  `.github/project-memory.md`.

- 2026-11-03 : harmonisation de `Entrée` en édition de ligne:
  - `Entrée` coupe désormais la ligne active à la position du curseur en
    `.gnp` **et** en `.gnb`, avec déplacement du texte après curseur vers la
    ligne suivante ;
  - en braille avec conversion texte→braille en temps réel, l'index de coupe
    est projeté depuis la position du curseur affichée vers la source texte
    avant recalcul des lignes braille.
  Fichiers touches: `src/renderer/app.js`, `README.md`,
  `.github/project-memory.md`.

- 2026-11-03 : verrouillage clavier de l’éditeur sur la navigation demandée:
  - désactivation explicite de `Tab` dans les lignes éditables pour empêcher
    le changement de ligne par tabulation ;
  - maintien du flux principal sur `Entrée` et `Ctrl/Cmd+Entrée`.
  Fichiers touches: `src/renderer/app.js`, `README.md`,
  `.github/project-memory.md`.

- 2026-11-03 : correctif du centrage en document braille (`Ctrl/Cmd+E`):
  - synchronisation du buffer source avant l'événement `input`
    programmatique pour éviter qu'une retraduction texte→braille efface les
    espaces de tête ajoutés par le centrage ;
  - résultat: les espaces de centrage restent visibles en document braille.
  Fichiers touches: `src/renderer/app.js`, `.github/project-memory.md`.

- 2026-11-03 : amélioration UX du centrage `Ctrl/Cmd+E`:
  - en document normal (`.gnp`), après centrage, le curseur est placé sur le
    début du texte centré au lieu de rester au début absolu de la ligne,
    afin de rendre le déplacement visuel plus évident ;
  - en document braille (`.gnb`), le comportement précédent est conservé
    (curseur au début de ligne) pour le contrôle des espaces de tête.
  Fichiers touches: `src/renderer/app.js`, `README.md`,
  `.github/project-memory.md`.

- 2026-10-31 : correction de build Linux AppImage:
  - ajout de l'icone PNG Linux `build/icons/app-icon.png` (derivee de
    `build/icons/app-icon.svg`) ;
  - mise a jour de `package.json` (`build.linux.icon`) pour eviter l'erreur
    `computeDesktopIcons` observee avec electron-builder ;
  - build Linux relance avec succes (`npm run dist:linux`).
  Fichiers touches: `package.json`, `build/icons/app-icon.png`,
  `.github/project-memory.md`.

- 2026-10-31 : adaptation de la sortie afficheur braille a la capacite de
  plage:
  - renderer mis a jour pour desactiver automatiquement l'option d'affichage
    externe si la capacite detectee (ou la configuration courante quand la
    capacite n'est pas remontee) est inferieure a 40 cellules ;
  - format tactile ajuste: les marqueurs `dots 1237` / `dots 4568` sont
    conserves, avec une exception sur afficheur 40 cellules ou la section
    `dots 1237 x/y dots 4568` est retiree ;
  - messages d'etat UI completes pour expliciter la capacite detectee et le
    mode de section compteur active/retiree.
  Fichiers touches: `src/renderer/app.js`, `README.md`,
  `.github/project-memory.md`.

- 2026-10-29 : extension de la sortie afficheur braille a Windows (NVDA):
  - ajout du service `src/main/nvda-windows-service.js` (bindings JS via
    `koffi`) vers `nvdaControllerClient*.dll`/`nvdaclient*.dll` ;
  - routage main/preload multi-plateforme (Linux BRLAPI / Windows NVDA) avec
    API generique `braille:display-*` et compatibilite des anciens canaux ;
  - renderer adapte pour activer la meme option de sortie sous Linux **et**
    Windows, avec messages d'etat contextuels ;
  - documentation README ajustee (prerequis NVDA Windows + details DLL).
  Fichiers touches: `src/main/nvda-windows-service.js`, `src/main/main.js`,
  `src/main/preload.js`, `src/renderer/app.js`, `src/renderer/index.html`,
  `README.md`, `.github/project-memory.md`.

- 2026-10-29 : finalisation de la configuration BRLAPI Linux en JavaScript
  direct:
  - dépendance `koffi` confirmée et conservée en `optionalDependencies` ;
  - service `src/main/brlapi-linux-service.js` fiabilisé avec fallback
    d'entrée TTY (`-1` puis `0`) pour compatibilité runtime ;
  - validation locale des appels `status` / `write` / `clear` avec succès.
  Fichiers touchés: `src/main/brlapi-linux-service.js`, `package.json`,
  `package-lock.json`, `.github/project-memory.md`.

- 2026-10-29 : ajout d'un mode d'affichage BRLAPI Linux pour l'aperçu
  tactile braille:
  - IPC ajoute (`status`/`write`/`clear`) entre renderer et main process ;
  - service Linux dedie en appel JavaScript direct vers `libbrlapi`
    (koffi), sans script Python ;
  - en document braille, synchro en temps reel de la ligne active vers
    l'afficheur avec format: `dots 1237` + `p#l#c#` + `dots 4568`, puis
    segment de comptage des caracteres/ligne avec marqueur de limite ;
  - activation manuelle par option dediee dans le panneau Nouveau document
    et par raccourci `Ctrl/Cmd+Maj+B` ;
  - nettoyage de la sortie BRLAPI a la fermeture document/hors mode braille.
  Fichiers touches: `src/main/main.js`, `src/main/preload.js`,
  `src/main/brlapi-linux-service.js`,
  `src/renderer/app.js`, `src/renderer/index.html`, `package.json`, `README.md`,
  `.github/project-memory.md`.

- 2026-10-30 : finalisation de l'import enrichi de styles texte pour
  documents externes:
  - parseur `.docx` (WordprocessingML) mis a jour pour conserver
    `gras/italique/soulignement` run par run via balises BFU ;
  - parseur `.odt/.odf` mis a jour avec resolution de styles ODF et gestion
    des spans imbriques pour conserver les emphases ;
  - parseur `.rtf` remplace par un parseur de groupes/commandes de controle
    avec preservation des transitions `b/i/ul` ;
  - ajout d'un avertissement utilisateur lors de l'import `.doc` legacy pour
    signaler les limites possibles de formatage.
  Fichiers touches: `src/main/gbs-document-service.js`,
  `src/renderer/app.js`, `.github/project-memory.md`.

- 2026-11-09 : correction de la fin de page imprimée sur les sauts forcés
  `Ctrl/Cmd+Entrée`:
  - traduction des segments sans pagination visuelle, puis pagination globale
    continue côté renderer ;
  - une fin de page imprimée n'impose plus un saut de page braille, les lignes
    restantes de la page braille active sont réutilisées ;
  - les lignes blanches terminales d'une page imprimée (avant `Ctrl/Cmd+Entrée`)
    sont retirées avant pagination pour insérer immédiatement le séparateur de
    la page imprimée suivante ;
  - repli de secours ajouté: si une traduction de production échoue sur un
    segment (ex. plantage liblouis), tentative automatique en mode preview
    pour terminer la traduction au lieu d'arrêter le flux ;
  - message de confirmation utilisateur et README alignés avec ce comportement.
  Fichiers touchés: `src/renderer/app.js`, `README.md`,
  `.github/project-memory.md`.
  Reste à faire ensuite: ajouter un test automatisé côté renderer pour couvrir
  ce scénario de pagination continue.

- 2026-11-09 : mitigation des erreurs de segmentation au lancement de la
  traduction:
  - les requêtes de traduction en mode production passent maintenant dans un
    processus enfant isolé ; un crash natif n'abat plus le processus principal
    Electron ;
  - en cas d'échec production, tentative automatique d'un repli preview dans
    le même mode isolé, avec message d'avertissement explicite ;
  - normalisation des messages d'erreur côté main pour éviter les retours
    textuels `undefined`/`null` quand la source de l'erreur est incomplète ;
  - journalisation persistante des erreurs de traduction Ctrl/Cmd+T dans un
    fichier local (`gbs-translation-errors.log`) via IPC main/preload, avec
    contexte de document et détails d'erreur pour analyse a posteriori ;
  - correctif renderer appliqué après lecture du log: remplacement de la
    référence invalide `segmentNativeFormatting` par
    `segmentNativeFormattingBase` dans la traduction segmentée, ce qui supprime
    l'erreur `ReferenceError: segmentNativeFormatting is not defined` au
    Ctrl/Cmd+T ;
  - les traductions preview restent directes pour conserver la réactivité en
    saisie.
  Fichiers touchés: `src/main/main.js`, `src/main/preload.js`,
  `src/main/braille-translate-worker.js`, `src/renderer/app.js`,
  `.github/project-memory.md`.
  Reste à faire ensuite: ajouter un test d'intégration IPC pour valider le
  comportement quand le worker se termine anormalement.

- 2026-10-29 : ajout de la prise en charge du centrage a l'import externe:
  - `.docx`: detection du centrage de paragraphe via `w:jc` direct et via
    styles de paragraphe (`word/styles.xml`) avec heritage ;
  - `.odt/.odf`: detection `fo:text-align=center` sur styles de paragraphe
    resolves (heritage inclus) ;
  - `.rtf`: detection des controles d'alignement (`\\qc`, `\\ql`, `\\qr`,
    `\\qj`, `\\pard`) ;
  - application finale: centrage des lignes marquees pendant l'import selon
    `charactersPerLine`, en tenant compte des balises BFU pour la largeur
    visible.
  Fichiers touches: `src/main/gbs-document-service.js`,
  `.github/project-memory.md`.

- 2026-10-29 : ajout des fonctionnalités "table des matières" et "volumes"
  dans la configuration de structure de pages:
  - UI: nouvelles options pour activer `contents`, inclure les numéros de page
    dans le sommaire, et découper la sortie en volumes avec un maximum de pages
    par volume ;
  - persistance: lecture/écriture des nouveaux paramètres dans les documents
    `.gnp/.gnb` ;
  - moteur natif: passage des options de sommaire vers `file2brl` avec noms de
    clés `outputFormat` documentés ;
  - génération braille: en mode volumes, création automatique de fichiers
    `-volNN.gnb` et ouverture du volume 1 dans l'éditeur.
  Fichiers touchés: `src/renderer/index.html`, `src/renderer/app.js`,
  `src/main/gbs-document-service.js`, `src/main/braille-service.js`,
  `src/main/braille-native-service.js`, `.github/project-memory.md`.

- 2026-10-29 : ajout du saut de page forcé par `Ctrl/Cmd+Entrée` dans
  l'éditeur normal (`.gnp`) avec marqueur interne persistant et adaptation du
  pipeline de traduction (preview + production) pour traduire par segments et
  réassembler avec des `\f`, ce qui garantit la rupture de page lors de la
  génération braille.
  Fichiers touchés: `src/renderer/app.js`, `.github/project-memory.md`.

- 2026-10-29 : finalisation de la pagination native `file2brl`:
  branchement des options de structure de pages vers les arguments natifs,
  ajout d'un repli de compatibilite en cas d'options non supportees, et
  conservation des sauts de page explicites (`\f`) en sortie native.
  Nettoyage du fichier temporaire residuel `file2brl.temp`.
  Fichiers touches: `src/main/braille-native-service.js`,
  `.github/project-memory.md`.

- 2026-10-29 : ajout d'une icone Windows dediee (source SVG versionnee +
  generation `.ico` via script npm), branchement de l'icone dans
  `electron-builder` (`win` + `nsis`), ajout d'un garde-fou de signature
  (`scripts/verify-win-signing-env.js`) et d'une commande de build signe
  `npm run dist:win:signed`.
  Validation locale effectuee: generation de `build/icons/app-icon.ico` puis
  build Windows NSIS+ZIP reussi.
  Fichiers touches: `build/icons/app-icon.svg`, `scripts/verify-win-signing-env.js`,
  `package.json`, `README.md`, `.github/project-memory.md`.

- 2026-10-29 : ajout du build Windows dédié `npm run dist:win` avec cibles
  `nsis` + `zip` (x64) dans `electron-builder`, documentation mise à jour,
  et validation locale du build avec génération des artefacts:
  `Galarneau Braille Suite-1.0.0-x64.exe` et
  `Galarneau Braille Suite-1.0.0-x64.zip`.
  Fichiers touchés: `package.json`, `README.md`,
  `.github/project-memory.md`.

- 2026-10-29 : activation du moteur natif `liblouisutdml` sous Linux en plus
  de Windows (suppression du verrou plateforme), ajout de la recherche du
  binaire `file2brl` via chemins projet/packagés/PATH, et préparation
  automatique des variables d'environnement de bibliothèques dynamiques
  (`LD_LIBRARY_PATH`/`DYLD_LIBRARY_PATH`) lors de l'exécution native.
  Messages UI harmonisés en multi-plateforme et documentation mise à jour.
  Fichiers touchés: `src/main/braille-native-service.js`,
  `src/renderer/app.js`, `README.md`, `native/README.md`,
  `.github/project-memory.md`.
  Reste a faire ensuite: ajouter/valider un bundle binaire Linux complet
  (`file2brl` + libs + tables) pour les distributions cibles du packaging.

- 2026-10-29 : stabilisation du parcours de build natif Windows via Podman
  (poste local WSL2), extraction de l'artefact `liblouisutdml-win64.zip`,
  puis installation du runtime natif complet dans le projet pour activer le
  moteur de production (exe + DLL + tables).
  Fichiers/dossiers touches: `native/liblouisutdml/bin/*`,
  `native/liblouisutdml/share/liblouis/tables/*`,
  `.github/project-memory.md`.
- 2026-10-26 : ajout du menu **Traduire** (traduction du document + bascule
  temps réel en case à cocher, `Ctrl/Cmd+Shift+T`).
- 2026-10-26 : ajout du centrage de ligne pour titres (`Ctrl/Cmd+E`) avec
  repositionnement du curseur au début de ligne pour vérifier les espaces.
- 2026-10-26 : ajout de l’option **Afficher les espaces** (`·`) pour contrôler
  visuellement le centrage de la ligne active.
- 2026-10-26 : refonte du démarrage en **Espace vide** (création masquée,
  ouverture via `Ctrl/Cmd+N`, focus initial sur la traduction braille).
- 2026-10-26 : ajout d’un texte expliquant l’origine du nom “Galarneau Braille
  Suite” sur le panneau d’accueil, affiché en texte normal et traduit en
  braille.
- 2026-10-26 : ajout de la configuration `electron-builder`, du script
  `dist:linux` et d’un chargement robuste des tables `liblouis` en contexte
  packagé (`asar`/`asar.unpacked`).
- 2026-10-27 : validation du binaire packagé (`linux-unpacked`) et de
  l’AppImage en mode `--appimage-extract-and-run`, sans erreur `liblouis`.
- 2026-10-28 : écran d’accueil allégé en retirant la mention explicite
  `fr-bfu-g2` dans les libellés visibles de la section braille d’accueil.
- 2026-10-28 : correction du clavier braille 8 points pour utiliser `F` sur le
  point 1 (et `S` sur le point 3) dans l’UI, la logique renderer et la
  documentation.
- 2026-10-28 : simplification du panneau d’accueil pour ne garder que les deux
  contenus (normal + braille), sans libellés de zone visibles ni bloc
  “Origine du nom”.
- 2026-10-28 : retrait du libellé restant “Texte braille d’accueil” sur la zone
  braille du panneau d’accueil.
- 2026-10-28 : suppression de la séparation de l’écran d’édition en deux
  sections de sortie; la traduction instantanée et la traduction complète
  utilisent maintenant une vue traduite unique, intégrée dans l’éditeur.
- 2026-10-28 : migration du format de documents vers `.gnp` (normal) et `.gnb`
  (braille), avec choix du type à la création et génération automatique du
  fichier `.gnb` compagnon lors d’une traduction complète `.gnp` -> braille.
  Fichiers touchés: `src/renderer/index.html`, `src/renderer/app.js`,
  `src/main/gbs-document-service.js`, `src/renderer/styles.css`, `README.md`.
- 2026-10-28 : retrait du panneau de traduction séparé dans l’éditeur; la
  traduction temps réel et la traduction complète s’affichent maintenant
  directement sous chaque ligne du document.
  Fichiers touchés: `src/renderer/index.html`, `src/renderer/app.js`,
  `src/renderer/styles.css`, `README.md`.
- 2026-10-28 : mode braille (`.gnb`) ajusté pour un affichage braille-only;
  la saisie standard est désactivée, la sortie texte de traduction est masquée,
  et l’aide UI/documentation reflète ce comportement.
  Fichiers touchés: `src/renderer/app.js`, `src/renderer/index.html`,
  `README.md`.
- 2026-10-28 : ajustement du mode braille (`.gnb`) pour autoriser à nouveau la
  saisie clavier standard avec conversion liblouis instantanée dans chaque
  ligne; maintien de l’absence de panneau de traduction séparé.
  Fichiers touchés: `src/renderer/app.js`, `README.md`.
- 2026-10-28 : remplacement des libellés longs de position de ligne par un
  format compact `p#l#c#` affiché à gauche de chaque ligne, avec mise à jour
  dynamique selon la position du curseur et la sortie effectivement affichée
  (incluant l’abrègement braille).
  Fichiers touchés: `src/renderer/app.js`, `src/renderer/styles.css`,
  `README.md`.
- 2026-10-28 : ajustement accessibilité du repère `p#l#c#` pour éviter les
  annonces répétées à chaque frappe; le repère reste visuel à gauche, sans
  notification vocale dynamique du numéro de ligne/caractère.
  Fichiers touchés: `src/renderer/app.js`, `README.md`.
- 2026-10-28 : suppression de l’annonce continue du compteur `x/y` et retrait
  du libellé verbal “Zone d’édition …” sur les lignes; compteur conservé en
  visuel uniquement, repère compact maintenu à gauche.
  Fichiers touchés: `src/renderer/app.js`, `README.md`.
- 2026-10-28 : correction d’affichage du repère gauche pour garantir le format
  complet `l#p#c#` (incluant `c` + numéro), suppression du nom accessible
  `p#l#` du champ pour éviter les confusions de lecture.
  Fichiers touchés: `src/renderer/app.js`, `src/renderer/styles.css`,
  `README.md`.
- 2026-10-28 : repère `l#p#c#` reconnecté au champ d’édition via
  `aria-labelledby` pour réapparition sur la plage braille, tout en conservant
  le compteur `x/y` masqué aux annonces (`aria-hidden`).
  Fichiers touchés: `src/renderer/app.js`.
- 2026-10-28 : correction de la conversion braille instantanée en mode saisie
  standard `.gnb` avec un buffer texte source par ligne (évite de retraduire le
  braille déjà affiché), ce qui rétablit l’abrègement à mesure de la frappe et
  au plus tard à l’espace selon les règles de table.
  Fichiers touchés: `src/renderer/app.js`, `README.md`.
- 2026-10-28 : ordre du repère visuel ajusté selon préférence utilisateur en
  `l#p#c#` (ligne, page, caractère) au lieu de `p#l#c#`.
  Fichiers touchés: `src/renderer/app.js`, `README.md`,
  `.github/project-memory.md`.
- 2026-10-28 : `Ctrl/Cmd+T` sur un document normal `.gnp` en direction
  texte->braille bascule maintenant automatiquement l’éditeur sur le document
  braille; la génération `.gnb` est conservée si possible, sinon bascule en
  braille non enregistré.
  Fichiers touchés: `src/renderer/app.js`, `README.md`,
  `.github/project-memory.md`.
- 2026-10-28 : ajout du flux de renvoi automatique des mots et de pagination
  automatique pendant la saisie (normal et braille), avec conservation du
  buffer source en mode braille pour garder la traduction instantanée cohérente.
  Fichiers touchés: `src/renderer/app.js`, `README.md`,
  `.github/project-memory.md`.
- 2026-10-28 : amélioration de rigueur du wrapping en mode braille: la coupure
  de ligne utilise désormais la longueur braille traduite réellement affichée
  (après abrègement), pour éviter les retours anticipés basés sur la longueur
  du texte source.
  Fichiers touchés: `src/renderer/app.js`, `README.md`,
  `.github/project-memory.md`.
- 2026-10-28 : séparation stricte des comportements normal vs braille dans
  l’éditeur: le mode normal n’applique plus les limites braille (zone large,
  sans repère `l#p#c#` ni compteur `x/y`), le mode braille conserve les
  contraintes et la pagination; ajout de la navigation `Flèche haut/bas` et
  `Entrée` entre lignes; redimensionnement de la traduction complète selon
  caractères/ligne et lignes/page braille avant bascule `.gnp` -> `.gnb`.
  Fichiers touchés: `src/renderer/app.js`, `README.md`,
  `.github/project-memory.md`.
- 2026-10-28 : ajustement de la navigation: les lignes vides intermédiaires
  redeviennent accessibles en déplacement vertical, mais la descente est
  bloquée dans la zone vide de fin de contenu; maintien de `Entrée` en mode
  normal pour couper la ligne à la position du curseur.
  Fichiers touchés: `src/renderer/app.js`, `README.md`,
  `.github/project-memory.md`.
- 2026-10-28 : conformité BFU renforcée pour l’emphase (italique, gras,
  soulignement) : exposition IPC du support de styles par table, désactivation
  des actions non supportées, aide contextuelle de conformité, alias de
  balises françaises supplémentaires (`<souligner>`, `<surligner>`, etc.),
  et harmonisation du libellé UI vers « soulignement ».
  Références documentées dans le README (tables `fr-bfu-g2.ctb` /
  `fr-bfu-comp6.utb` + manuel liblouis).
  Fichiers touchés: `src/main/braille-service.js`, `src/main/main.js`,
  `src/main/preload.js`, `src/renderer/app.js`, `src/renderer/index.html`,
  `README.md`, `.github/project-memory.md`.
- 2026-10-28 : ajout d’une configuration workspace Copilot pour approuver
  automatiquement les actions d’agent dans ce dépôt (permissions par défaut en
  auto-approbation, terminal, modifications de fichiers et URLs).
  Fichiers touchés: `.vscode/settings.json`, `.github/project-memory.md`.
- 2026-10-28 : vérification web des règles BFU (tables `fr-bfu-comp6.utb` et
  `fr-bfu-g2.ctb`, documentation liblouis) et alignement de l’application:
  correction de l’allocation/écriture `typeform` en 16 bits, ajout alias
  `<surlignage>`, enrichissement de l’aide UI et de la documentation de
  conformité.
  Fichiers touchés: `src/main/braille-service.js`, `src/renderer/app.js`,
  `src/renderer/index.html`, `README.md`, `.github/project-memory.md`.
- 2026-10-28 : ajout d’un fallback de compatibilité pour l’emphase
  soulignement BFU: lorsque `underline` ne produit pas d’indicateur visible,
  application du masque `italic` pour conserver un marquage braille explicite
  sur `<u>`, `<surligne>` et `<surlignage>`.
  Fichiers touchés: `src/main/braille-service.js`, `src/renderer/app.js`,
  `README.md`, `.github/project-memory.md`.
- 2026-10-28 : harmonisation des commandes de mise en forme BFU selon le
  vocabulaire « surligner » : menu « Appliquer le surlignage BFU » en
  `Ctrl/Cmd+U`, bouton « Surligner BFU », alias d’action renderer
  `apply-highlight-style` (compatible avec `apply-underline-style`), et
  documentation mise à jour.
  Fichiers touchés: `src/main/main.js`, `src/renderer/app.js`,
  `src/renderer/index.html`, `README.md`, `.github/project-memory.md`.
- 2026-10-28 : ajout du basculement d’italique au clavier en mode normal:
  `Ctrl/Cmd+I` sur curseur seul alterne ouverture/fermeture italique,
  notifications « activé/désactivé », et classe visuelle dynamique
  `is-italic-mode` sur la ligne active.
  Fichiers touchés: `src/renderer/app.js`, `src/renderer/styles.css`,
  `README.md`, `.github/project-memory.md`.
- 2026-10-28 : correction du suivi du repère `l#p#c#` pendant les déplacements
  horizontaux au clavier (`Flèche gauche/droite`, `Home`, `End`) avec
  rafraîchissement du marqueur après mouvement du curseur.
  Fichier touché: `src/renderer/app.js`, `.github/project-memory.md`.
- 2026-10-28 : ajout de l’import multi-format à l’ouverture de document
  (`.doc`, `.docx`, `.odt`, `.odf`, `.pdf`, `.txt`, `.md`) avec extraction
  texte par type, conversion en document interne `.gnp`, et passage des
  options d’import (table, lignes/page, caracteres/ligne) via IPC.
  Fichiers touchés: `src/main/gbs-document-service.js`, `src/main/main.js`,
  `src/main/preload.js`, `src/renderer/app.js`, `src/renderer/index.html`,
  `README.md`, `package.json`, `package-lock.json`, `.github/project-memory.md`.
- 2026-10-28 : extension de l’import multi-format avec ajout explicite de
  `.rtf` et `.markdown` (sélecteur de fichiers, extraction texte, documentation)
  et passage de maintenance npm de sécurité (`npm audit fix --force`) menant à
  `0 vulnerability`.
  Fichiers touchés: `src/main/gbs-document-service.js`, `src/renderer/index.html`,
  `README.md`, `package.json`, `package-lock.json`, `.github/project-memory.md`.
- 2026-10-29 : transition moteur de traduction en architecture hybride:
  - nouveau service natif Windows `file2brl.exe` (liblouisutdml) pour la
    traduction complete (`executionMode=production`) ;
  - conservation explicite du preview et de la saisie instantanee en
    `liblouis-js` (`executionMode=preview`) ;
  - fallback automatique vers `liblouis-js` si moteur natif indisponible,
    avec message utilisateur ;
  - packaging Electron ajuste pour embarquer `native/**/*`.
  Fichiers touchés: `src/main/braille-native-service.js`,
  `src/main/braille-service.js`, `src/main/main.js`, `src/main/preload.js`,
  `src/renderer/app.js`, `native/README.md`, `package.json`, `README.md`,
  `.github/project-memory.md`.
- 2026-11-05 : correctif rendu/navigation dans les tableaux braille en saisie
  standard avec traduction instantanee:
  - navigation `Flèche gauche/droite` rendue strictement colonne-par-colonne
    via index de cellule (plus de sauts incoherents selon la position du
    curseur) ;
  - en ligne de tableau, la traduction instantanee conserve la ligne editee,
    le caret courant et recale le curseur dans une cellule editable apres
    rerendu ;
  - pour les lignes de tableau, la source utilise la valeur de ligne courante
    afin d'eviter l'ajout force en fin de ligne pendant la frappe.
  Fichiers touchés: `src/renderer/app.js`, `.github/project-memory.md`.
  Decision fonctionnelle: prioriser la stabilite d'edition des cellules de
  tableau (position du curseur + saisie entre delimiteurs) en mode temps reel.
  Reste a valider: test manuel complet d'edition tableau (`.gnb`) sur plusieurs
  colonnes, avec et sans entete, en verifiant aussi `Home`/`End`.
- 2026-11-05 : correction de regression sur la ligne de debut de tableau
  (document braille en saisie standard): conversion instantanee adaptee aux
  lignes de tableau par segments de cellule (texte non braille -> braille) en
  preservant les caracteres de structure, ce qui retablit l'ecriture sur la
  ligne de debut et maintient la saisie entre delimiteurs.
  Fichiers touchés: `src/renderer/app.js`, `.github/project-memory.md`.
  Decision fonctionnelle: les lignes de tableau ne passent plus par la
  retraduction complete de la ligne structurelle; seule la partie texte des
  cellules est convertie.
  Reste a valider: scenario manuel de frappe continue sur premiere ligne de
  contenu et sur ligne de debut de tableau continue apres saut de page.
- 2026-11-05 : verrou d'edition des lignes structurelles de tableau
  (dont la ligne de debut): les bordures ne sont plus modifiables au clavier
  (frappe, collage, suppression, entree) et une tentative d'edition deplace
  automatiquement le focus vers une ligne de cellules editable du meme tableau.
  Fichiers touchés: `src/renderer/app.js`, `.github/project-memory.md`.
  Decision fonctionnelle: conserver strictement l'integrite de la structure
  du tableau et limiter l'edition au contenu des cellules.
  Reste a valider: test manuel de la suppression de tableau (`Delete` sur
  premiere ligne structurelle) pour confirmer que la boite de confirmation
  reste prioritaire.
- 2026-11-05 : ajustement de navigation horizontale en cellule de tableau:
  `Flèche gauche/droite` se deplace caractere par caractere dans le texte tape,
  et le saut vers colonne precedente/suivante ne se declenche qu'au contact
  d'un delimiteur de colonne.
  Fichiers touchés: `src/renderer/app.js`, `.github/project-memory.md`.
  Decision fonctionnelle: conserver l'edition fine du texte en cellule sans
  perdre la navigation inter-colonnes.
  Reste a valider: test manuel du passage de colonne via fleches au bord des
  cellules avec contenu court et contenu long.
- 2026-11-05 : correction de l'ordre apparent des lettres en saisie tableau:
  recalage du curseur apres traduction instantanee selon la longueur du prefixe
  reellement converti en braille (au lieu d'un index brut avant conversion).
  Ce correctif stabilise l'ordre de frappe quand la traduction ajoute des
  indicateurs (ex. majuscules).
  Fichiers touchés: `src/renderer/app.js`, `.github/project-memory.md`.
  Decision fonctionnelle: la position du caret suit la sortie braille traduite,
  pas la position texte source brute.
  Reste a valider: test manuel de saisie avec majuscules et ponctuation dans
  plusieurs cellules consecutives.
- 2026-11-05 : regle de passage inter-colonnes ajustee sur les bornes texte:
  en ligne de contenu de tableau, `Flèche gauche/droite` reste caractere par
  caractere dans la cellule et ne passe a la colonne voisine qu'au `debut`
  (`gauche`) ou a la `fin` (`droite`) du texte utile de la cellule (hors
  espaces de remplissage).
  Fichiers touchés: `src/renderer/app.js`, `.github/project-memory.md`.
  Decision fonctionnelle: eviter tout basculement automatique de colonne avant
  intention explicite de l'utilisateur au bord du texte.
  Reste a valider: scenario manuel avec cellules vides et cellules contenant
  des espaces internes.
- 2026-11-05 : conservation des espaces de fin en cellule de tableau:
  suppression du trim des cellules lors du parsing/rebuild et calcul de largeur
  de colonnes base sur la longueur reelle des cellules. Ce changement permet
  l'agrandissement de la colonne pendant la frappe (ex. `T`, espace, `e`) sans
  deplacement involontaire vers la cellule suivante.
  Fichiers touchés: `src/renderer/app.js`, `src/renderer/braille-table-layout.js`,
  `.github/project-memory.md`.
  Decision fonctionnelle: traiter les espaces de fin saisis comme du contenu
  utilisateur en mode edition tableau.
  Reste a valider: saisie de plusieurs espaces consecutifs en fin de cellule
  sur plusieurs lignes de tableau.
- 2026-11-05 : correction du saut de caret apres rerendu de ligne de tableau:
  ajout d'un mecanisme de restauration du curseur qui suspend une fois le
  recalage automatique sur delimiteur apres traduction instantanee. Le caret
  reste a la position logique de frappe et n'est plus pousse vers la colonne
  suivante quand la cellule vient d'etre rerendue.
  Fichiers touchés: `src/renderer/app.js`, `.github/project-memory.md`.
  Decision fonctionnelle: ne pas appliquer le snap de delimiteur pendant la
  restauration programmee du curseur apres rerendu.
  Reste a valider: saisie continue lettre par lettre en debut de cellule avec
  conversion immediate (sans espace) sur colonnes de largeur minimale.
- 2026-11-05 : correction des indicateurs de type "integral" en frappe continue
  dans les cellules de tableau: abandon de la retraduction par segments isoles
  et passage a une conversion cellule complete (retrotraduction braille->texte
  du contenu existant, fusion avec la nouvelle frappe, puis traduction
  texte->braille de la cellule entiere).
  Fichiers touchés: `src/renderer/app.js`, `.github/project-memory.md`.
  Decision fonctionnelle: conserver le contexte lexical de la cellule pour
  eviter les marqueurs appliques lettre par lettre.
  Reste a valider: saisie rapide de mots mixtes (majuscules/minuscules) dans
  plusieurs colonnes consecutives.
- 2026-11-05 : regle explicite sur l'indicateur point 6 en cellule tableau:
  si le contenu source de cellule contient plus d'une lettre, l'indicateur
  point 6 en tete de cellule est retire apres traduction. Cette regle est
  appliquee aussi au prefixe utilise pour recalage du curseur afin de garder
  la coherence de position.
  Fichiers touchés: `src/renderer/app.js`, `.github/project-memory.md`.
  Decision fonctionnelle: en saisie continue de mot, privilegier une sortie
  sans marqueur de lettre isolee en tete de cellule.
  Reste a valider: cas des mots commençant par majuscule selon les attentes
  metier (conserver ou retirer le point 6).
- 2026-11-05 : renforcement point 6 avant majuscule en edition tableau:
  la suppression vise maintenant explicitement le motif `point6 + indicateur
  majuscule` en tete de cellule, avec un fallback base sur la frappe texte
  courante de la cellule quand la reconstruction source est ambigue.
  Fichiers touchés: `src/renderer/app.js`, `.github/project-memory.md`.
  Decision fonctionnelle: retirer prioritairement le point 6 redondant avant
  l'indicateur majuscule en saisie continue.
  Reste a valider: sequences `Majuscule + lettre` tapees rapidement en debut de
  cellule sur plusieurs colonnes.
- 2026-11-05 : correction structurelle de la saisie tableau en mode standard:
  abandon de la retrotraduction braille->texte pour reconstituer les cellules
  pendant la frappe (instable en BFU) et remplacement par une source cellule
  persistante basee sur la frappe utilisateur. Chaque cellule est retraduite a
  partir de cette source, ce qui supprime les artefacts de type `point 6`
  parasite en debut de mot (ex. `Test`).
  Fichiers touchés: `src/renderer/app.js`, `.github/project-memory.md`.
  Decision fonctionnelle: la verite d'edition d'une cellule est la source texte
  conservee par cellule, pas la ligne braille affichee.
  Reste a valider: editions au milieu d'un mot existant (insertion/suppression)
  dans une cellule deja remplie.
- 2026-11-05 : stabilisation du curseur en edition tableau pendant la frappe:
  le snap automatique sur delimiteur interne est desactive sur les evenements
  `focus`/`selectionchange` (il reste actif pour les protections d'edition),
  afin d'eviter le saut implicite vers la colonne suivante quand le caret est
  en fin de cellule apres rerendu.
  Fichiers touchés: `src/renderer/app.js`, `.github/project-memory.md`.
  Decision fonctionnelle: le passage inter-colonnes doit rester intentionnel
  (fleches/edition), pas provoque par un recalage automatique.
  Reste a valider: frappe continue sur la premiere cellule d'un tableau a
  plusieurs colonnes avec majuscule initiale.
- 2026-11-05 : correction des espaces parasites en saisie de cellule tableau:
  la reconstruction source d'une cellule editee utilise maintenant l'evenement
  de saisie (`insert`/`delete`) au lieu de reutiliser les espaces visuels de
  remplissage de colonne. Cela evite d'injecter des espaces avant la lettre
  suivante (symptome observe des la 2e lettre).
  Fichiers touchés: `src/renderer/app.js`, `.github/project-memory.md`.
  Decision fonctionnelle: les espaces de layout d'une colonne ne doivent jamais
  devenir du contenu source de la cellule.
  Reste a valider: insertion au milieu d'un mot et collage multi-caracteres
  dans une cellule deja remplie.
- 2026-11-05 : durcissement anti-espaces de layout dans les tableaux:
  les cellules source composees uniquement d'espaces sont neutralisees avant
  reconstruction de la frappe, et la creation de tableau initialise des sources
  de cellules vides explicites (au lieu des espaces de padding affiches).
  Fichiers touchés: `src/renderer/app.js`, `.github/project-memory.md`.
  Decision fonctionnelle: un espace de mise en page ne peut jamais etre
  interprete comme un espace utilisateur, ce qui supprime le cas `T e` parasite
  et la persistence associee du point 6.
  Reste a valider: edition d'un tableau deja ouvert avant correctif (session
  courante) vs tableau nouvellement cree.
- 2026-11-05 : retrait agressif du point 6 en tete de cellule pendant la frappe:
  en edition tableau, la normalisation retire desormais tout prefixe point 6
  restant quand la cellule represente un mot en cours (plus d'une lettre), et
  la reconstruction source en insertion sans `event.data` preserve explicitement
  le prefixe deja tape pour eviter les regressions `T` -> `e`.
  Fichiers touchés: `src/renderer/app.js`, `.github/project-memory.md`.
  Decision fonctionnelle: en saisie continue d'un mot, un point 6 de lettre
  isolee ne doit pas rester bloque en tete de cellule.
  Reste a valider: frappe rapide majuscule puis minuscules dans une meme cellule
  sur tableau existant deja ouvert.
- 2026-11-05 : tentative de visibilite immediate des lettres pendant
  contractions BFU (strategie retiree ensuite): un fallback visuel avait ete
  ajoute pour forcer l'affichage de la 2e frappe, mais il a ete abandonne au
  profit du rendu BFU normal + nettoyage au changement de colonne.
  Fichiers touchés: `src/renderer/app.js`, `.github/project-memory.md`.
- 2026-11-05 : retour au rendu BFU normal pendant la frappe + nettoyage sur
  changement de colonne: la cellule est traduite normalement en direct, puis
  quand le curseur quitte une colonne, le point 6 de tete est retire uniquement
  pour la cellule quittée si elle contient plus d'une lettre. Le caret est
  restaure dans la cellule d'arrivee apres rerendu.
  Fichiers touchés: `src/renderer/app.js`, `src/renderer/braille-table-layout.js`,
  `tests/braille-table-layout.test.js`, `.github/project-memory.md`.
  Decision fonctionnelle: separer l'affichage live (normal table active) et la
  normalisation CBFU de fin de cellule (au changement de colonne).
  Ajustement de layout: les largeurs de colonnes ignorent les espaces de
  padding en fin de cellule, ce qui permet aux separateurs de se recoller au
  texte apres suppression.
  Reste a valider: frappe `T` puis `e` en cellule, puis deplacement vers la
  colonne suivante pour confirmer disparition du point 6 et repositionnement
  immediat des separateurs.
- 2026-11-05 : ajustement des lignes de bordure/entete avec indicateurs de
  colonnes: les lignes de debut, de separation (incluant la ligne de fin de
  rang d'entete) et de fin sont maintenant reconstruites avec des separateurs
  de colonnes a chaque colonne, et se recalculent avec la meme largeur que les
  lignes de cellules.
  Fichiers touchés: `src/renderer/app.js`, `.github/project-memory.md`.
  Decision fonctionnelle: les lignes structurelles suivent le meme mouvement de
  colonnes que le contenu (entete et corps), pour garder les indicateurs colles
  a gauche/droite du texte.
  Reste a valider: tableau avec entete (`<tableau ... e>`) en frappe + effacement
  pour confirmer recalage simultane debut/entete/fin.
- 2026-11-05 : correction du format structurel demande pour l'entete/tableau:
  retour aux lignes pleines pour les bordures de debut et de fin (et ligne
  pleine de fin d'entete), avec conservation de la ligne de contenu vide a
  separateurs de colonnes pour saisir le texte d'entete. Le recalage dynamique
  des largeurs reste actif.
  Fichiers touchés: `src/renderer/app.js`, `.github/project-memory.md`.
  Decision fonctionnelle: modele attendu = ligne pleine + ligne de cellules +
  ligne pleine, sans separateurs internes sur les lignes pleines.
  Reste a valider: rendu visuel exact sur creation de tableau avec entete,
  puis apres saisie/effacement dans entete et corps.

## Prochaine étape naturelle

- Ajouter des outils de balisage sémantique pour les niveaux de titres et les
  adaptations de tableaux; le niveau structurel ne se déduit pas de façon
  fiable du texte brut. Évaluer une correction contrôlée des accents manquants
  dans les majuscules.
