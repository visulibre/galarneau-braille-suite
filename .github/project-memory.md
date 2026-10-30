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
  saut de page forcé enregistré dans le document, pris en charge en preview et
  en traduction complète via segmentation (jointure par `\f`) pour imposer la
  rupture de page braille/imprimée.
- Ouverture étendue des fichiers: support natif `.gnp`/`.gnb`/`.gbs` conservé,
  avec import texte de documents externes `.doc`, `.docx`, `.odt`, `.odf`,
  `.pdf`, `.rtf`, `.txt`, `.md`, `.markdown` convertis automatiquement en
  document normal interne.
- Import enrichi des emphases bureautiques: conservation de `gras/italique/
  soulignement` sur `.docx`, `.odt/.odf` et `.rtf` via conversion en balises
  BFU (`<b>`, `<i>`, `<u>`) avant traduction. Les fichiers `.doc` legacy
  restent pris en charge avec avertissement explicite sur les limites
  possibles de récupération de formatage.
- Import enrichi de l'alignement: conservation du centrage de paragraphes
  sur `.docx`, `.odt/.odf` et `.rtf`, converti en centrage effectif des
  lignes importees selon la largeur (`charactersPerLine`) du document cible.
- Passage de maintenance npm appliqué: dépendances de build migrées vers
  `electron@^45.1.0` et `electron-builder@^26.18.0`, audit npm final à
  `0 vulnerability`.

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
  - `Entrée` en braille (`.gnb`) descend à la ligne suivante, sans entrer dans la zone vide de fin de contenu.
- Outil “Afficher les espaces” avec repère visuel `·` sur la ligne active.
- Après centrage, curseur replacé au début de ligne pour vérifier les espaces
  en tête (utile afficheur braille).

## Fichiers clés

- `src/main/main.js`: menus, actions, raccourcis.
- `src/main/preload.js`: pont IPC sécurisé.
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

## Prochaine étape naturelle

- Ajouter des tests automatiques dédiés à la mise en forme BFU (balises,
  emphases multi-mots, tables non supportées) pour sécuriser les régressions.
