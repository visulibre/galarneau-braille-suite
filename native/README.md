# Moteur natif (liblouisutdml)

Ce dossier permet d'activer la traduction complete via `file2brl`
(`file2brl.exe` sous Windows) tout en conservant le preview en `liblouis-js`.

## Structure attendue

```text
native/
  liblouisutdml/
    bin/
      file2brl.exe  (Windows)
      file2brl      (Linux)
    share/
      liblouis/
        tables/
          unicode.dis
```

## Variante par plateforme/architecture (optionnelle)

```text
native/
  liblouisutdml/
    linux-x64/
      bin/
        file2brl
      share/
        liblouis/
          tables/
            unicode.dis
```

## Variables d'environnement supportees

- `GBS_LIBLOUISUTDML_FILE2BRL`: chemin complet vers `file2brl`/`file2brl.exe`.
- `GBS_LIBLOUISUTDML_BIN`: dossier contenant `file2brl`/`file2brl.exe`.
- `GBS_LIBLOUIS_TABLES_DIR` (optionnel): chemin vers les tables liblouis
  (doit contenir `unicode.dis`).

Sous Linux, le binaire doit etre executable (`chmod +x .../file2brl`).

Si le moteur natif est indisponible, l'application revient automatiquement a
`liblouis-js` pour eviter un blocage de la traduction.
