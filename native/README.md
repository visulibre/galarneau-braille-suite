# Moteur natif Windows (liblouisutdml)

Ce dossier permet d'activer la traduction complete via `file2brl.exe`
(liblouisutdml) tout en conservant le preview en `liblouis-js`.

## Structure attendue

```text
native/
  liblouisutdml/
    bin/
      file2brl.exe
```

## Variables d'environnement supportees

- `GBS_LIBLOUISUTDML_FILE2BRL`: chemin complet vers `file2brl.exe`.
- `GBS_LIBLOUISUTDML_BIN`: dossier contenant `file2brl.exe`.
- `GBS_LIBLOUIS_TABLES_DIR` (optionnel): chemin vers les tables liblouis
  (doit contenir `unicode.dis`).

Si le moteur natif est indisponible, l'application revient automatiquement a
`liblouis-js` pour eviter un blocage de la traduction.
