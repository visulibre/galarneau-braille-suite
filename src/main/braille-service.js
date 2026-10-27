const path = require("node:path");
const liblouis = require("liblouis");

const BRAILLE_TABLES = Object.freeze([
  {
    id: "fr-fr-g1",
    label: "Français (France) — braille intégral",
    table: "tables/unicode.dis,tables/fr-fr-g1.utb",
  },
  {
    id: "fr-ca-g1",
    label: "Français (Canada) — braille intégral",
    table: "tables/unicode.dis,tables/fr-ca-g1.utb",
  },
  {
    id: "fr-bfu-g2",
    label: "Français BFU — braille abrégé",
    table: "tables/unicode.dis,tables/fr-bfu-g2.ctb",
  },
  {
    id: "en-ueb-g1",
    label: "Anglais UEB — braille intégral",
    table: "tables/unicode.dis,tables/en-ueb-g1.ctb",
  },
]);

const SUPPORTED_DIRECTIONS = Object.freeze(["text-to-braille", "braille-to-text"]);
const DEFAULT_TABLE = BRAILLE_TABLES[0].table;
let isTableLoadingReady = false;
let tableLoadingFailure = null;

function ensureTableLoadingReady() {
  if (isTableLoadingReady) {
    return;
  }

  if (tableLoadingFailure) {
    throw tableLoadingFailure;
  }

  try {
    const buildPath = require.resolve("liblouis-build");
    const tableFolder = path.resolve(path.dirname(buildPath), "tables");
    liblouis.enableOnDemandTableLoading(tableFolder);
    isTableLoadingReady = true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    tableLoadingFailure = new Error(
      `Impossible d'initialiser le chargement des tables liblouis: ${reason}`,
    );
    throw tableLoadingFailure;
  }
}

function listTables() {
  ensureTableLoadingReady();
  return BRAILLE_TABLES.map(({ id, label, table }) => ({ id, label, table }));
}

function ensureValidPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new TypeError("La requête de traduction est invalide.");
  }

  if (!SUPPORTED_DIRECTIONS.includes(payload.direction)) {
    throw new TypeError("Le sens de traduction demandé est invalide.");
  }

  if (typeof payload.inputText !== "string") {
    throw new TypeError("Le texte d'entrée doit être une chaîne de caractères.");
  }

  const table = payload.table ?? DEFAULT_TABLE;
  if (typeof table !== "string" || table.length === 0) {
    throw new TypeError("La table de traduction est invalide.");
  }

  if (!BRAILLE_TABLES.some((entry) => entry.table === table)) {
    throw new TypeError("La table de traduction demandée n'est pas supportée.");
  }
}

function translate(payload) {
  ensureTableLoadingReady();
  ensureValidPayload(payload);

  const table = payload.table ?? DEFAULT_TABLE;
  const inputText = payload.inputText;
  const outputText =
    payload.direction === "text-to-braille"
      ? liblouis.translateString(table, inputText)
      : liblouis.backTranslateString(table, inputText);

  if (typeof outputText !== "string") {
    throw new Error("La traduction a échoué sans message exploitable.");
  }

  return outputText;
}

module.exports = {
  listTables,
  translate,
  DEFAULT_TABLE,
};
