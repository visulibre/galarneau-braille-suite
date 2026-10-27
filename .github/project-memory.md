# Mémoire projet — Galarneau Braille Suite

## État actuel

- Application Electron + liblouis-js fonctionnelle.
- Version projet: `1.0.0`.
- Workflow au démarrage:
  - écran **Espace vide** affiché ;
  - création de document masquée ;
  - `Ctrl/Cmd + N` ouvre le panneau de création ;
  - focus initial sur la zone de traduction braille d’accueil.
- Message d’accueil affiché en texte normal **et** traduit en braille
  (`fr-bfu-g2`):
  - `galarneau braille suite version 1.0 en la mémoire de Roland Galarneau.`
- Panneau d’accueil enrichi avec un texte **Origine du nom** en français et sa
  traduction braille (`fr-bfu-g2`).
- Packaging configuré avec **electron-builder** pour générer un exécutable
  Linux AppImage.

## Fonctions déjà en place

- Documents `.gbs` avec persistance de la configuration:
  - table braille, lignes/page, caractères/ligne, direction ;
  - mode de saisie (`text` / `braille-eight-key`) ;
  - traduction temps réel ;
  - affichage des espaces visibles.
- Menu **Fichier**: Nouveau, Ouvrir, Enregistrer, Enregistrer sous.
- Menu **Traduire**:
  - Traduire le document (`Ctrl/Cmd + T`) ;
  - bascule temps réel en case à cocher (`Ctrl/Cmd + Shift + T`).
- Menu **Édition**:
  - Centrer la ligne active (`Ctrl/Cmd + E`).
- Saisie braille clavier 8 points:
  - `S D F J K L A ;` pour points `1..8`.
- Aperçu braille en direct.
- Outil “Afficher les espaces” avec repère visuel `·` sur la ligne active.
- Après centrage, curseur replacé au début de ligne pour vérifier les espaces
  en tête (utile afficheur braille).

## Fichiers clés

- `src/main/main.js`: menus, actions, raccourcis.
- `src/main/preload.js`: pont IPC sécurisé.
- `src/main/braille-service.js`: traduction liblouis.
- `src/main/gbs-document-service.js`: lecture/écriture `.gbs`.
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

## Prochaine étape naturelle

- Ajouter d’autres options de traitement de texte (par exemple aligner à gauche,
  aligner à droite) avec la même logique d’accessibilité.
