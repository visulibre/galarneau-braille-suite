(function exposeBrailleTableTag(root, createApi) {
  const api = createApi();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  root.GbsBrailleTableTag = api;
})(globalThis, function createBrailleTableTagApi() {
  const MIN_COLUMNS = 1;
  const MAX_COLUMNS = 32;
  const MIN_ROWS = 1;
  const MAX_ROWS = 200;
  const TAG_PATTERN = /^\s*<tableau\s+c\s*=\s*(\d+)\s+r\s*=\s*(\d+)(?:\s+(e))?\s*>\s*$/iu;
  const TAG_PREFIX_PATTERN = /^\s*<tableau\b/iu;

  function parse(sourceText) {
    if (typeof sourceText !== "string" || !TAG_PREFIX_PATTERN.test(sourceText)) {
      return null;
    }

    const match = TAG_PATTERN.exec(sourceText);
    if (!match) {
      return {
        valid: false,
        error: "Balise invalide. Format attendu : <tableau c=3 r=4 e> (e est facultatif).",
      };
    }

    const columnCount = Number.parseInt(match[1], 10);
    const rowCount = Number.parseInt(match[2], 10);
    if (columnCount < MIN_COLUMNS || columnCount > MAX_COLUMNS) {
      return {
        valid: false,
        error: `Le nombre de colonnes doit être entre ${MIN_COLUMNS} et ${MAX_COLUMNS}.`,
      };
    }
    if (rowCount < MIN_ROWS || rowCount > MAX_ROWS) {
      return {
        valid: false,
        error: `Le nombre de rangées doit être entre ${MIN_ROWS} et ${MAX_ROWS}.`,
      };
    }

    return {
      valid: true,
      columnCount,
      rowCount,
      includeHeaderRow: match[3] !== undefined,
    };
  }

  return Object.freeze({ parse });
});
