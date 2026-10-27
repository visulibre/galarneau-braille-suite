const GBS_DOCUMENT_FORMAT = "galarneau-braille-suite-document";
const GBS_DOCUMENT_FORMAT_VERSION = 1;
const INPUT_MODE_TEXT = "text";
const INPUT_MODE_BRAILLE = "braille-eight-key";
const LEGACY_INPUT_MODE_BRAILLE = "braille-six-key";
const APP_VERSION_LABEL = "1.0";
const STARTUP_TEXT_MESSAGE =
  `galarneau braille suite version ${APP_VERSION_LABEL} en la mémoire de Roland Galarneau.`;
const STARTUP_ORIGIN_TEXT_MESSAGE =
  "Le nom Galarneau Braille Suite rend hommage à Roland Galarneau, " +
  "inventeur québécois de Hull. Dans les années 1960, il a conçu le " +
  "Converto-Braille, une machine pionnière qui facilitait la conversion " +
  "de textes imprimés en braille.";
const STARTUP_TEXT_BRAILLE_TABLE_ID = "fr-bfu-g2";
const BRAILLE_KEY_TO_DOT = Object.freeze({
  a: 7,
  s: 1,
  d: 2,
  f: 3,
  j: 4,
  k: 5,
  l: 6,
  ";": 8,
});
const DOT_TO_BRAILLE_BIT = Object.freeze({
  1: 0x01,
  2: 0x02,
  3: 0x04,
  4: 0x08,
  5: 0x10,
  6: 0x20,
  7: 0x40,
  8: 0x80,
});

const workspaceWelcomePanel = document.querySelector("#workspace-welcome-panel");
const startupNormalText = document.querySelector("#startup-normal-text");
const startupBrailleOutput = document.querySelector("#startup-braille-output");
const startupBrailleStatus = document.querySelector("#startup-braille-status");
const startupOriginText = document.querySelector("#startup-origin-text");
const startupOriginBrailleOutput = document.querySelector("#startup-origin-braille-output");
const startupOriginBrailleStatus = document.querySelector("#startup-origin-braille-status");

const newDocumentPanel = document.querySelector("#new-document-panel");
const newDocumentForm = document.querySelector("#new-document-form");
const tableSelect = document.querySelector("#table-select");
const linesPerPageInput = document.querySelector("#lines-per-page");
const charactersPerLineInput = document.querySelector("#characters-per-line");
const createDocumentButton = document.querySelector("#create-document-button");
const openDocumentButton = document.querySelector("#open-document-button");
const documentStatusMessage = document.querySelector("#document-status-message");

const editorPanel = document.querySelector("#editor-panel");
const editorPages = document.querySelector("#editor-pages");
const addPageButton = document.querySelector("#add-page-button");
const centerActiveLineButton = document.querySelector("#center-active-line-button");
const closeDocumentButton = document.querySelector("#close-document-button");
const saveDocumentButton = document.querySelector("#save-document-button");
const activeDocumentFile = document.querySelector("#active-document-file");
const activeTableLabel = document.querySelector("#active-table-label");
const activeDocumentFormat = document.querySelector("#active-document-format");

const translationForm = document.querySelector("#translation-form");
const translateButton = document.querySelector("#translate-button");
const translatedText = document.querySelector("#translated-text");
const translationStatusMessage = document.querySelector("#translation-status-message");
const realtimeTranslationToggle = document.querySelector("#realtime-translation-toggle");
const showSpaceMarkersToggle = document.querySelector("#show-space-markers-toggle");
const directionRadios = document.querySelectorAll('input[name="direction"]');
const inputModeRadios = document.querySelectorAll('input[name="input-mode"]');
const brailleChordStatus = document.querySelector("#braille-chord-status");
const liveBraillePreview = document.querySelector("#live-braille-preview");
const liveBrailleStatus = document.querySelector("#live-braille-status");
const activeLineSpacePreview = document.querySelector("#active-line-space-preview");
const activeLineSpaceStatus = document.querySelector("#active-line-space-status");
const brailleDotElements = new Map(
  [1, 2, 3, 4, 5, 6, 7, 8].map((dot) => [dot, document.querySelector(`#braille-dot-${dot}`)]),
);

const state = {
  tables: [],
  documentConfig: null,
  documentMeta: null,
  pages: [],
  filePath: null,
  isDirty: false,
  inputMode: INPUT_MODE_TEXT,
  realtimeTranslationEnabled: true,
  showSpaceMarkersEnabled: false,
};

const brailleChordState = {
  activeKeys: new Set(),
  chordDots: new Set(),
};

let isCreateLoading = false;
let isCreateLocked = false;
let isTranslationBusy = false;
let isFileBusy = false;
let liveBraillePreviewTimerId = null;
let liveBraillePreviewRequestId = 0;
let lastFocusedLinePosition = null;

const BRAILLE_PREVIEW_DEBOUNCE_MS = 80;

function configureLiveRegion(element, variant) {
  const isError = variant === "error";
  element.setAttribute("role", isError ? "alert" : "status");
  element.setAttribute("aria-live", isError ? "assertive" : "polite");
  element.setAttribute("aria-atomic", "true");
}

function setStatus(element, message, variant = "neutral") {
  element.dataset.variant = variant;
  configureLiveRegion(element, variant);

  const normalizedMessage = typeof message === "string" ? message : "";
  if (element.textContent === normalizedMessage) {
    element.textContent = "";
    window.requestAnimationFrame(() => {
      element.textContent = normalizedMessage;
    });
    return;
  }

  element.textContent = normalizedMessage;
}

function refreshCreationFormState() {
  const disableForm = isCreateLoading || isCreateLocked || isFileBusy;

  tableSelect.disabled = disableForm;
  linesPerPageInput.disabled = disableForm;
  charactersPerLineInput.disabled = disableForm;
  createDocumentButton.disabled = disableForm;
  openDocumentButton.disabled = disableForm;
  createDocumentButton.textContent = isCreateLoading
    ? "Chargement des tables…"
    : "Créer le document";
}

function refreshTranslationButton() {
  translateButton.disabled =
    isTranslationBusy ||
    isFileBusy ||
    state.documentConfig === null;
  translateButton.textContent = isTranslationBusy
    ? "Traduction en cours…"
    : "Traduire le document";
}

function refreshDocumentActionButtons() {
  const hasDocument = state.documentConfig !== null;
  addPageButton.disabled = !hasDocument || isFileBusy || isTranslationBusy;
  centerActiveLineButton.disabled = !hasDocument || isFileBusy || isTranslationBusy;
  closeDocumentButton.disabled = !hasDocument || isFileBusy || isTranslationBusy;
  saveDocumentButton.disabled = !hasDocument || isFileBusy || isTranslationBusy;
  if (showSpaceMarkersToggle instanceof HTMLInputElement) {
    showSpaceMarkersToggle.disabled = !hasDocument || isFileBusy || isTranslationBusy;
  }
}

function refreshAllActionStates() {
  refreshCreationFormState();
  refreshTranslationButton();
  refreshDocumentActionButtons();
}

function setWelcomePanelOpen(isOpen) {
  if (workspaceWelcomePanel) {
    workspaceWelcomePanel.hidden = !isOpen;
  }
}

function setNewDocumentPanelOpen(isOpen) {
  if (newDocumentPanel) {
    newDocumentPanel.hidden = !isOpen;
  }
}

function setEditorOpen(isOpen) {
  editorPanel.hidden = !isOpen;
  createDocumentButton.setAttribute("aria-expanded", String(isOpen));
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "Une erreur inconnue est survenue.";
}

function toFileName(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0) {
    return "document.gbs";
  }

  const chunks = filePath.split(/[/\\]/);
  return chunks[chunks.length - 1] || "document.gbs";
}

function appendTableOption(table) {
  const option = document.createElement("option");
  option.value = table.table;
  option.textContent = table.label;
  tableSelect.append(option);
}

function assertBrailleApiAvailable() {
  if (!window.brailleApi) {
    throw new Error("L'API de traduction n'est pas disponible.");
  }
}

async function initializeTables() {
  assertBrailleApiAvailable();

  const tables = await window.brailleApi.listTables();
  if (!Array.isArray(tables) || tables.length === 0) {
    throw new Error("Aucune table de traduction n'a été trouvée.");
  }

  state.tables = tables;
  tableSelect.replaceChildren();
  tables.forEach((table) => appendTableOption(table));
}

function findTableByPath(tablePath) {
  return state.tables.find((table) => table.table === tablePath) ?? null;
}

function findTableById(tableId) {
  return state.tables.find((table) => table.id === tableId) ?? null;
}

function focusStartupBrailleOutput() {
  if (!(startupBrailleOutput instanceof HTMLTextAreaElement)) {
    return;
  }

  startupBrailleOutput.focus();
  startupBrailleOutput.setSelectionRange(0, 0);
  startupBrailleOutput.scrollTop = 0;
  startupBrailleOutput.scrollLeft = 0;
}

function setStartupBrailleStatus(message, variant = "neutral") {
  if (!startupBrailleStatus) {
    return;
  }

  setStatus(startupBrailleStatus, message, variant);
}

function setStartupOriginBrailleStatus(message, variant = "neutral") {
  if (!startupOriginBrailleStatus) {
    return;
  }

  setStatus(startupOriginBrailleStatus, message, variant);
}

async function translateTextToStartupBraille(inputText) {
  const startupTable = findTableById(STARTUP_TEXT_BRAILLE_TABLE_ID);
  if (!startupTable) {
    throw new Error("La table fr-bfu-g2 est introuvable pour la traduction de l’accueil.");
  }

  const response = await window.brailleApi.translate({
    table: startupTable.table,
    direction: "text-to-braille",
    inputText,
  });

  if (!response || typeof response.outputText !== "string") {
    throw new Error("Réponse invalide du service de traduction.");
  }

  return response.outputText;
}

async function renderStartupWelcomeMessage(options = {}) {
  const { focusBrailleOutput = false } = options;

  if (startupNormalText) {
    startupNormalText.textContent = STARTUP_TEXT_MESSAGE;
  }
  if (startupOriginText) {
    startupOriginText.textContent = STARTUP_ORIGIN_TEXT_MESSAGE;
  }

  if (startupBrailleOutput instanceof HTMLTextAreaElement) {
    setStartupBrailleStatus("Traduction braille de l’accueil en cours…", "neutral");
    try {
      startupBrailleOutput.value = await translateTextToStartupBraille(STARTUP_TEXT_MESSAGE);
      setStartupBrailleStatus(
        "Message d’accueil traduit en braille français (fr-bfu-g2).",
        "success",
      );
    } catch (error) {
      startupBrailleOutput.value = "";
      setStartupBrailleStatus(
        `Impossible de traduire le message d’accueil: ${getErrorMessage(error)}`,
        "error",
      );
    }
  }

  if (startupOriginBrailleOutput instanceof HTMLTextAreaElement) {
    setStartupOriginBrailleStatus("Traduction braille de l’origine du nom en cours…", "neutral");
    try {
      startupOriginBrailleOutput.value =
        await translateTextToStartupBraille(STARTUP_ORIGIN_TEXT_MESSAGE);
      setStartupOriginBrailleStatus(
        "Origine du nom traduite en braille français (fr-bfu-g2).",
        "success",
      );
    } catch (error) {
      startupOriginBrailleOutput.value = "";
      setStartupOriginBrailleStatus(
        `Impossible de traduire l’origine du nom: ${getErrorMessage(error)}`,
        "error",
      );
    }
  }

  if (focusBrailleOutput) {
    focusStartupBrailleOutput();
  }
}

function parseBoundedIntegerFromInput(rawValue, label, min, max) {
  const parsedValue = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsedValue)) {
    throw new Error(`${label}: valeur numérique invalide.`);
  }

  if (parsedValue < min || parsedValue > max) {
    throw new Error(`${label}: la valeur doit être entre ${min} et ${max}.`);
  }

  return parsedValue;
}

function ensureBoundedIntegerFromNumber(value, label, min, max) {
  if (!Number.isInteger(value)) {
    throw new Error(`${label}: la valeur doit être un entier.`);
  }

  if (value < min || value > max) {
    throw new Error(`${label}: la valeur doit être entre ${min} et ${max}.`);
  }

  return value;
}

function buildEmptyPage(linesPerPage) {
  return Array.from({ length: linesPerPage }, () => "");
}

function focusLineInput(pageIndex, lineIndex) {
  const lineInput = document.querySelector(`#page-${pageIndex + 1}-line-${lineIndex + 1}`);
  if (lineInput instanceof HTMLInputElement) {
    lineInput.focus();
  }
}

function setDirection(direction) {
  const toSelect = direction === "braille-to-text" ? "braille-to-text" : "text-to-braille";
  const radio = document.querySelector(`input[name="direction"][value="${toSelect}"]`);
  if (radio instanceof HTMLInputElement) {
    radio.checked = true;
  }
}

function setDirectionControlsForRealtime(isEnabled) {
  directionRadios.forEach((radio) => {
    if (!(radio instanceof HTMLInputElement)) {
      return;
    }

    if (radio.value === "braille-to-text") {
      radio.disabled = isEnabled;
    } else {
      radio.disabled = false;
    }
  });

  if (isEnabled) {
    setDirection("text-to-braille");
  }
}

function renderBrailleDotGuide() {
  const activeDots = Array.from(brailleChordState.chordDots).sort((a, b) => a - b);
  brailleDotElements.forEach((element, dot) => {
    if (!element) {
      return;
    }
    element.classList.toggle("is-active", activeDots.includes(dot));
  });

  if (!brailleChordStatus) {
    return;
  }

  brailleChordStatus.textContent =
    activeDots.length > 0
      ? `Points actifs: ${activeDots.join(", ")}`
      : "Aucun point actif.";
}

function clearBrailleChordState() {
  brailleChordState.activeKeys.clear();
  brailleChordState.chordDots.clear();
  renderBrailleDotGuide();
}

function normalizeInputMode(value) {
  return value === INPUT_MODE_BRAILLE || value === LEGACY_INPUT_MODE_BRAILLE
    ? INPUT_MODE_BRAILLE
    : INPUT_MODE_TEXT;
}

function setInputMode(mode, options = {}) {
  const { announce = true } = options;
  const normalizedMode = normalizeInputMode(mode);

  state.inputMode = normalizedMode;
  clearBrailleChordState();

  inputModeRadios.forEach((radio) => {
    if (!(radio instanceof HTMLInputElement)) {
      return;
    }

    radio.checked = radio.value === normalizedMode;
  });

  if (!announce) {
    return;
  }

  const modeMessage =
    normalizedMode === INPUT_MODE_BRAILLE
      ? "Mode de saisie braille actif: points 1 à 8 sur S D F J K L A ;."
      : "Mode de saisie clavier standard actif.";
  setStatus(documentStatusMessage, modeMessage, "neutral");
}

function normalizeRealtimeTranslationOption(value) {
  return value !== false;
}

function normalizeShowSpaceMarkersOption(value) {
  return value === true;
}

function setActiveLineSpaceStatus(message) {
  if (!activeLineSpaceStatus) {
    return;
  }

  activeLineSpaceStatus.textContent = message;
}

function buildVisibleSpaceLine(lineValue) {
  return lineValue.replaceAll(" ", "·");
}

function refreshActiveLineSpacePreview() {
  if (!(activeLineSpacePreview instanceof HTMLTextAreaElement)) {
    return;
  }

  if (!state.documentConfig) {
    activeLineSpacePreview.value = "";
    setActiveLineSpaceStatus("Aucun document actif.");
    return;
  }

  if (!state.showSpaceMarkersEnabled) {
    activeLineSpacePreview.value = "";
    setActiveLineSpaceStatus("Affichage des espaces désactivé.");
    return;
  }

  const activeLineInput = resolveFormattingTargetLineInput();
  if (!activeLineInput) {
    activeLineSpacePreview.value = "";
    setActiveLineSpaceStatus("Aucune ligne active.");
    return;
  }

  activeLineSpacePreview.value = buildVisibleSpaceLine(activeLineInput.value);
  const leadingSpaces = countLeadingSpaces(activeLineInput.value);
  const linePosition = getLinePositionFromInput(activeLineInput);
  const positionDescription = linePosition
    ? `page ${linePosition.pageIndex + 1}, ligne ${linePosition.lineIndex + 1}`
    : "ligne active";
  setActiveLineSpaceStatus(
    `${positionDescription}: ${leadingSpaces} espace(s) en début de ligne.`,
  );
}

function setShowSpaceMarkersEnabled(value, options = {}) {
  const { announce = true } = options;
  const isEnabled = normalizeShowSpaceMarkersOption(value);

  state.showSpaceMarkersEnabled = isEnabled;
  if (showSpaceMarkersToggle instanceof HTMLInputElement) {
    showSpaceMarkersToggle.checked = isEnabled;
  }
  refreshActiveLineSpacePreview();

  if (!announce) {
    return;
  }

  setStatus(
    documentStatusMessage,
    isEnabled
      ? "Affichage des espaces activé pour la ligne active."
      : "Affichage des espaces désactivé.",
    "neutral",
  );
}

function syncRealtimeTranslationMenuState(isEnabled) {
  if (typeof window.brailleApi?.setRealtimeTranslationMenuState !== "function") {
    return;
  }

  void window.brailleApi.setRealtimeTranslationMenuState(isEnabled).catch((error) => {
    console.error(
      "Impossible de synchroniser l'état du menu de traduction en temps réel:",
      error,
    );
  });
}

function setRealtimeTranslationEnabled(value, options = {}) {
  const { announce = true } = options;
  const isEnabled = normalizeRealtimeTranslationOption(value);

  state.realtimeTranslationEnabled = isEnabled;
  setDirectionControlsForRealtime(isEnabled);
  syncRealtimeTranslationMenuState(isEnabled);

  if (realtimeTranslationToggle instanceof HTMLInputElement) {
    realtimeTranslationToggle.checked = isEnabled;
  }

  if (isEnabled) {
    scheduleLiveBraillePreviewRefresh({ immediate: true });
  } else {
    cancelLiveBraillePreviewRefresh();
    clearLiveBraillePreview();
  }

  if (!announce) {
    return;
  }

  setStatus(
    documentStatusMessage,
    isEnabled
      ? "Traduction en temps réel activée."
      : "Traduction en temps réel désactivée. Utilise Ctrl/Cmd+T pour traduire d’un coup.",
    "neutral",
  );
}

function isLineInput(element) {
  return element instanceof HTMLInputElement && element.classList.contains("line-input");
}

function getLinePositionFromInput(lineInput) {
  const pageIndex = Number.parseInt(lineInput.dataset.pageIndex ?? "", 10);
  const lineIndex = Number.parseInt(lineInput.dataset.lineIndex ?? "", 10);
  if (Number.isNaN(pageIndex) || Number.isNaN(lineIndex)) {
    return null;
  }

  return { pageIndex, lineIndex };
}

function updateLastFocusedLinePosition(lineInput) {
  const linePosition = getLinePositionFromInput(lineInput);
  if (!linePosition) {
    return;
  }

  lastFocusedLinePosition = linePosition;
}

function resolveBrailleDotFromEvent(event) {
  const normalizedKey = event.key.toLowerCase();
  const dotFromKey = BRAILLE_KEY_TO_DOT[normalizedKey];
  if (dotFromKey !== undefined) {
    return dotFromKey;
  }

  if (event.code === "KeyA") {
    return 7;
  }

  if (event.code === "Semicolon") {
    return 8;
  }

  return undefined;
}

function buildBrailleCharacterFromDots(dotSet) {
  let unicodeCodePoint = 0x2800;
  dotSet.forEach((dot) => {
    unicodeCodePoint += DOT_TO_BRAILLE_BIT[dot];
  });
  return String.fromCodePoint(unicodeCodePoint);
}

function insertTextInLineInput(lineInput, textToInsert) {
  const selectionStart = lineInput.selectionStart ?? lineInput.value.length;
  const selectionEnd = lineInput.selectionEnd ?? lineInput.value.length;
  const currentValue = lineInput.value;
  const nextValue =
    `${currentValue.slice(0, selectionStart)}` +
    `${textToInsert}` +
    `${currentValue.slice(selectionEnd)}`;
  const maxLength = lineInput.maxLength > 0 ? lineInput.maxLength : Number.POSITIVE_INFINITY;

  if (nextValue.length > maxLength) {
    setStatus(
      documentStatusMessage,
      "La ligne a atteint le nombre maximal de caractères.",
      "neutral",
    );
    return;
  }

  lineInput.value = nextValue;
  const nextCaretPosition = selectionStart + textToInsert.length;
  lineInput.setSelectionRange(nextCaretPosition, nextCaretPosition);
  lineInput.dispatchEvent(new Event("input", { bubbles: true }));
}

function onBrailleLineKeyDown(event) {
  if (state.inputMode !== INPUT_MODE_BRAILLE || !isLineInput(event.currentTarget)) {
    return;
  }

  if (event.ctrlKey || event.altKey || event.metaKey) {
    return;
  }

  const normalizedKey = event.key.toLowerCase();
  const dot = resolveBrailleDotFromEvent(event);

  if (dot !== undefined) {
    event.preventDefault();

    if (!event.repeat) {
      brailleChordState.activeKeys.add(dot);
      brailleChordState.chordDots.add(dot);
      renderBrailleDotGuide();
    }
    return;
  }

  if (normalizedKey === "escape") {
    clearBrailleChordState();
    return;
  }

  if (normalizedKey.length === 1 && normalizedKey !== " ") {
    event.preventDefault();
  }
}

function onBrailleLineKeyUp(event) {
  if (state.inputMode !== INPUT_MODE_BRAILLE || !isLineInput(event.currentTarget)) {
    return;
  }

  if (event.ctrlKey || event.altKey || event.metaKey) {
    return;
  }

  const dot = resolveBrailleDotFromEvent(event);
  if (dot === undefined) {
    return;
  }

  event.preventDefault();
  brailleChordState.activeKeys.delete(dot);
  renderBrailleDotGuide();

  if (brailleChordState.activeKeys.size > 0 || brailleChordState.chordDots.size === 0) {
    return;
  }

  const brailleCharacter = buildBrailleCharacterFromDots(brailleChordState.chordDots);
  clearBrailleChordState();
  insertTextInLineInput(event.currentTarget, brailleCharacter);
}

function onBrailleLineBlur() {
  clearBrailleChordState();
}

function hasUnsavedChanges() {
  if (!state.documentConfig) {
    return false;
  }

  return state.filePath === null || state.isDirty;
}

function confirmDiscardUnsavedChanges(actionLabel) {
  if (!hasUnsavedChanges()) {
    return true;
  }

  return window.confirm(
    `Le document actuel contient des changements non enregistrés.\n` +
      `Veux-tu vraiment ${actionLabel} sans enregistrer le fichier .gbs ?`,
  );
}

function updateDocumentMetadata() {
  if (!state.documentConfig) {
    activeDocumentFile.textContent = "Nouveau document non enregistré";
    activeTableLabel.textContent = "—";
    activeDocumentFormat.textContent = "—";
    return;
  }

  const unsavedStatus = state.isDirty ? " (modifié)" : "";
  if (state.filePath) {
    activeDocumentFile.textContent = `${state.filePath}${unsavedStatus}`;
  } else {
    activeDocumentFile.textContent = `Nouveau document .gbs non enregistré${unsavedStatus}`;
  }

  activeTableLabel.textContent = state.documentConfig.tableLabel;
  activeDocumentFormat.textContent =
    `${state.documentConfig.linesPerPage} lignes/page · ` +
    `${state.documentConfig.charactersPerLine} caractères/ligne · ` +
    `${state.pages.length} page(s)`;
}

function markDocumentChanged() {
  if (!state.documentConfig) {
    return;
  }

  state.isDirty = true;
  if (state.documentMeta) {
    state.documentMeta.updatedAt = new Date().toISOString();
  }

  updateDocumentMetadata();
}

function onLineInput(event) {
  if (!state.documentConfig) {
    return;
  }

  const lineInput = event.currentTarget;
  if (!(lineInput instanceof HTMLInputElement)) {
    return;
  }

  const linePosition = getLinePositionFromInput(lineInput);
  if (!linePosition) {
    return;
  }

  updateLastFocusedLinePosition(lineInput);
  const { pageIndex, lineIndex } = linePosition;
  const newValue = lineInput.value;
  if (state.pages[pageIndex][lineIndex] === newValue) {
    return;
  }

  state.pages[pageIndex][lineIndex] = newValue;
  markDocumentChanged();

  const counter = document.querySelector(`#${lineInput.id}-counter`);
  if (counter) {
    counter.textContent =
      `${lineInput.value.length}/${state.documentConfig.charactersPerLine}`;
  }
  refreshActiveLineSpacePreview();

  if (state.realtimeTranslationEnabled) {
    scheduleLiveBraillePreviewRefresh();
  }
}

function onLineFocus(event) {
  const lineInput = event.currentTarget;
  if (!(lineInput instanceof HTMLInputElement)) {
    return;
  }

  updateLastFocusedLinePosition(lineInput);
  refreshActiveLineSpacePreview();
}

function createLineEditor(pageIndex, lineIndex, value) {
  const lineWrapper = document.createElement("div");
  lineWrapper.className = "line-item";

  const inputId = `page-${pageIndex + 1}-line-${lineIndex + 1}`;
  const counterId = `${inputId}-counter`;

  const label = document.createElement("label");
  label.htmlFor = inputId;
  label.textContent = `Page ${pageIndex + 1}, ligne ${lineIndex + 1}`;

  const lineInput = document.createElement("input");
  lineInput.id = inputId;
  lineInput.className = "line-input";
  lineInput.type = "text";
  lineInput.autocomplete = "off";
  lineInput.spellcheck = false;
  lineInput.maxLength = state.documentConfig.charactersPerLine;
  lineInput.value = value;
  lineInput.dataset.pageIndex = String(pageIndex);
  lineInput.dataset.lineIndex = String(lineIndex);
  lineInput.setAttribute("aria-describedby", counterId);
  lineInput.addEventListener("input", onLineInput);
  lineInput.addEventListener("focus", onLineFocus);
  lineInput.addEventListener("keydown", onBrailleLineKeyDown);
  lineInput.addEventListener("keyup", onBrailleLineKeyUp);
  lineInput.addEventListener("blur", onBrailleLineBlur);

  const counter = document.createElement("span");
  counter.id = counterId;
  counter.className = "line-counter";
  counter.textContent =
    `${value.length}/${state.documentConfig.charactersPerLine}`;

  lineWrapper.append(label, lineInput, counter);
  return lineWrapper;
}

function renderEditorPages() {
  if (!state.documentConfig) {
    editorPages.replaceChildren();
    return;
  }

  editorPages.replaceChildren();

  state.pages.forEach((pageLines, pageIndex) => {
    const pageBlock = document.createElement("fieldset");
    pageBlock.className = "page-block";

    const pageLegend = document.createElement("legend");
    pageLegend.textContent = `Page ${pageIndex + 1}`;
    pageBlock.append(pageLegend);

    const linesContainer = document.createElement("div");
    linesContainer.className = "line-list";

    pageLines.forEach((lineValue, lineIndex) => {
      linesContainer.append(createLineEditor(pageIndex, lineIndex, lineValue));
    });

    pageBlock.append(linesContainer);
    editorPages.append(pageBlock);
  });
}

function openDocumentEditor() {
  setWelcomePanelOpen(false);
  setNewDocumentPanelOpen(true);
  setEditorOpen(true);
  updateDocumentMetadata();
  renderEditorPages();
  refreshActiveLineSpacePreview();
  refreshAllActionStates();
  if (state.realtimeTranslationEnabled) {
    scheduleLiveBraillePreviewRefresh({ immediate: true });
  } else {
    clearLiveBraillePreview();
  }
}

function resetTranslationOutput() {
  translatedText.value = "";
  setStatus(translationStatusMessage, "", "neutral");
}

function closeCurrentDocument(options = {}) {
  const { preserveStatusMessage = false } = options;
  clearBrailleChordState();
  cancelLiveBraillePreviewRefresh();

  state.documentConfig = null;
  state.documentMeta = null;
  state.pages = [];
  state.filePath = null;
  state.isDirty = false;
  lastFocusedLinePosition = null;

  setWelcomePanelOpen(true);
  setNewDocumentPanelOpen(false);
  setEditorOpen(false);
  resetTranslationOutput();
  clearLiveBraillePreview();
  refreshActiveLineSpacePreview();
  updateDocumentMetadata();
  refreshAllActionStates();

  if (!preserveStatusMessage) {
    setStatus(
      documentStatusMessage,
      "Document fermé. Crée ou ouvre un document .gbs pour continuer.",
      "neutral",
    );
  }

  focusStartupBrailleOutput();
}

function buildCenteredLineValue(lineValue, lineWidth) {
  const trimmedLineValue = lineValue.trim();
  if (trimmedLineValue.length === 0) {
    return null;
  }

  if (trimmedLineValue.length >= lineWidth) {
    return trimmedLineValue;
  }

  const leftPaddingLength = Math.floor((lineWidth - trimmedLineValue.length) / 2);
  return `${" ".repeat(leftPaddingLength)}${trimmedLineValue}`;
}

function countLeadingSpaces(lineValue) {
  let leadingSpaces = 0;

  while (leadingSpaces < lineValue.length && lineValue[leadingSpaces] === " ") {
    leadingSpaces += 1;
  }

  return leadingSpaces;
}

function findLineInputByPosition(linePosition) {
  const selector = `#page-${linePosition.pageIndex + 1}-line-${linePosition.lineIndex + 1}`;
  const lineInput = document.querySelector(selector);
  return isLineInput(lineInput) ? lineInput : null;
}

function resolveFormattingTargetLineInput() {
  if (isLineInput(document.activeElement)) {
    updateLastFocusedLinePosition(document.activeElement);
    return document.activeElement;
  }

  if (!lastFocusedLinePosition) {
    return null;
  }

  return findLineInputByPosition(lastFocusedLinePosition);
}

function getDirection() {
  const checkedDirection = document.querySelector('input[name="direction"]:checked');
  return checkedDirection ? checkedDirection.value : "text-to-braille";
}

function getDocumentTextForTranslation() {
  const allLines = state.pages.flat();
  let lastUsefulLineIndex = allLines.length - 1;

  while (lastUsefulLineIndex >= 0 && allLines[lastUsefulLineIndex].trim() === "") {
    lastUsefulLineIndex -= 1;
  }

  if (lastUsefulLineIndex < 0) {
    return "";
  }

  return allLines.slice(0, lastUsefulLineIndex + 1).join("\n");
}

function getDocumentText() {
  const documentText = getDocumentTextForTranslation();
  if (documentText.length === 0) {
    throw new Error("Le document est vide. Saisis du texte avant la traduction.");
  }

  return documentText;
}

function setLiveBrailleStatus(message, variant = "neutral") {
  liveBrailleStatus.dataset.variant = variant;
  liveBrailleStatus.textContent = message;
}

function clearLiveBraillePreview() {
  liveBraillePreview.value = "";
  setLiveBrailleStatus(
    state.realtimeTranslationEnabled
      ? "Aucun aperçu braille pour le moment."
      : "Traduction en temps réel désactivée.",
    "neutral",
  );
}

async function refreshLiveBraillePreview() {
  if (!state.documentConfig) {
    clearLiveBraillePreview();
    return;
  }

  if (!state.realtimeTranslationEnabled) {
    clearLiveBraillePreview();
    return;
  }

  const sourceText = getDocumentTextForTranslation();
  if (sourceText.length === 0) {
    liveBraillePreview.value = "";
    setLiveBrailleStatus(
      "Aperçu braille en attente. Saisis du texte dans le document.",
      "neutral",
    );
    return;
  }

  const requestId = ++liveBraillePreviewRequestId;
  setLiveBrailleStatus("Mise à jour de l’aperçu braille…", "neutral");

  try {
    const response = await window.brailleApi.translate({
      table: state.documentConfig.table,
      direction: "text-to-braille",
      inputText: sourceText,
    });

    if (requestId !== liveBraillePreviewRequestId) {
      return;
    }

    if (!response || typeof response.outputText !== "string") {
      throw new Error("Le service de traduction a retourné une réponse invalide.");
    }

    liveBraillePreview.value = response.outputText;
    if (state.realtimeTranslationEnabled) {
      translatedText.value = response.outputText;
    }
    setLiveBrailleStatus("Aperçu braille à jour.", "success");
  } catch (error) {
    if (requestId !== liveBraillePreviewRequestId) {
      return;
    }

    liveBraillePreview.value = "";
    if (state.realtimeTranslationEnabled) {
      translatedText.value = "";
    }
    setLiveBrailleStatus(
      `Aperçu braille indisponible: ${getErrorMessage(error)}`,
      "error",
    );
  }
}

function scheduleLiveBraillePreviewRefresh(options = {}) {
  const { immediate = false } = options;

  if (liveBraillePreviewTimerId !== null) {
    clearTimeout(liveBraillePreviewTimerId);
    liveBraillePreviewTimerId = null;
  }

  if (!state.documentConfig) {
    clearLiveBraillePreview();
    return;
  }

  if (immediate) {
    void refreshLiveBraillePreview();
    return;
  }

  liveBraillePreviewTimerId = window.setTimeout(() => {
    liveBraillePreviewTimerId = null;
    void refreshLiveBraillePreview();
  }, BRAILLE_PREVIEW_DEBOUNCE_MS);
}

function cancelLiveBraillePreviewRefresh() {
  if (liveBraillePreviewTimerId !== null) {
    clearTimeout(liveBraillePreviewTimerId);
    liveBraillePreviewTimerId = null;
  }

  liveBraillePreviewRequestId += 1;
}

function createDocumentFromForm() {
  const selectedTable = findTableByPath(tableSelect.value);
  if (!selectedTable) {
    throw new Error("La table de traduction sélectionnée est invalide.");
  }

  const linesPerPage = parseBoundedIntegerFromInput(
    linesPerPageInput.value,
    "Nombre de lignes par page",
    1,
    60,
  );
  const charactersPerLine = parseBoundedIntegerFromInput(
    charactersPerLineInput.value,
    "Nombre de caractères par ligne",
    1,
    120,
  );

  const now = new Date().toISOString();
  state.documentConfig = {
    table: selectedTable.table,
    tableLabel: selectedTable.label,
    linesPerPage,
    charactersPerLine,
  };
  state.documentMeta = {
    createdAt: now,
    updatedAt: now,
  };
  state.pages = [buildEmptyPage(linesPerPage)];
  state.filePath = null;
  state.isDirty = false;
}

function openNewDocumentCreationPanel() {
  if (isCreateLoading || isCreateLocked || isFileBusy || isTranslationBusy) {
    return;
  }

  setWelcomePanelOpen(false);
  setNewDocumentPanelOpen(true);
  setStatus(
    documentStatusMessage,
    "Configure le document puis active « Créer le document ».",
    "neutral",
  );
  tableSelect.focus();
}

function requestNewDocumentCreation() {
  if (isCreateLoading || isCreateLocked || isFileBusy) {
    return;
  }

  if (!confirmDiscardUnsavedChanges("créer un nouveau document")) {
    setStatus(
      documentStatusMessage,
      "Création annulée. Le document actuel est conservé.",
      "neutral",
    );
    return;
  }

  try {
    createDocumentFromForm();
    resetTranslationOutput();
    setStatus(
      documentStatusMessage,
      "Document créé. Pense à l’enregistrer au format .gbs.",
      "success",
    );
    setStatus(translationStatusMessage, "Document prêt à être traduit.", "neutral");
    openDocumentEditor();
    focusLineInput(0, 0);
  } catch (error) {
    setStatus(documentStatusMessage, `Erreur: ${getErrorMessage(error)}`, "error");
  }
}

function onCreateDocument(event) {
  event.preventDefault();
  requestNewDocumentCreation();
}

function onAddPage() {
  if (!state.documentConfig || isFileBusy || isTranslationBusy) {
    return;
  }

  state.pages.push(buildEmptyPage(state.documentConfig.linesPerPage));
  markDocumentChanged();
  renderEditorPages();
  updateDocumentMetadata();

  const newPageIndex = state.pages.length - 1;
  setStatus(documentStatusMessage, `Page ${newPageIndex + 1} ajoutée.`, "success");
  focusLineInput(newPageIndex, 0);
  if (state.realtimeTranslationEnabled) {
    scheduleLiveBraillePreviewRefresh({ immediate: true });
  }
}

function onCenterActiveLine() {
  if (!state.documentConfig || isFileBusy || isTranslationBusy) {
    return;
  }

  const targetLineInput = resolveFormattingTargetLineInput();
  if (!targetLineInput) {
    setStatus(
      documentStatusMessage,
      "Sélectionne une ligne du document avant d'appliquer le centrage.",
      "neutral",
    );
    return;
  }

  const centeredValue = buildCenteredLineValue(
    targetLineInput.value,
    state.documentConfig.charactersPerLine,
  );
  if (centeredValue === null) {
    setStatus(
      documentStatusMessage,
      "Le centrage nécessite une ligne contenant du texte.",
      "neutral",
    );
    return;
  }

  if (centeredValue === targetLineInput.value) {
    const leadingSpaces = countLeadingSpaces(centeredValue);
    setStatus(
      documentStatusMessage,
      `La ligne active est déjà centrée (${leadingSpaces} espace(s) en début de ligne).`,
      "neutral",
    );
    targetLineInput.focus();
    targetLineInput.setSelectionRange(0, 0);
    targetLineInput.scrollLeft = 0;
    return;
  }

  targetLineInput.value = centeredValue;
  targetLineInput.dispatchEvent(new Event("input", { bubbles: true }));
  targetLineInput.focus();
  targetLineInput.setSelectionRange(0, 0);
  targetLineInput.scrollLeft = 0;

  const linePosition = getLinePositionFromInput(targetLineInput);
  const leadingSpaces = countLeadingSpaces(centeredValue);
  const positionDescription = linePosition
    ? `page ${linePosition.pageIndex + 1}, ligne ${linePosition.lineIndex + 1}`
    : "ligne active";
  setStatus(
    documentStatusMessage,
    `Centrage appliqué à la ${positionDescription} (${leadingSpaces} espace(s) en début de ligne).`,
    "success",
  );
}

async function runFullDocumentTranslation() {
  if (!state.documentConfig || isTranslationBusy || isFileBusy) {
    return;
  }

  isTranslationBusy = true;
  refreshAllActionStates();
  setStatus(translationStatusMessage, "", "neutral");

  try {
    const inputText = getDocumentText();
    const response = await window.brailleApi.translate({
      table: state.documentConfig.table,
      direction: getDirection(),
      inputText,
    });

    if (!response || typeof response.outputText !== "string") {
      throw new Error("Le service de traduction a retourné une réponse invalide.");
    }

    translatedText.value = response.outputText;
    setStatus(translationStatusMessage, "Traduction terminée.", "success");
  } catch (error) {
    translatedText.value = "";
    setStatus(translationStatusMessage, `Erreur: ${getErrorMessage(error)}`, "error");
  } finally {
    isTranslationBusy = false;
    refreshAllActionStates();
  }
}

async function onTranslate(event) {
  event.preventDefault();
  await runFullDocumentTranslation();
}

function buildGbsDocumentPayload() {
  if (!state.documentConfig) {
    throw new Error("Aucun document actif à enregistrer.");
  }

  const now = new Date().toISOString();
  const createdAt = state.documentMeta?.createdAt ?? now;
  const updatedAt = now;

  return {
    format: GBS_DOCUMENT_FORMAT,
    formatVersion: GBS_DOCUMENT_FORMAT_VERSION,
    appName: "Galarneau Braille Suite",
    createdAt,
    updatedAt,
    defaultDirection: getDirection(),
    inputMode: state.inputMode,
    realtimeTranslationEnabled: state.realtimeTranslationEnabled,
    showSpaceMarkersEnabled: state.showSpaceMarkersEnabled,
    documentConfig: {
      table: state.documentConfig.table,
      tableLabel: state.documentConfig.tableLabel,
      linesPerPage: state.documentConfig.linesPerPage,
      charactersPerLine: state.documentConfig.charactersPerLine,
    },
    pages: state.pages.map((page) => page.slice()),
  };
}

function applyLoadedDocumentFromFile(loadedDocument, filePath) {
  if (!loadedDocument || typeof loadedDocument !== "object") {
    throw new Error("Le document .gbs est invalide.");
  }

  if (loadedDocument.format !== GBS_DOCUMENT_FORMAT) {
    throw new Error("Le fichier ne correspond pas au format .gbs attendu.");
  }

  if (loadedDocument.formatVersion !== GBS_DOCUMENT_FORMAT_VERSION) {
    throw new Error("La version du format .gbs n'est pas supportée.");
  }

  const config = loadedDocument.documentConfig;
  if (!config || typeof config !== "object") {
    throw new Error("La configuration du document .gbs est manquante.");
  }

  const selectedTable = findTableByPath(config.table);
  if (!selectedTable) {
    throw new Error("La table braille du document .gbs n'est pas supportée.");
  }

  const linesPerPage = ensureBoundedIntegerFromNumber(
    config.linesPerPage,
    "Nombre de lignes par page",
    1,
    60,
  );
  const charactersPerLine = ensureBoundedIntegerFromNumber(
    config.charactersPerLine,
    "Nombre de caractères par ligne",
    1,
    120,
  );

  if (!Array.isArray(loadedDocument.pages) || loadedDocument.pages.length === 0) {
    throw new Error("Le document .gbs ne contient aucune page.");
  }

  const normalizedPages = loadedDocument.pages.map((page, pageIndex) => {
    if (!Array.isArray(page) || page.length !== linesPerPage) {
      throw new Error(
        `La page ${pageIndex + 1} ne respecte pas le format de ${linesPerPage} lignes.`,
      );
    }

    return page.map((line, lineIndex) => {
      if (typeof line !== "string") {
        throw new Error(
          `La ligne ${lineIndex + 1} de la page ${pageIndex + 1} est invalide.`,
        );
      }

      if (line.length > charactersPerLine) {
        throw new Error(
          `La ligne ${lineIndex + 1} de la page ${pageIndex + 1} dépasse ` +
            `${charactersPerLine} caractères.`,
        );
      }

      return line;
    });
  });

  const createdAt =
    typeof loadedDocument.createdAt === "string"
      ? loadedDocument.createdAt
      : new Date().toISOString();
  const updatedAt =
    typeof loadedDocument.updatedAt === "string"
      ? loadedDocument.updatedAt
      : createdAt;

  const defaultDirection =
    loadedDocument.defaultDirection === "braille-to-text"
      ? "braille-to-text"
      : "text-to-braille";
  const inputMode = normalizeInputMode(loadedDocument.inputMode);
  const realtimeTranslationEnabled = normalizeRealtimeTranslationOption(
    loadedDocument.realtimeTranslationEnabled,
  );
  const showSpaceMarkersEnabled = normalizeShowSpaceMarkersOption(
    loadedDocument.showSpaceMarkersEnabled,
  );

  state.documentConfig = {
    table: selectedTable.table,
    tableLabel: selectedTable.label,
    linesPerPage,
    charactersPerLine,
  };
  state.documentMeta = {
    createdAt,
    updatedAt,
  };
  state.pages = normalizedPages;
  state.filePath = filePath;
  state.isDirty = false;

  tableSelect.value = selectedTable.table;
  linesPerPageInput.value = String(linesPerPage);
  charactersPerLineInput.value = String(charactersPerLine);
  setDirection(defaultDirection);
  setInputMode(inputMode, { announce: false });
  setRealtimeTranslationEnabled(realtimeTranslationEnabled, { announce: false });
  setShowSpaceMarkersEnabled(showSpaceMarkersEnabled, { announce: false });

  resetTranslationOutput();
  openDocumentEditor();
}

async function saveDocumentWithOptions(options = {}) {
  const { forcePrompt = false } = options;
  if (!state.documentConfig || isFileBusy || isTranslationBusy) {
    return;
  }

  isFileBusy = true;
  refreshAllActionStates();

  try {
    assertBrailleApiAvailable();

    const documentPayload = buildGbsDocumentPayload();
    const response = await window.brailleApi.saveDocument({
      document: documentPayload,
      filePath: forcePrompt ? null : state.filePath,
    });

    if (!response || typeof response !== "object") {
      throw new Error("La réponse de sauvegarde est invalide.");
    }

    if (response.canceled === true) {
      setStatus(
        documentStatusMessage,
        forcePrompt ? "Enregistrement sous annulé." : "Enregistrement annulé.",
        "neutral",
      );
      return;
    }

    if (typeof response.filePath !== "string" || response.filePath.length === 0) {
      throw new Error("Le chemin du document enregistré est invalide.");
    }

    state.filePath = response.filePath;
    state.isDirty = false;
    if (state.documentMeta) {
      state.documentMeta.updatedAt = documentPayload.updatedAt;
    }

    updateDocumentMetadata();
    setStatus(
      documentStatusMessage,
      `Document enregistré: ${toFileName(state.filePath)}.`,
      "success",
    );
  } catch (error) {
    setStatus(documentStatusMessage, `Erreur: ${getErrorMessage(error)}`, "error");
  } finally {
    isFileBusy = false;
    refreshAllActionStates();
  }
}

async function onSaveDocument() {
  await saveDocumentWithOptions();
}

async function onSaveDocumentAs() {
  await saveDocumentWithOptions({ forcePrompt: true });
}

async function onOpenDocument() {
  if (isCreateLoading || isCreateLocked || isFileBusy || isTranslationBusy) {
    return;
  }

  if (!confirmDiscardUnsavedChanges("ouvrir un autre document")) {
    setStatus(
      documentStatusMessage,
      "Ouverture annulée. Le document actuel est conservé.",
      "neutral",
    );
    return;
  }

  isFileBusy = true;
  refreshAllActionStates();

  try {
    assertBrailleApiAvailable();

    const response = await window.brailleApi.openDocument();
    if (!response || typeof response !== "object") {
      throw new Error("La réponse d'ouverture est invalide.");
    }

    if (response.canceled === true) {
      setStatus(documentStatusMessage, "Ouverture annulée.", "neutral");
      if (workspaceWelcomePanel && !workspaceWelcomePanel.hidden) {
        setStartupBrailleStatus("Ouverture annulée.", "neutral");
      }
      return;
    }

    if (typeof response.filePath !== "string" || response.filePath.length === 0) {
      throw new Error("Le chemin du fichier ouvert est invalide.");
    }

    applyLoadedDocumentFromFile(response.document, response.filePath);
    setStatus(
      documentStatusMessage,
      `Document ouvert: ${toFileName(response.filePath)}.`,
      "success",
    );
    setStatus(translationStatusMessage, "Document chargé. Prêt à traduire.", "neutral");
    focusLineInput(0, 0);
  } catch (error) {
    setStatus(documentStatusMessage, `Erreur: ${getErrorMessage(error)}`, "error");
    if (workspaceWelcomePanel && !workspaceWelcomePanel.hidden) {
      setStartupBrailleStatus(`Erreur d'ouverture: ${getErrorMessage(error)}`, "error");
    }
  } finally {
    isFileBusy = false;
    refreshAllActionStates();
  }
}

function onCloseDocumentRequest() {
  if (!state.documentConfig || isFileBusy || isTranslationBusy) {
    return;
  }

  if (!confirmDiscardUnsavedChanges("fermer le document")) {
    setStatus(
      documentStatusMessage,
      "Fermeture annulée. Le document actuel est conservé.",
      "neutral",
    );
    return;
  }

  closeCurrentDocument();
}

function onInputModeChange(event) {
  const input = event.currentTarget;
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  setInputMode(input.value);
}

function onRealtimeTranslationToggleChange(event) {
  const toggle = event.currentTarget;
  if (!(toggle instanceof HTMLInputElement)) {
    return;
  }

  setRealtimeTranslationEnabled(toggle.checked);
}

function onShowSpaceMarkersToggleChange(event) {
  const toggle = event.currentTarget;
  if (!(toggle instanceof HTMLInputElement)) {
    return;
  }

  setShowSpaceMarkersEnabled(toggle.checked);
}

function toggleRealtimeTranslation() {
  setRealtimeTranslationEnabled(!state.realtimeTranslationEnabled);
}

function onGlobalKeyDown(event) {
  if (event.defaultPrevented) {
    return;
  }

  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) {
    return;
  }

  if (event.key.toLowerCase() !== "t") {
    return;
  }

  if (!state.documentConfig || isTranslationBusy || isFileBusy) {
    return;
  }

  event.preventDefault();
  void runFullDocumentTranslation();
}

function onMenuActionRequest(payload) {
  if (!payload || typeof payload !== "object") {
    return;
  }

  if (payload.action === "new-document") {
    openNewDocumentCreationPanel();
    return;
  }

  if (payload.action === "open-document") {
    void onOpenDocument();
    return;
  }

  if (payload.action === "save-document") {
    void onSaveDocument();
    return;
  }

  if (payload.action === "save-document-as") {
    void onSaveDocumentAs();
    return;
  }

  if (payload.action === "translate-document") {
    void runFullDocumentTranslation();
    return;
  }

  if (payload.action === "center-active-line") {
    onCenterActiveLine();
    return;
  }

  if (payload.action === "set-realtime-translation") {
    if (typeof payload.enabled !== "boolean") {
      return;
    }

    setRealtimeTranslationEnabled(payload.enabled);
    return;
  }

  if (payload.action === "toggle-realtime-translation") {
    toggleRealtimeTranslation();
  }
}

async function bootstrap() {
  setWelcomePanelOpen(true);
  setNewDocumentPanelOpen(false);
  setEditorOpen(false);
  if (startupNormalText) {
    startupNormalText.textContent = STARTUP_TEXT_MESSAGE;
  }
  if (startupOriginText) {
    startupOriginText.textContent = STARTUP_ORIGIN_TEXT_MESSAGE;
  }
  if (startupBrailleOutput instanceof HTMLTextAreaElement) {
    startupBrailleOutput.value = "";
  }
  if (startupOriginBrailleOutput instanceof HTMLTextAreaElement) {
    startupOriginBrailleOutput.value = "";
  }
  setStartupBrailleStatus("Préparation de la traduction braille d’accueil…", "neutral");
  setStartupOriginBrailleStatus("Préparation de la traduction braille de l’origine du nom…", "neutral");
  setInputMode(INPUT_MODE_TEXT, { announce: false });
  setRealtimeTranslationEnabled(
    realtimeTranslationToggle instanceof HTMLInputElement
      ? realtimeTranslationToggle.checked
      : true,
    { announce: false },
  );
  setShowSpaceMarkersEnabled(
    showSpaceMarkersToggle instanceof HTMLInputElement
      ? showSpaceMarkersToggle.checked
      : false,
    { announce: false },
  );
  renderBrailleDotGuide();
  isCreateLoading = true;
  refreshAllActionStates();

  try {
    await initializeTables();
    isCreateLocked = false;
    await renderStartupWelcomeMessage({ focusBrailleOutput: true });
    setStatus(
      documentStatusMessage,
      "Utilise Ctrl/Cmd+N pour afficher la création de document.",
      "neutral",
    );
  } catch (error) {
    isCreateLocked = true;
    setStartupBrailleStatus(`Initialisation échouée: ${getErrorMessage(error)}`, "error");
    setStatus(documentStatusMessage, `Initialisation échouée: ${getErrorMessage(error)}`, "error");
  } finally {
    isCreateLoading = false;
    updateDocumentMetadata();
    refreshAllActionStates();
  }
}

newDocumentForm.addEventListener("submit", onCreateDocument);
openDocumentButton.addEventListener("click", onOpenDocument);
addPageButton.addEventListener("click", onAddPage);
centerActiveLineButton.addEventListener("click", onCenterActiveLine);
saveDocumentButton.addEventListener("click", onSaveDocument);
closeDocumentButton.addEventListener("click", onCloseDocumentRequest);
translationForm.addEventListener("submit", onTranslate);
inputModeRadios.forEach((radio) => {
  radio.addEventListener("change", onInputModeChange);
});
if (realtimeTranslationToggle instanceof HTMLInputElement) {
  realtimeTranslationToggle.addEventListener("change", onRealtimeTranslationToggleChange);
}
if (showSpaceMarkersToggle instanceof HTMLInputElement) {
  showSpaceMarkersToggle.addEventListener("change", onShowSpaceMarkersToggleChange);
}
window.addEventListener("keydown", onGlobalKeyDown);

if (typeof window.brailleApi?.onMenuAction === "function") {
  window.brailleApi.onMenuAction(onMenuActionRequest);
}

bootstrap();
