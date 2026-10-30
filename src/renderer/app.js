const GBS_DOCUMENT_FORMAT = "galarneau-braille-suite-document";
const GBS_DOCUMENT_FORMAT_VERSION = 2;
const DOCUMENT_TYPE_NORMAL = "normal";
const DOCUMENT_TYPE_BRAILLE = "braille";
const DOCUMENT_EXTENSION_BY_TYPE = Object.freeze({
  [DOCUMENT_TYPE_NORMAL]: ".gnp",
  [DOCUMENT_TYPE_BRAILLE]: ".gnb",
});
const INPUT_MODE_TEXT = "text";
const INPUT_MODE_BRAILLE = "braille-eight-key";
const LEGACY_INPUT_MODE_BRAILLE = "braille-six-key";
const APP_VERSION_LABEL = "1.0";
const STARTUP_TEXT_MESSAGE =
  `galarneau braille suite version ${APP_VERSION_LABEL} en la mémoire de Roland Galarneau.`;
const STARTUP_TEXT_BRAILLE_TABLE_ID = "fr-bfu-g2";
const BRAILLE_KEY_TO_DOT = Object.freeze({
  a: 7,
  f: 1,
  d: 2,
  s: 3,
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

const newDocumentPanel = document.querySelector("#new-document-panel");
const newDocumentForm = document.querySelector("#new-document-form");
const documentTypeRadios = document.querySelectorAll('input[name="document-type"]');
const tableSelect = document.querySelector("#table-select");
const linesPerPageInput = document.querySelector("#lines-per-page");
const charactersPerLineInput = document.querySelector("#characters-per-line");
const pageStructurePrintPagesToggle = document.querySelector("#page-structure-print-pages-toggle");
const pageStructureBraillePagesToggle = document.querySelector("#page-structure-braille-pages-toggle");
const pageStructureNumberBraillePagesToggle = document.querySelector(
  "#page-structure-number-braille-pages-toggle",
);
const pageStructureContinuePagesToggle = document.querySelector(
  "#page-structure-continue-pages-toggle",
);
const pageStructurePageSeparatorToggle = document.querySelector(
  "#page-structure-page-separator-toggle",
);
const pageStructurePageSeparatorNumberToggle = document.querySelector(
  "#page-structure-page-separator-number-toggle",
);
const pageStructurePrintPageNumberAtSelect = document.querySelector(
  "#page-structure-print-page-number-at",
);
const pageStructureBraillePageNumberAtSelect = document.querySelector(
  "#page-structure-braille-page-number-at",
);
const pageStructureBeginningPageNumberInput = document.querySelector(
  "#page-structure-beginning-page-number",
);
const pageStructureContentsToggle = document.querySelector(
  "#page-structure-contents-toggle",
);
const pageStructurePrintPageNumbersInContentsToggle = document.querySelector(
  "#page-structure-print-page-numbers-in-contents-toggle",
);
const pageStructureBraillePageNumbersInContentsToggle = document.querySelector(
  "#page-structure-braille-page-numbers-in-contents-toggle",
);
const pageStructureSplitIntoVolumesToggle = document.querySelector(
  "#page-structure-split-into-volumes-toggle",
);
const pageStructurePagesPerVolumeInput = document.querySelector(
  "#page-structure-pages-per-volume",
);
const linuxBrlapiOptionsField = document.querySelector("#linux-brlapi-options-field");
const linuxBrlapiEnabledToggle = document.querySelector("#linux-brlapi-enabled-toggle");
const linuxBrlapiStatus = document.querySelector("#linux-brlapi-status");
const createDocumentButton = document.querySelector("#create-document-button");
const openDocumentButton = document.querySelector("#open-document-button");
const documentStatusMessage = document.querySelector("#document-status-message");

const editorPanel = document.querySelector("#editor-panel");
const editorPages = document.querySelector("#editor-pages");
const addPageButton = document.querySelector("#add-page-button");
const centerActiveLineButton = document.querySelector("#center-active-line-button");
const applyBoldStyleButton = document.querySelector("#apply-bold-style-button");
const applyItalicStyleButton = document.querySelector("#apply-italic-style-button");
const applyUnderlineStyleButton = document.querySelector("#apply-underline-style-button");
const bfuStyleHelp = document.querySelector("#bfu-style-help");
const closeDocumentButton = document.querySelector("#close-document-button");
const saveDocumentButton = document.querySelector("#save-document-button");
const activeDocumentFile = document.querySelector("#active-document-file");
const activeTableLabel = document.querySelector("#active-table-label");
const activeDocumentFormat = document.querySelector("#active-document-format");

const translationForm = document.querySelector("#translation-form");
const translateButton = document.querySelector("#translate-button");
const translationInlineHelp = document.querySelector("#translation-inline-help");
const translationStatusMessage = document.querySelector("#translation-status-message");
const realtimeTranslationToggle = document.querySelector("#realtime-translation-toggle");
const showSpaceMarkersToggle = document.querySelector("#show-space-markers-toggle");
const directionRadios = document.querySelectorAll('input[name="direction"]');
const inputModeRadios = document.querySelectorAll('input[name="input-mode"]');
const brailleChordStatus = document.querySelector("#braille-chord-status");
const activeLineSpacePreview = document.querySelector("#active-line-space-preview");
const activeLineSpaceStatus = document.querySelector("#active-line-space-status");
const brailleDotElements = new Map(
  [1, 2, 3, 4, 5, 6, 7, 8].map((dot) => [dot, document.querySelector(`#braille-dot-${dot}`)]),
);

const state = {
  tables: [],
  runtimeInfo: null,
  documentConfig: null,
  documentMeta: null,
  pages: [],
  inlineTranslatedLines: [],
  documentType: DOCUMENT_TYPE_NORMAL,
  filePath: null,
  isDirty: false,
  inputMode: INPUT_MODE_TEXT,
  realtimeTranslationEnabled: true,
  showSpaceMarkersEnabled: false,
  styleSupportByTable: new Map(),
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
let styleSupportRequestId = 0;
const lineTranslationRequestIds = new Map();
const lineSourceTextById = new Map();
const linuxBrlapiState = {
  initialized: false,
  supported: false,
  available: false,
  displayColumns: 0,
  displayRows: 0,
  reason: null,
  unavailableNotified: false,
};
let linuxBrlapiEnabled = false;
let linuxBrlapiSyncTimerId = null;
let pendingLinuxBrlapiContext = null;

const BRAILLE_PREVIEW_DEBOUNCE_MS = 80;
const NORMAL_EDITOR_LINES_PER_PAGE = 120;
const TRANSLATION_EXECUTION_MODE_PREVIEW = "preview";
const TRANSLATION_EXECUTION_MODE_PRODUCTION = "production";
const PAGE_NUMBER_POSITION_VALUES = Object.freeze(["top", "bottom"]);
const DEFAULT_PAGE_LAYOUT = Object.freeze({
  printPages: true,
  braillePages: true,
  numberBraillePages: true,
  continuePages: true,
  pageSeparator: true,
  pageSeparatorNumber: true,
  printPageNumberAt: "top",
  braillePageNumberAt: "bottom",
  beginningPageNumber: 1,
  contents: false,
  printPageNumbersInContents: true,
  braillePageNumbersInContents: true,
  splitIntoVolumes: false,
  pagesPerVolume: 120,
});
const FORCED_PAGE_BREAK_MARKER = "[[GBS_PAGE_BREAK]]";
const FORCED_PAGE_BREAK_PREVIEW_LABEL = "Saut de page forcé";
const BFU_STYLE_HELP_DEFAULT_TEXT =
  "Sélectionne du texte dans la ligne active puis applique un style BFU. " +
  "Le document enregistre des balises (<b>/<gras>, <i>/<italique>, <u>/<souligne>/<surligne>/<surlignage>) " +
  "interprétées automatiquement lors de la traduction braille.";
const BFU_STYLE_TAG_BY_NAME = Object.freeze({
  bold: { openTag: "<b>", closeTag: "</b>", label: "gras" },
  italic: { openTag: "<i>", closeTag: "</i>", label: "italique" },
  underline: { openTag: "<u>", closeTag: "</u>", label: "surlignage" },
});
const BFU_STYLE_CLASS_BY_MARKUP_TAG = Object.freeze({
  b: "bold",
  strong: "bold",
  bold: "bold",
  gras: "bold",
  i: "italic",
  em: "italic",
  italic: "italic",
  italique: "italic",
  u: "underline",
  mark: "underline",
  underline: "underline",
  souligne: "underline",
  souligner: "underline",
  soulignement: "underline",
  surligne: "underline",
  surligner: "underline",
  surlignage: "underline",
  surlignement: "underline",
});
const LINUX_BRLAPI_MARKER_LEFT = String.fromCodePoint(0x2847); // dots 1-2-3-7
const LINUX_BRLAPI_MARKER_RIGHT = String.fromCodePoint(0x28b8); // dots 4-5-6-8
const LINUX_BRLAPI_SYNC_DEBOUNCE_MS = 35;

function configureLiveRegion(element, variant) {
  if (!element) {
    return;
  }

  const isError = variant === "error";
  element.setAttribute("role", isError ? "alert" : "status");
  element.setAttribute("aria-live", isError ? "assertive" : "polite");
  element.setAttribute("aria-atomic", "true");
}

function setStatus(element, message, variant = "neutral") {
  if (!element) {
    return;
  }

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

function getBrailleDisplayClientPlatform() {
  const platform = typeof navigator.platform === "string" ? navigator.platform.toLowerCase() : "";
  if (platform.includes("linux")) {
    return "linux";
  }

  if (platform.includes("win")) {
    return "windows";
  }

  const userAgent = typeof navigator.userAgent === "string" ? navigator.userAgent.toLowerCase() : "";
  if (userAgent.includes("linux")) {
    return "linux";
  }

  if (userAgent.includes("windows")) {
    return "windows";
  }

  return null;
}

function isBrailleDisplayClientPlatform() {
  return getBrailleDisplayClientPlatform() !== null;
}

function getBrailleDisplayTransportLabel() {
  const platform = getBrailleDisplayClientPlatform();
  if (platform === "linux") {
    return "BRLAPI";
  }

  if (platform === "windows") {
    return "NVDA";
  }

  return "service braille externe";
}

function getBrailleDisplayStatusInvoker() {
  if (typeof window.brailleApi?.getDisplayStatus === "function") {
    return () => window.brailleApi.getDisplayStatus();
  }

  if (typeof window.brailleApi?.getLinuxBrlapiStatus === "function") {
    return () => window.brailleApi.getLinuxBrlapiStatus();
  }

  return null;
}

function getBrailleDisplayWriteInvoker() {
  if (typeof window.brailleApi?.writeDisplay === "function") {
    return (payload) => window.brailleApi.writeDisplay(payload);
  }

  if (typeof window.brailleApi?.writeLinuxBrlapiDisplay === "function") {
    return (payload) => window.brailleApi.writeLinuxBrlapiDisplay(payload);
  }

  return null;
}

function getBrailleDisplayClearInvoker() {
  if (typeof window.brailleApi?.clearDisplay === "function") {
    return () => window.brailleApi.clearDisplay();
  }

  if (typeof window.brailleApi?.clearLinuxBrlapiDisplay === "function") {
    return () => window.brailleApi.clearLinuxBrlapiDisplay();
  }

  return null;
}

function normalizeLinuxBrlapiText(inputText) {
  return typeof inputText === "string" ? inputText.replace(/\r?\n/gu, " ") : "";
}

function buildLinuxBrlapiLimitSegment(lineText, charactersPerLine) {
  const safeCharactersPerLine = Number.isInteger(charactersPerLine)
    ? Math.max(1, charactersPerLine)
    : 1;
  const normalizedLineText = normalizeLinuxBrlapiText(lineText);
  const lineCharacters = Array.from(normalizedLineText);
  const visibleCharacterCount = Math.min(lineCharacters.length, Math.max(0, safeCharactersPerLine - 1));

  const limitedCells = [];
  for (let characterPosition = 1; characterPosition <= safeCharactersPerLine; characterPosition += 1) {
    if (characterPosition === safeCharactersPerLine) {
      limitedCells.push(LINUX_BRLAPI_MARKER_RIGHT);
      continue;
    }

    limitedCells.push(lineCharacters[characterPosition - 1] ?? " ");
  }

  const counterLabel = `${visibleCharacterCount}/${safeCharactersPerLine}`;
  return `${LINUX_BRLAPI_MARKER_LEFT}${counterLabel}${LINUX_BRLAPI_MARKER_RIGHT} ` +
    `${LINUX_BRLAPI_MARKER_LEFT}${limitedCells.join("")}`;
}

function buildLinuxBrlapiDisplayText(context) {
  if (!context || typeof context !== "object") {
    return "";
  }

  const pageIndex = Number.isInteger(context.pageIndex) ? context.pageIndex : 0;
  const lineIndex = Number.isInteger(context.lineIndex) ? context.lineIndex : 0;
  const characterIndex = Number.isInteger(context.characterIndex)
    ? Math.max(1, context.characterIndex)
    : 1;
  const positionLabel = `p${pageIndex + 1}l${lineIndex + 1}c${characterIndex}`;

  const header = `${LINUX_BRLAPI_MARKER_LEFT}${positionLabel}${LINUX_BRLAPI_MARKER_RIGHT}`;
  const limitSegment = buildLinuxBrlapiLimitSegment(context.lineValue, context.charactersPerLine);
  return `${header} ${limitSegment}`;
}

function updateLinuxBrlapiAvailabilityFromResponse(response) {
  if (!response || typeof response !== "object") {
    refreshLinuxBrlapiOptionsUI();
    return;
  }

  linuxBrlapiState.supported = response.supported === true;
  linuxBrlapiState.available = response.available === true;
  linuxBrlapiState.displayColumns = Number.isInteger(response.displayColumns)
    ? Math.max(0, response.displayColumns)
    : 0;
  linuxBrlapiState.displayRows = Number.isInteger(response.displayRows)
    ? Math.max(0, response.displayRows)
    : 0;
  linuxBrlapiState.reason =
    typeof response.reason === "string" && response.reason.length > 0
      ? response.reason
      : null;

  if (!linuxBrlapiState.available) {
    linuxBrlapiEnabled = false;
  }

  refreshLinuxBrlapiOptionsUI();
}

function refreshLinuxBrlapiOptionsUI() {
  const platform = getBrailleDisplayClientPlatform();
  const platformSupported = platform !== null;
  const transportLabel = getBrailleDisplayTransportLabel();
  const disableForCreationFlow = isCreateLoading || isCreateLocked || isFileBusy;

  if (linuxBrlapiOptionsField instanceof HTMLElement) {
    linuxBrlapiOptionsField.hidden = !platformSupported;
  }

  if (linuxBrlapiEnabledToggle instanceof HTMLInputElement) {
    linuxBrlapiEnabledToggle.checked = linuxBrlapiEnabled;
    linuxBrlapiEnabledToggle.disabled =
      disableForCreationFlow ||
      !platformSupported ||
      !linuxBrlapiState.available;
  }

  if (linuxBrlapiStatus instanceof HTMLElement) {
    if (!platformSupported) {
      linuxBrlapiStatus.textContent = "Option disponible sous Linux (BRLAPI) ou Windows (NVDA).";
      return;
    }

    if (!linuxBrlapiState.available) {
      const reason =
        typeof linuxBrlapiState.reason === "string" && linuxBrlapiState.reason.length > 0
          ? linuxBrlapiState.reason
          : `${transportLabel} non disponible.`;
      linuxBrlapiStatus.textContent = `Indisponible: ${reason}`;
      return;
    }

    linuxBrlapiStatus.textContent = linuxBrlapiEnabled
      ? `Sortie ${transportLabel} active pour la ligne braille courante.`
      : `Disponible (${transportLabel}). Active via la case ci-dessus ou Ctrl/Cmd+Maj+B.`;
  }
}

function notifyLinuxBrlapiUnavailable() {
  if (
    linuxBrlapiState.unavailableNotified ||
    linuxBrlapiState.available ||
    !linuxBrlapiEnabled
  ) {
    return;
  }

  linuxBrlapiState.unavailableNotified = true;
  const transportLabel = getBrailleDisplayTransportLabel();
  const reason =
    typeof linuxBrlapiState.reason === "string" && linuxBrlapiState.reason.length > 0
      ? linuxBrlapiState.reason
      : `Service ${transportLabel} indisponible.`;
  setStatus(translationStatusMessage, `Sortie ${transportLabel} indisponible: ${reason}`, "neutral");
}

function setLinuxBrlapiEnabled(isEnabled, options = {}) {
  const { announce = true } = options;
  const nextEnabled = isEnabled === true;
  const transportLabel = getBrailleDisplayTransportLabel();

  if (!isBrailleDisplayClientPlatform()) {
    linuxBrlapiEnabled = false;
    refreshLinuxBrlapiOptionsUI();
    return;
  }

  if (nextEnabled && !linuxBrlapiState.available) {
    linuxBrlapiEnabled = false;
    refreshLinuxBrlapiOptionsUI();
    if (announce) {
      const reason =
        typeof linuxBrlapiState.reason === "string" && linuxBrlapiState.reason.length > 0
          ? linuxBrlapiState.reason
          : `${transportLabel} est indisponible sur ce systeme.`;
      setStatus(documentStatusMessage, `Impossible d'activer la sortie braille externe: ${reason}`, "neutral");
    }
    return;
  }

  linuxBrlapiEnabled = nextEnabled;
  linuxBrlapiState.unavailableNotified = false;
  refreshLinuxBrlapiOptionsUI();

  if (!linuxBrlapiEnabled) {
    void clearLinuxBrlapiDisplay();
    if (announce) {
      setStatus(documentStatusMessage, "Affichage braille externe desactive.", "neutral");
    }
    return;
  }

  if (announce) {
    setStatus(
      documentStatusMessage,
      `Affichage ${transportLabel} active (Ctrl/Cmd+Maj+B pour basculer).`,
      "success",
    );
  }

  const activeElement = document.activeElement;
  if (isLineInput(activeElement)) {
    updateLinePositionLabel(activeElement);
  }
}

function toggleLinuxBrlapiEnabled(options = {}) {
  setLinuxBrlapiEnabled(!linuxBrlapiEnabled, options);
}

function flushLinuxBrlapiSync() {
  linuxBrlapiSyncTimerId = null;

  if (!pendingLinuxBrlapiContext || !linuxBrlapiState.available || !linuxBrlapiEnabled) {
    return;
  }

  const writeDisplay = getBrailleDisplayWriteInvoker();
  if (!writeDisplay) {
    return;
  }

  const displayText = buildLinuxBrlapiDisplayText(pendingLinuxBrlapiContext);
  pendingLinuxBrlapiContext = null;

  if (displayText.length === 0) {
    return;
  }

  void writeDisplay({ text: displayText })
    .then((response) => {
      updateLinuxBrlapiAvailabilityFromResponse(response);
      if (!linuxBrlapiState.available) {
        notifyLinuxBrlapiUnavailable();
      }
    })
    .catch((error) => {
      linuxBrlapiState.available = false;
      linuxBrlapiState.reason = getErrorMessage(error);
      notifyLinuxBrlapiUnavailable();
    });
}

function queueLinuxBrlapiSync(lineInput, linePosition, characterIndex) {
  if (!(lineInput instanceof HTMLInputElement) || !linePosition || !state.documentConfig) {
    return;
  }

  if (document.activeElement !== lineInput || state.documentType !== DOCUMENT_TYPE_BRAILLE) {
    return;
  }

  if (!linuxBrlapiState.initialized || !linuxBrlapiState.available || !linuxBrlapiEnabled) {
    return;
  }

  pendingLinuxBrlapiContext = {
    pageIndex: linePosition.pageIndex,
    lineIndex: linePosition.lineIndex,
    characterIndex,
    lineValue: lineInput.value,
    charactersPerLine: state.documentConfig.charactersPerLine,
  };

  if (linuxBrlapiSyncTimerId !== null) {
    window.clearTimeout(linuxBrlapiSyncTimerId);
  }

  linuxBrlapiSyncTimerId = window.setTimeout(flushLinuxBrlapiSync, LINUX_BRLAPI_SYNC_DEBOUNCE_MS);
}

async function clearLinuxBrlapiDisplay() {
  pendingLinuxBrlapiContext = null;
  if (linuxBrlapiSyncTimerId !== null) {
    window.clearTimeout(linuxBrlapiSyncTimerId);
    linuxBrlapiSyncTimerId = null;
  }

  if (
    !linuxBrlapiState.initialized ||
    !linuxBrlapiState.available
  ) {
    return;
  }

  const clearDisplay = getBrailleDisplayClearInvoker();
  if (!clearDisplay) {
    return;
  }

  try {
    const response = await clearDisplay();
    updateLinuxBrlapiAvailabilityFromResponse(response);
  } catch (error) {
    linuxBrlapiState.available = false;
    linuxBrlapiState.reason = getErrorMessage(error);
    notifyLinuxBrlapiUnavailable();
  }
}

async function initializeLinuxBrlapiSupport() {
  linuxBrlapiEnabled = false;
  linuxBrlapiState.initialized = true;
  linuxBrlapiState.supported = false;
  linuxBrlapiState.available = false;
  linuxBrlapiState.displayColumns = 0;
  linuxBrlapiState.displayRows = 0;
  linuxBrlapiState.reason = null;
  linuxBrlapiState.unavailableNotified = false;

  const getStatus = getBrailleDisplayStatusInvoker();

  if (!isBrailleDisplayClientPlatform() || !getStatus) {
    refreshLinuxBrlapiOptionsUI();
    return;
  }

  try {
    const response = await getStatus();
    updateLinuxBrlapiAvailabilityFromResponse(response);
  } catch (error) {
    linuxBrlapiState.supported = true;
    linuxBrlapiState.available = false;
    linuxBrlapiState.reason = getErrorMessage(error);
  }

  refreshLinuxBrlapiOptionsUI();
}

function parseBfuStyleTagAt(inputText, startIndex) {
  if (inputText[startIndex] !== "<") {
    return null;
  }

  const closingBracketIndex = inputText.indexOf(">", startIndex + 1);
  if (closingBracketIndex === -1) {
    return null;
  }

  const rawTagContent = inputText
    .slice(startIndex + 1, closingBracketIndex)
    .trim()
    .toLowerCase();
  if (rawTagContent.length === 0) {
    return null;
  }

  const isClosingTag = rawTagContent.startsWith("/");
  const rawTagName = isClosingTag ? rawTagContent.slice(1).trim() : rawTagContent;
  const tagParts = rawTagName.split(/\s+/u);
  const firstTagPart = tagParts.length > 0 ? tagParts[0] : "";
  const normalizedTagName = firstTagPart.replace(/\/$/u, "");
  if (normalizedTagName.length === 0) {
    return null;
  }

  const styleClass = BFU_STYLE_CLASS_BY_MARKUP_TAG[normalizedTagName];
  if (!styleClass) {
    return null;
  }

  return {
    styleClass,
    isClosingTag,
    length: closingBracketIndex - startIndex + 1,
  };
}

function isStyleClassActiveAtTextPosition(inputText, position, styleClass) {
  if (typeof inputText !== "string" || typeof styleClass !== "string") {
    return false;
  }

  const safePosition = Math.max(0, Math.min(position, inputText.length));
  let depth = 0;
  let index = 0;

  while (index < safePosition) {
    const styleTag = parseBfuStyleTagAt(inputText, index);
    if (styleTag) {
      if (styleTag.styleClass === styleClass) {
        if (styleTag.isClosingTag) {
          depth = Math.max(0, depth - 1);
        } else {
          depth += 1;
        }
      }

      index += styleTag.length;
      continue;
    }

    index += 1;
  }

  return depth > 0;
}

function getLineSelectionRange(lineInput) {
  const valueLength = lineInput.value.length;
  const selectionStart = lineInput.selectionStart ?? valueLength;
  const selectionEnd = lineInput.selectionEnd ?? selectionStart;

  return {
    selectionStart,
    selectionEnd,
    isEmpty: selectionStart === selectionEnd,
  };
}

function updateLineInputBfuVisualState(lineInput) {
  if (!isLineInput(lineInput)) {
    return;
  }

  if (state.documentType !== DOCUMENT_TYPE_NORMAL) {
    lineInput.classList.remove("is-italic-mode");
    return;
  }

  const { selectionStart } = getLineSelectionRange(lineInput);
  const italicModeActive = isStyleClassActiveAtTextPosition(
    lineInput.value,
    selectionStart,
    "italic",
  );

  lineInput.classList.toggle("is-italic-mode", italicModeActive);
}

function refreshCreationFormState() {
  const disableForm = isCreateLoading || isCreateLocked || isFileBusy;

  documentTypeRadios.forEach((radio) => {
    if (radio instanceof HTMLInputElement) {
      radio.disabled = disableForm;
    }
  });
  tableSelect.disabled = disableForm;
  linesPerPageInput.disabled = disableForm;
  charactersPerLineInput.disabled = disableForm;
  if (pageStructurePrintPagesToggle instanceof HTMLInputElement) {
    pageStructurePrintPagesToggle.disabled = disableForm;
  }
  if (pageStructureBraillePagesToggle instanceof HTMLInputElement) {
    pageStructureBraillePagesToggle.disabled = disableForm;
  }
  if (pageStructureNumberBraillePagesToggle instanceof HTMLInputElement) {
    pageStructureNumberBraillePagesToggle.disabled = disableForm;
  }
  if (pageStructureContinuePagesToggle instanceof HTMLInputElement) {
    pageStructureContinuePagesToggle.disabled = disableForm;
  }
  if (pageStructurePageSeparatorToggle instanceof HTMLInputElement) {
    pageStructurePageSeparatorToggle.disabled = disableForm;
  }
  if (pageStructurePageSeparatorNumberToggle instanceof HTMLInputElement) {
    pageStructurePageSeparatorNumberToggle.disabled = disableForm;
  }
  if (pageStructurePrintPageNumberAtSelect instanceof HTMLSelectElement) {
    pageStructurePrintPageNumberAtSelect.disabled = disableForm;
  }
  if (pageStructureBraillePageNumberAtSelect instanceof HTMLSelectElement) {
    pageStructureBraillePageNumberAtSelect.disabled = disableForm;
  }
  if (pageStructureBeginningPageNumberInput instanceof HTMLInputElement) {
    pageStructureBeginningPageNumberInput.disabled = disableForm;
  }
  if (pageStructureContentsToggle instanceof HTMLInputElement) {
    pageStructureContentsToggle.disabled = disableForm;
  }
  if (pageStructurePrintPageNumbersInContentsToggle instanceof HTMLInputElement) {
    pageStructurePrintPageNumbersInContentsToggle.disabled = disableForm;
  }
  if (pageStructureBraillePageNumbersInContentsToggle instanceof HTMLInputElement) {
    pageStructureBraillePageNumbersInContentsToggle.disabled = disableForm;
  }
  if (pageStructureSplitIntoVolumesToggle instanceof HTMLInputElement) {
    pageStructureSplitIntoVolumesToggle.disabled = disableForm;
  }
  if (pageStructurePagesPerVolumeInput instanceof HTMLInputElement) {
    pageStructurePagesPerVolumeInput.disabled = disableForm;
  }
  if (linuxBrlapiEnabledToggle instanceof HTMLInputElement) {
    linuxBrlapiEnabledToggle.disabled =
      disableForm ||
      !isBrailleDisplayClientPlatform() ||
      !linuxBrlapiState.available;
  }
  createDocumentButton.disabled = disableForm;
  openDocumentButton.disabled = disableForm;
  createDocumentButton.textContent = isCreateLoading
    ? "Chargement des tables…"
    : "Créer le document";

  if (!disableForm) {
    refreshPageLayoutControlState();
  }

  refreshLinuxBrlapiOptionsUI();
}

function refreshTranslationButton() {
  const isBrailleDocument =
    state.documentConfig !== null && state.documentType === DOCUMENT_TYPE_BRAILLE;
  translateButton.disabled =
    isTranslationBusy ||
    isFileBusy ||
    state.documentConfig === null ||
    isBrailleDocument;

  if (isBrailleDocument) {
    translateButton.textContent = "Conversion braille instantanée active";
    return;
  }

  translateButton.textContent = isTranslationBusy
    ? "Traduction en cours…"
    : "Traduire le document";
}

function refreshDocumentActionButtons() {
  const hasDocument = state.documentConfig !== null;
  const isBrailleDocument = hasDocument && state.documentType === DOCUMENT_TYPE_BRAILLE;
  const shouldDisableInputs = !hasDocument || isFileBusy || isTranslationBusy;
  const styleSupport = getCurrentTableStyleSupport();
  const isBoldUnsupported =
    styleSupport !== null && styleSupport.emphasisClasses.bold.supported === false;
  const isItalicUnsupported =
    styleSupport !== null && styleSupport.emphasisClasses.italic.supported === false;
  const isUnderlineUnsupported =
    styleSupport !== null && styleSupport.emphasisClasses.underline.supported === false;

  addPageButton.disabled = !hasDocument || isFileBusy || isTranslationBusy;
  centerActiveLineButton.disabled = !hasDocument || isFileBusy || isTranslationBusy;
  const disableBfuStyleActions =
    !hasDocument || isFileBusy || isTranslationBusy || isBrailleDocument;
  if (applyBoldStyleButton instanceof HTMLButtonElement) {
    applyBoldStyleButton.disabled = disableBfuStyleActions || isBoldUnsupported;
  }
  if (applyItalicStyleButton instanceof HTMLButtonElement) {
    applyItalicStyleButton.disabled = disableBfuStyleActions || isItalicUnsupported;
  }
  if (applyUnderlineStyleButton instanceof HTMLButtonElement) {
    applyUnderlineStyleButton.disabled = disableBfuStyleActions || isUnderlineUnsupported;
  }
  closeDocumentButton.disabled = !hasDocument || isFileBusy || isTranslationBusy;
  saveDocumentButton.disabled = !hasDocument || isFileBusy || isTranslationBusy;
  if (showSpaceMarkersToggle instanceof HTMLInputElement) {
    showSpaceMarkersToggle.disabled = !hasDocument || isFileBusy || isTranslationBusy;
  }

  inputModeRadios.forEach((radio) => {
    if (!(radio instanceof HTMLInputElement)) {
      return;
    }

    radio.disabled = shouldDisableInputs;
  });

  if (realtimeTranslationToggle instanceof HTMLInputElement) {
    realtimeTranslationToggle.disabled = shouldDisableInputs || isBrailleDocument;
  }

  directionRadios.forEach((radio) => {
    if (!(radio instanceof HTMLInputElement)) {
      return;
    }

    radio.disabled = shouldDisableInputs || isBrailleDocument;
  });

  if (!shouldDisableInputs && !isBrailleDocument) {
    setDirectionControlsForRealtime(state.realtimeTranslationEnabled);
  }
}

function refreshAllActionStates() {
  refreshCreationFormState();
  refreshTranslationButton();
  refreshDocumentActionButtons();
  updateTranslationInlineHelp();
  updateBfuStyleHelp();
}

function isBrailleOnlyEditorMode() {
  return state.documentConfig !== null && state.documentType === DOCUMENT_TYPE_BRAILLE;
}

function updateTranslationInlineHelp() {
  if (!(translationInlineHelp instanceof HTMLElement)) {
    return;
  }

  if (isBrailleOnlyEditorMode()) {
    translationInlineHelp.textContent =
      state.inputMode === INPUT_MODE_TEXT
        ? "Mode braille actif: tape au clavier standard, la ligne est convertie en braille à mesure de la saisie."
        : "Mode braille actif: saisie braille 8 points directe dans la ligne.";
    return;
  }

  translationInlineHelp.textContent =
    "La traduction instantanée et la traduction complète apparaissent sous chaque ligne.";
}

function getCurrentTableStyleSupport() {
  if (!state.documentConfig) {
    return null;
  }

  return state.styleSupportByTable.get(state.documentConfig.table) ?? null;
}

function isStyleSupportedByCurrentTable(styleName) {
  const styleSupport = getCurrentTableStyleSupport();
  if (!styleSupport || !styleSupport.emphasisClasses || !styleSupport.emphasisClasses[styleName]) {
    return true;
  }

  return styleSupport.emphasisClasses[styleName].supported;
}

function getUnsupportedBfuStyleLabels(styleSupport) {
  if (!styleSupport || !styleSupport.emphasisClasses) {
    return [];
  }

  return Object.entries(BFU_STYLE_TAG_BY_NAME)
    .filter(([styleName]) => styleSupport.emphasisClasses[styleName]?.supported === false)
    .map(([, styleMeta]) => styleMeta.label);
}

function updateBfuStyleHelp() {
  if (!(bfuStyleHelp instanceof HTMLElement)) {
    return;
  }

  if (!state.documentConfig) {
    bfuStyleHelp.textContent = BFU_STYLE_HELP_DEFAULT_TEXT;
    return;
  }

  if (state.documentType === DOCUMENT_TYPE_BRAILLE) {
    bfuStyleHelp.textContent =
      "La mise en forme BFU se prépare en document normal (.gnp), puis s'applique automatiquement pendant la traduction.";
    return;
  }

  const styleSupport = getCurrentTableStyleSupport();
  if (!styleSupport) {
    bfuStyleHelp.textContent =
      "Vérification en cours de la table active pour les indicateurs BFU (italique, gras, surlignage/soulignement).";
    return;
  }

  const unsupportedStyleLabels = getUnsupportedBfuStyleLabels(styleSupport);
  if (unsupportedStyleLabels.length > 0) {
    bfuStyleHelp.textContent =
      `La table active ne déclare pas tous les styles demandés. Styles indisponibles: ${unsupportedStyleLabels.join(", ")}.`;
    return;
  }

  if (styleSupport.bfuReference) {
    const reference = styleSupport.bfuReference;
    const fallbackNote =
      reference.effectiveClassFallbacks?.underline === "italic"
        ? " Compatibilité moteur active: le surlignage est appliqué via la classe italic."
        : " Le surlignage est mappé sur la classe soulignement BFU.";
    bfuStyleHelp.textContent =
      `Conformité BFU active (${reference.sourceTable}) : classes ${reference.emphasisClasses.join(
        ", ",
      )}; mot ${reference.wordOpeningIndicator}…${reference.wordClosingIndicator}; ` +
      `phrase ${reference.phraseOpeningIndicator} (fermeture ${reference.phraseClosingIndicator}); ` +
      `seuil ${reference.phraseWordThreshold} mots; caractères exclus ${reference.noEmphasisCharacters}.` +
      fallbackNote;
    return;
  }

  bfuStyleHelp.textContent =
    "La table active prend en charge les classes d'emphase liblouis (gras, italique, surlignage/soulignement).";
}

async function refreshActiveTableStyleSupport() {
  if (!state.documentConfig || typeof window.brailleApi?.getStyleSupport !== "function") {
    return;
  }

  const activeTable = state.documentConfig.table;
  if (state.styleSupportByTable.has(activeTable)) {
    refreshAllActionStates();
    return;
  }

  const currentRequestId = ++styleSupportRequestId;
  updateBfuStyleHelp();

  try {
    const response = await window.brailleApi.getStyleSupport({ table: activeTable });
    if (styleSupportRequestId !== currentRequestId) {
      return;
    }

    const emphasisClasses = response?.emphasisClasses;
    state.styleSupportByTable.set(activeTable, {
      table: activeTable,
      emphasisClasses: {
        bold: {
          supported: emphasisClasses?.bold?.supported === true,
          typeformMask: Number.isInteger(emphasisClasses?.bold?.typeformMask)
            ? emphasisClasses.bold.typeformMask
            : 0,
        },
        italic: {
          supported: emphasisClasses?.italic?.supported === true,
          typeformMask: Number.isInteger(emphasisClasses?.italic?.typeformMask)
            ? emphasisClasses.italic.typeformMask
            : 0,
        },
        underline: {
          supported: emphasisClasses?.underline?.supported === true,
          typeformMask: Number.isInteger(emphasisClasses?.underline?.typeformMask)
            ? emphasisClasses.underline.typeformMask
            : 0,
        },
      },
      allSupported: response?.allSupported === true,
      bfuReference:
        response?.bfuReference && typeof response.bfuReference === "object"
          ? response.bfuReference
          : null,
    });
  } catch (error) {
    if (styleSupportRequestId !== currentRequestId) {
      return;
    }

    state.styleSupportByTable.set(activeTable, {
      table: activeTable,
      emphasisClasses: {
        bold: { supported: true, typeformMask: 0 },
        italic: { supported: true, typeformMask: 0 },
        underline: { supported: true, typeformMask: 0 },
      },
      allSupported: true,
      bfuReference: null,
    });

    setStatus(
      documentStatusMessage,
      `Impossible de vérifier la conformité des styles pour la table active: ${getErrorMessage(error)}`,
      "neutral",
    );
  } finally {
    if (styleSupportRequestId === currentRequestId) {
      refreshAllActionStates();
    }
  }
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

function normalizeDocumentType(value) {
  return value === DOCUMENT_TYPE_BRAILLE ? DOCUMENT_TYPE_BRAILLE : DOCUMENT_TYPE_NORMAL;
}

function getDocumentExtension(documentType = state.documentType) {
  const normalizedType = normalizeDocumentType(documentType);
  return DOCUMENT_EXTENSION_BY_TYPE[normalizedType];
}

function getDocumentTypeLabel(documentType = state.documentType) {
  const normalizedType = normalizeDocumentType(documentType);
  return normalizedType === DOCUMENT_TYPE_BRAILLE
    ? "document braille"
    : "document normal";
}

function withDocumentExtension(filePath, documentType = state.documentType) {
  const extension = getDocumentExtension(documentType);
  if (typeof filePath !== "string" || filePath.length === 0) {
    return `document${extension}`;
  }

  if (filePath.toLowerCase().endsWith(extension)) {
    return filePath;
  }

  const hasExtension = /\.[^./\\]+$/.test(filePath);
  if (!hasExtension) {
    return `${filePath}${extension}`;
  }

  return filePath.replace(/\.[^./\\]+$/, extension);
}

function toCompanionBraillePath(filePath) {
  return withDocumentExtension(filePath, DOCUMENT_TYPE_BRAILLE);
}

function toVolumeBraillePath(filePath, volumeIndex) {
  const safeVolumeIndex = Number.isInteger(volumeIndex) && volumeIndex > 0 ? volumeIndex : 1;
  const volumeSuffix = `-vol${String(safeVolumeIndex).padStart(2, "0")}`;
  const companionPath = toCompanionBraillePath(filePath);

  if (typeof companionPath !== "string" || companionPath.length === 0) {
    return `document${volumeSuffix}${getDocumentExtension(DOCUMENT_TYPE_BRAILLE)}`;
  }

  if (companionPath.toLowerCase().endsWith(".gnb")) {
    return `${companionPath.slice(0, -4)}${volumeSuffix}.gnb`;
  }

  return `${companionPath}${volumeSuffix}`;
}

function toFileName(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0) {
    return `document${getDocumentExtension()}`;
  }

  const chunks = filePath.split(/[/\\]/);
  return chunks[chunks.length - 1] || `document${getDocumentExtension()}`;
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

async function initializeRuntimeInfo() {
  if (typeof window.brailleApi?.getRuntimeInfo !== "function") {
    state.runtimeInfo = null;
    return;
  }

  try {
    const runtimeInfo = await window.brailleApi.getRuntimeInfo();
    state.runtimeInfo = runtimeInfo && typeof runtimeInfo === "object" ? runtimeInfo : null;
  } catch (_error) {
    state.runtimeInfo = null;
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

async function translateTextToStartupBraille(inputText) {
  const startupTable = findTableById(STARTUP_TEXT_BRAILLE_TABLE_ID);
  if (!startupTable) {
    throw new Error("La table de traduction de l’accueil est introuvable.");
  }

  const response = await window.brailleApi.translate({
    table: startupTable.table,
    direction: "text-to-braille",
    executionMode: TRANSLATION_EXECUTION_MODE_PREVIEW,
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

  if (startupBrailleOutput instanceof HTMLTextAreaElement) {
    setStartupBrailleStatus("Traduction braille de l’accueil en cours…", "neutral");
    try {
      startupBrailleOutput.value = await translateTextToStartupBraille(STARTUP_TEXT_MESSAGE);
      setStartupBrailleStatus(
        "Message d’accueil traduit en braille français.",
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

function normalizePageNumberPosition(value, fallbackValue) {
  if (typeof value !== "string") {
    return fallbackValue;
  }

  const normalizedValue = value.trim().toLowerCase();
  if (PAGE_NUMBER_POSITION_VALUES.includes(normalizedValue)) {
    return normalizedValue;
  }

  return fallbackValue;
}

function normalizePageLayoutConfig(rawConfig) {
  const source = rawConfig && typeof rawConfig === "object" ? rawConfig : {};

  const beginningPageNumber = Number.isInteger(source.beginningPageNumber)
    ? source.beginningPageNumber
    : Number.parseInt(source.beginningPageNumber ?? "", 10);
  const pagesPerVolume = Number.isInteger(source.pagesPerVolume)
    ? source.pagesPerVolume
    : Number.parseInt(source.pagesPerVolume ?? "", 10);

  return {
    printPages:
      typeof source.printPages === "boolean"
        ? source.printPages
        : DEFAULT_PAGE_LAYOUT.printPages,
    braillePages:
      typeof source.braillePages === "boolean"
        ? source.braillePages
        : DEFAULT_PAGE_LAYOUT.braillePages,
    numberBraillePages:
      typeof source.numberBraillePages === "boolean"
        ? source.numberBraillePages
        : DEFAULT_PAGE_LAYOUT.numberBraillePages,
    continuePages:
      typeof source.continuePages === "boolean"
        ? source.continuePages
        : DEFAULT_PAGE_LAYOUT.continuePages,
    pageSeparator:
      typeof source.pageSeparator === "boolean"
        ? source.pageSeparator
        : DEFAULT_PAGE_LAYOUT.pageSeparator,
    pageSeparatorNumber:
      typeof source.pageSeparatorNumber === "boolean"
        ? source.pageSeparatorNumber
        : DEFAULT_PAGE_LAYOUT.pageSeparatorNumber,
    printPageNumberAt: normalizePageNumberPosition(
      source.printPageNumberAt,
      DEFAULT_PAGE_LAYOUT.printPageNumberAt,
    ),
    braillePageNumberAt: normalizePageNumberPosition(
      source.braillePageNumberAt,
      DEFAULT_PAGE_LAYOUT.braillePageNumberAt,
    ),
    beginningPageNumber: ensureBoundedIntegerFromNumber(
      Number.isInteger(beginningPageNumber)
        ? beginningPageNumber
        : DEFAULT_PAGE_LAYOUT.beginningPageNumber,
      "Numéro de début des pages braille",
      1,
      9999,
    ),
    contents:
      typeof source.contents === "boolean"
        ? source.contents
        : DEFAULT_PAGE_LAYOUT.contents,
    printPageNumbersInContents:
      typeof source.printPageNumbersInContents === "boolean"
        ? source.printPageNumbersInContents
        : DEFAULT_PAGE_LAYOUT.printPageNumbersInContents,
    braillePageNumbersInContents:
      typeof source.braillePageNumbersInContents === "boolean"
        ? source.braillePageNumbersInContents
        : DEFAULT_PAGE_LAYOUT.braillePageNumbersInContents,
    splitIntoVolumes:
      typeof source.splitIntoVolumes === "boolean"
        ? source.splitIntoVolumes
        : DEFAULT_PAGE_LAYOUT.splitIntoVolumes,
    pagesPerVolume: ensureBoundedIntegerFromNumber(
      Number.isInteger(pagesPerVolume)
        ? pagesPerVolume
        : DEFAULT_PAGE_LAYOUT.pagesPerVolume,
      "Pages braille par volume",
      1,
      9999,
    ),
  };
}

function readPageLayoutConfigFromForm() {
  return normalizePageLayoutConfig({
    printPages: pageStructurePrintPagesToggle?.checked,
    braillePages: pageStructureBraillePagesToggle?.checked,
    numberBraillePages: pageStructureNumberBraillePagesToggle?.checked,
    continuePages: pageStructureContinuePagesToggle?.checked,
    pageSeparator: pageStructurePageSeparatorToggle?.checked,
    pageSeparatorNumber: pageStructurePageSeparatorNumberToggle?.checked,
    printPageNumberAt: pageStructurePrintPageNumberAtSelect?.value,
    braillePageNumberAt: pageStructureBraillePageNumberAtSelect?.value,
    beginningPageNumber: pageStructureBeginningPageNumberInput?.value,
    contents: pageStructureContentsToggle?.checked,
    printPageNumbersInContents: pageStructurePrintPageNumbersInContentsToggle?.checked,
    braillePageNumbersInContents: pageStructureBraillePageNumbersInContentsToggle?.checked,
    splitIntoVolumes: pageStructureSplitIntoVolumesToggle?.checked,
    pagesPerVolume: pageStructurePagesPerVolumeInput?.value,
  });
}

function refreshPageLayoutControlState() {
  const hasPrintPages = pageStructurePrintPagesToggle?.checked === true;
  const hasBraillePages = pageStructureBraillePagesToggle?.checked === true;
  const hasBrailleNumbers =
    hasBraillePages && pageStructureNumberBraillePagesToggle?.checked === true;
  const hasPageSeparator = hasPrintPages && pageStructurePageSeparatorToggle?.checked === true;
  const hasContents = pageStructureContentsToggle?.checked === true;
  const hasVolumeSplit = pageStructureSplitIntoVolumesToggle?.checked === true;

  if (pageStructurePrintPageNumberAtSelect instanceof HTMLSelectElement) {
    pageStructurePrintPageNumberAtSelect.disabled = !hasPrintPages;
  }
  if (pageStructureContinuePagesToggle instanceof HTMLInputElement) {
    pageStructureContinuePagesToggle.disabled = !hasPrintPages;
  }
  if (pageStructurePageSeparatorToggle instanceof HTMLInputElement) {
    pageStructurePageSeparatorToggle.disabled = !hasPrintPages;
  }
  if (pageStructurePageSeparatorNumberToggle instanceof HTMLInputElement) {
    pageStructurePageSeparatorNumberToggle.disabled = !hasPageSeparator;
  }
  if (pageStructureNumberBraillePagesToggle instanceof HTMLInputElement) {
    pageStructureNumberBraillePagesToggle.disabled = !hasBraillePages;
  }
  if (pageStructureBraillePageNumberAtSelect instanceof HTMLSelectElement) {
    pageStructureBraillePageNumberAtSelect.disabled = !hasBrailleNumbers;
  }
  if (pageStructureBeginningPageNumberInput instanceof HTMLInputElement) {
    pageStructureBeginningPageNumberInput.disabled = !hasBrailleNumbers;
  }
  if (pageStructurePrintPageNumbersInContentsToggle instanceof HTMLInputElement) {
    pageStructurePrintPageNumbersInContentsToggle.disabled = !hasContents;
  }
  if (pageStructureBraillePageNumbersInContentsToggle instanceof HTMLInputElement) {
    pageStructureBraillePageNumbersInContentsToggle.disabled = !hasContents;
  }
  if (pageStructurePagesPerVolumeInput instanceof HTMLInputElement) {
    pageStructurePagesPerVolumeInput.disabled = !hasVolumeSplit;
  }
}

function applyPageLayoutConfigToForm(pageLayoutConfig) {
  const normalizedLayout = normalizePageLayoutConfig(pageLayoutConfig);

  if (pageStructurePrintPagesToggle instanceof HTMLInputElement) {
    pageStructurePrintPagesToggle.checked = normalizedLayout.printPages;
  }
  if (pageStructureBraillePagesToggle instanceof HTMLInputElement) {
    pageStructureBraillePagesToggle.checked = normalizedLayout.braillePages;
  }
  if (pageStructureNumberBraillePagesToggle instanceof HTMLInputElement) {
    pageStructureNumberBraillePagesToggle.checked = normalizedLayout.numberBraillePages;
  }
  if (pageStructureContinuePagesToggle instanceof HTMLInputElement) {
    pageStructureContinuePagesToggle.checked = normalizedLayout.continuePages;
  }
  if (pageStructurePageSeparatorToggle instanceof HTMLInputElement) {
    pageStructurePageSeparatorToggle.checked = normalizedLayout.pageSeparator;
  }
  if (pageStructurePageSeparatorNumberToggle instanceof HTMLInputElement) {
    pageStructurePageSeparatorNumberToggle.checked = normalizedLayout.pageSeparatorNumber;
  }
  if (pageStructurePrintPageNumberAtSelect instanceof HTMLSelectElement) {
    pageStructurePrintPageNumberAtSelect.value = normalizedLayout.printPageNumberAt;
  }
  if (pageStructureBraillePageNumberAtSelect instanceof HTMLSelectElement) {
    pageStructureBraillePageNumberAtSelect.value = normalizedLayout.braillePageNumberAt;
  }
  if (pageStructureBeginningPageNumberInput instanceof HTMLInputElement) {
    pageStructureBeginningPageNumberInput.value = String(normalizedLayout.beginningPageNumber);
  }
  if (pageStructureContentsToggle instanceof HTMLInputElement) {
    pageStructureContentsToggle.checked = normalizedLayout.contents;
  }
  if (pageStructurePrintPageNumbersInContentsToggle instanceof HTMLInputElement) {
    pageStructurePrintPageNumbersInContentsToggle.checked =
      normalizedLayout.printPageNumbersInContents;
  }
  if (pageStructureBraillePageNumbersInContentsToggle instanceof HTMLInputElement) {
    pageStructureBraillePageNumbersInContentsToggle.checked =
      normalizedLayout.braillePageNumbersInContents;
  }
  if (pageStructureSplitIntoVolumesToggle instanceof HTMLInputElement) {
    pageStructureSplitIntoVolumesToggle.checked = normalizedLayout.splitIntoVolumes;
  }
  if (pageStructurePagesPerVolumeInput instanceof HTMLInputElement) {
    pageStructurePagesPerVolumeInput.value = String(normalizedLayout.pagesPerVolume);
  }

  refreshPageLayoutControlState();
}

function formatPageLayoutSummary(pageLayoutConfig) {
  const normalizedLayout = normalizePageLayoutConfig(pageLayoutConfig);
  const printPagesSummary = normalizedLayout.printPages
    ? `imprimées: ${normalizedLayout.printPageNumberAt}`
    : "imprimées: non";
  const braillePagesSummary = normalizedLayout.braillePages
    ? `braille: ${normalizedLayout.numberBraillePages ? `${normalizedLayout.braillePageNumberAt}, début ${normalizedLayout.beginningPageNumber}` : "sans numéro"}`
    : "braille: non";
  const contentsSummary = normalizedLayout.contents
    ? `sommaire: ${normalizedLayout.printPageNumbersInContents || normalizedLayout.braillePageNumbersInContents ? "avec numéros" : "sans numéros"}`
    : "sommaire: non";
  const volumesSummary = normalizedLayout.splitIntoVolumes
    ? `volumes: ${normalizedLayout.pagesPerVolume} page(s) max`
    : "volumes: non";

  return `${printPagesSummary} · ${braillePagesSummary} · ${contentsSummary} · ${volumesSummary}`;
}

function buildEmptyPage(linesPerPage) {
  return Array.from({ length: linesPerPage }, () => "");
}

function focusLineInput(pageIndex, lineIndex) {
  const lineInput = document.querySelector(`#${buildLineInputId(pageIndex, lineIndex)}`);
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
      radio.disabled = isEnabled && state.documentType === DOCUMENT_TYPE_NORMAL;
    } else {
      radio.disabled = false;
    }
  });

  if (isEnabled && state.documentType === DOCUMENT_TYPE_NORMAL) {
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

  updateTranslationInlineHelp();

  if (!announce) {
    return;
  }

  const modeMessage =
    normalizedMode === INPUT_MODE_BRAILLE
      ? "Mode de saisie braille actif: points 1 à 8 sur F D S J K L A ;."
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
  const isEnabled = isBrailleOnlyEditorMode()
    ? true
    : normalizeRealtimeTranslationOption(value);

  state.realtimeTranslationEnabled = isEnabled;
  setDirectionControlsForRealtime(isEnabled);
  syncRealtimeTranslationMenuState(isEnabled);

  if (realtimeTranslationToggle instanceof HTMLInputElement) {
    realtimeTranslationToggle.checked = isEnabled;
  }

  if (isBrailleOnlyEditorMode()) {
    cancelLiveBraillePreviewRefresh();
    clearLiveBraillePreview();
  } else if (isEnabled) {
    scheduleLiveBraillePreviewRefresh({ immediate: true });
  } else {
    cancelLiveBraillePreviewRefresh();
    clearLiveBraillePreview();
  }

  if (!announce) {
    return;
  }

  if (isBrailleOnlyEditorMode()) {
    setStatus(
      documentStatusMessage,
      "Mode braille actif: conversion instantanée du clavier standard vers le braille.",
      "neutral",
    );
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

function getEditorLinesPerPageForType(documentType, configuredLinesPerPage) {
  if (documentType === DOCUMENT_TYPE_BRAILLE) {
    return configuredLinesPerPage;
  }

  return NORMAL_EDITOR_LINES_PER_PAGE;
}

function getEditorLinesPerPage() {
  if (!state.documentConfig) {
    return NORMAL_EDITOR_LINES_PER_PAGE;
  }

  return getEditorLinesPerPageForType(state.documentType, state.documentConfig.linesPerPage);
}

function buildLineInputId(pageIndex, lineIndex) {
  return `page-${pageIndex + 1}-line-${lineIndex + 1}`;
}

function getFlatLineIndex(pageIndex, lineIndex) {
  if (!Array.isArray(state.pages) || state.pages.length === 0) {
    return 0;
  }

  let flatIndex = 0;
  for (let index = 0; index < pageIndex; index += 1) {
    const pageLines = state.pages[index];
    flatIndex += Array.isArray(pageLines) ? pageLines.length : 0;
  }

  return flatIndex + Math.max(0, lineIndex);
}

function getLinePositionFromFlatIndex(flatLineIndex) {
  if (!Array.isArray(state.pages) || state.pages.length === 0) {
    return null;
  }

  if (flatLineIndex < 0) {
    return null;
  }

  let remaining = flatLineIndex;
  for (let pageIndex = 0; pageIndex < state.pages.length; pageIndex += 1) {
    const pageLines = state.pages[pageIndex];
    const lineCount = Array.isArray(pageLines) ? pageLines.length : 0;
    if (remaining < lineCount) {
      return { pageIndex, lineIndex: remaining };
    }

    remaining -= lineCount;
  }

  return null;
}

function flattenDocumentLines() {
  return state.pages.flat();
}

function isEditorLineEmpty(lineValue) {
  return typeof lineValue !== "string" || lineValue.length === 0;
}

function isForcedPageBreakLineValue(lineValue) {
  return typeof lineValue === "string" && lineValue.trim() === FORCED_PAGE_BREAK_MARKER;
}

function isTranslationEmptyLineValue(lineValue) {
  if (typeof lineValue !== "string") {
    return true;
  }

  if (isForcedPageBreakLineValue(lineValue)) {
    return false;
  }

  return lineValue.trim() === "";
}

function trimTrailingEmptyTranslationLines(lines) {
  const normalizedLines = Array.isArray(lines) ? lines.slice() : [];
  let lastUsefulLineIndex = normalizedLines.length - 1;

  while (
    lastUsefulLineIndex >= 0 &&
    isTranslationEmptyLineValue(normalizedLines[lastUsefulLineIndex])
  ) {
    lastUsefulLineIndex -= 1;
  }

  if (lastUsefulLineIndex < 0) {
    return [];
  }

  return normalizedLines.slice(0, lastUsefulLineIndex + 1);
}

function buildTranslationSegmentsFromDocumentLines(lines) {
  const usefulLines = trimTrailingEmptyTranslationLines(lines);
  const segments = [[]];

  usefulLines.forEach((lineValue) => {
    if (isForcedPageBreakLineValue(lineValue)) {
      segments.push([]);
      return;
    }

    segments[segments.length - 1].push(typeof lineValue === "string" ? lineValue : "");
  });

  return {
    usefulLines,
    segments,
  };
}

function buildTranslationTextFromDocumentLines(lines) {
  const { usefulLines, segments } = buildTranslationSegmentsFromDocumentLines(lines);
  if (usefulLines.length === 0) {
    return "";
  }

  return segments.map((segmentLines) => segmentLines.join("\n")).join("\f");
}

function mapTranslatedTextToDocumentLines(sourceLines, outputText) {
  if (!Array.isArray(sourceLines) || sourceLines.length === 0) {
    return [];
  }

  const normalizedOutputText =
    typeof outputText === "string"
      ? outputText.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n")
      : "";
  const outputSegments = normalizedOutputText
    .split("\f")
    .map((segmentText) => segmentText.split("\n"));

  let outputSegmentIndex = 0;
  let outputLineIndex = 0;

  return sourceLines.map((sourceLine) => {
    if (isForcedPageBreakLineValue(sourceLine)) {
      outputSegmentIndex += 1;
      outputLineIndex = 0;
      return FORCED_PAGE_BREAK_PREVIEW_LABEL;
    }

    const segmentLines =
      outputSegments[Math.min(outputSegmentIndex, Math.max(0, outputSegments.length - 1))] ?? [""];
    const translatedLine = segmentLines[outputLineIndex] ?? "";
    outputLineIndex += 1;
    return translatedLine;
  });
}

function findNextNonEmptyFlatLineIndex(flatLines, startFlatIndex, direction) {
  if (!Array.isArray(flatLines) || flatLines.length === 0) {
    return null;
  }

  const step = direction >= 0 ? 1 : -1;
  for (
    let flatLineIndex = startFlatIndex;
    flatLineIndex >= 0 && flatLineIndex < flatLines.length;
    flatLineIndex += step
  ) {
    if (!isEditorLineEmpty(flatLines[flatLineIndex])) {
      return flatLineIndex;
    }
  }

  return null;
}

function buildPagesFromFlatLines(flatLines, linesPerPageOverride = null) {
  if (!state.documentConfig && linesPerPageOverride === null) {
    return [];
  }

  const linesPerPage = Number.isInteger(linesPerPageOverride) && linesPerPageOverride > 0
    ? linesPerPageOverride
    : getEditorLinesPerPage();
  const normalizedLines = Array.isArray(flatLines) ? flatLines.slice() : [];
  if (normalizedLines.length === 0) {
    normalizedLines.push("");
  }

  const pages = [];
  for (let startIndex = 0; startIndex < normalizedLines.length; startIndex += linesPerPage) {
    const pageLines = normalizedLines.slice(startIndex, startIndex + linesPerPage);
    while (pageLines.length < linesPerPage) {
      pageLines.push("");
    }
    pages.push(pageLines);
  }

  return pages;
}

function mergeOverflowWithLine(overflowText, targetLine) {
  if (overflowText.length === 0) {
    return targetLine;
  }

  if (targetLine.length === 0) {
    return overflowText;
  }

  if (overflowText.endsWith(" ") || targetLine.startsWith(" ")) {
    return `${overflowText}${targetLine}`;
  }

  return `${overflowText} ${targetLine}`;
}

function splitLineForWrap(lineValue, lineWidth) {
  if (lineValue.length <= lineWidth) {
    return { line: lineValue, overflow: "" };
  }

  const breakAtSpace = lineValue.lastIndexOf(" ", lineWidth);
  if (breakAtSpace > 0) {
    const line = lineValue.slice(0, breakAtSpace);
    const overflow = lineValue.slice(breakAtSpace + 1).replace(/^\s+/u, "");
    return { line, overflow };
  }

  return {
    line: lineValue.slice(0, lineWidth),
    overflow: lineValue.slice(lineWidth),
  };
}

function wrapFlatLinesFromIndex(flatLines, startFlatIndex, lineWidth) {
  const wrappedLines = Array.isArray(flatLines) ? flatLines.slice() : [];
  const startIndex = Math.max(0, startFlatIndex);
  let lineIndex = startIndex;
  let hasChanged = false;
  let lastAffectedIndex = startIndex;

  while (lineIndex < wrappedLines.length) {
    const currentLine = wrappedLines[lineIndex] ?? "";
    if (currentLine.length <= lineWidth) {
      lineIndex += 1;
      continue;
    }

    const { line, overflow } = splitLineForWrap(currentLine, lineWidth);
    if (line !== currentLine) {
      wrappedLines[lineIndex] = line;
      hasChanged = true;
    }

    if (overflow.length > 0) {
      if (lineIndex + 1 >= wrappedLines.length) {
        wrappedLines.push("");
        hasChanged = true;
      }

      const nextLine = wrappedLines[lineIndex + 1] ?? "";
      const mergedNextLine = mergeOverflowWithLine(overflow, nextLine);
      if (mergedNextLine !== nextLine) {
        wrappedLines[lineIndex + 1] = mergedNextLine;
        hasChanged = true;
      }
      lastAffectedIndex = lineIndex + 1;
    }

    lineIndex += 1;
  }

  return {
    lines: wrappedLines,
    changed: hasChanged,
    lastAffectedIndex,
  };
}

function readSourceBufferLines(totalLines) {
  const lines = [];

  for (let flatLineIndex = 0; flatLineIndex < totalLines; flatLineIndex += 1) {
    const linePosition = getLinePositionFromFlatIndex(flatLineIndex);
    if (!linePosition) {
      lines.push("");
      continue;
    }

    const lineInputId = buildLineInputId(linePosition.pageIndex, linePosition.lineIndex);
    const lineValue = lineSourceTextById.get(lineInputId);
    lines.push(typeof lineValue === "string" ? lineValue : "");
  }

  return lines;
}

function writeSourceBufferLines(sourceLines) {
  lineSourceTextById.clear();

  sourceLines.forEach((lineValue, flatLineIndex) => {
    const linePosition = getLinePositionFromFlatIndex(flatLineIndex);
    if (!linePosition) {
      return;
    }

    const lineInputId = buildLineInputId(linePosition.pageIndex, linePosition.lineIndex);
    lineSourceTextById.set(lineInputId, typeof lineValue === "string" ? lineValue : "");
  });
}

function focusLineByFlatIndex(flatLineIndex, caretPosition = null) {
  const linePosition = getLinePositionFromFlatIndex(flatLineIndex);
  if (!linePosition) {
    return;
  }

  const lineInput = document.querySelector(`#${buildLineInputId(linePosition.pageIndex, linePosition.lineIndex)}`);
  if (!(lineInput instanceof HTMLInputElement)) {
    return;
  }

  lineInput.focus();
  const nextCaretPosition = typeof caretPosition === "number"
    ? Math.max(0, Math.min(caretPosition, lineInput.value.length))
    : lineInput.value.length;
  lineInput.setSelectionRange(nextCaretPosition, nextCaretPosition);
  updateLinePositionLabel(lineInput);
  updateLineCharacterCounter(lineInput);
}

function buildCompactLineLabel(pageIndex, lineIndex, characterIndex) {
  return `l${lineIndex + 1}p${pageIndex + 1}c${characterIndex}`;
}

function getLineCharacterIndexFromInput(lineInput) {
  if (!(lineInput instanceof HTMLInputElement)) {
    return 1;
  }

  const lineLength = lineInput.value.length;
  const selectionStart = lineInput.selectionStart ?? 0;
  const cappedPosition = Math.max(0, Math.min(selectionStart, lineLength));
  return Math.max(1, cappedPosition);
}

function updateLinePositionLabel(lineInput) {
  if (!(lineInput instanceof HTMLInputElement)) {
    return;
  }

  const linePosition = getLinePositionFromInput(lineInput);
  if (!linePosition) {
    return;
  }

  const labelElement = document.querySelector(`#${lineInput.id}-position`);
  if (!(labelElement instanceof HTMLElement)) {
    return;
  }

  const characterIndex = getLineCharacterIndexFromInput(lineInput);
  const compactLabel = buildCompactLineLabel(
    linePosition.pageIndex,
    linePosition.lineIndex,
    characterIndex,
  );

  labelElement.textContent = compactLabel;
  queueLinuxBrlapiSync(lineInput, linePosition, characterIndex);
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

  const extension = getDocumentExtension();
  return window.confirm(
    `Le document actuel contient des changements non enregistrés.\n` +
      `Veux-tu vraiment ${actionLabel} sans enregistrer le fichier ${extension} ?`,
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
    activeDocumentFile.textContent =
      `Nouveau ${getDocumentTypeLabel()} ${getDocumentExtension()} non enregistré${unsavedStatus}`;
  }

  activeTableLabel.textContent = state.documentConfig.tableLabel;
  activeDocumentFormat.textContent =
    `${state.documentConfig.linesPerPage} lignes/page · ` +
    `${state.documentConfig.charactersPerLine} caractères/ligne · ` +
    `${state.pages.length} page(s) · ` +
    `${formatPageLayoutSummary(state.documentConfig.pageLayout)}`;
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

function updateLineCharacterCounter(lineInput) {
  if (!(lineInput instanceof HTMLInputElement) || !state.documentConfig) {
    return;
  }

  const counter = document.querySelector(`#${lineInput.id}-counter`);
  if (!counter) {
    return;
  }

  if (state.documentType === DOCUMENT_TYPE_NORMAL) {
    counter.textContent = "";
    return;
  }

  counter.textContent = `${lineInput.value.length}/${state.documentConfig.charactersPerLine}`;
}

function buildSourceBufferFromDisplayLines() {
  const sourceBuffer = new Map();
  const documentLines = flattenDocumentLines();

  documentLines.forEach((lineValue, flatLineIndex) => {
    const linePosition = getLinePositionFromFlatIndex(flatLineIndex);
    if (!linePosition) {
      return;
    }

    const lineInputId = buildLineInputId(linePosition.pageIndex, linePosition.lineIndex);
    sourceBuffer.set(lineInputId, lineValue);
  });

  return sourceBuffer;
}

function applyDisplayWordWrapFromFlatIndex(startFlatIndex) {
  if (!state.documentConfig) {
    return { changed: false, focusFlatIndex: startFlatIndex };
  }

  const lineWidth = state.documentConfig.charactersPerLine;
  const currentLines = flattenDocumentLines();
  const wrapResult = wrapFlatLinesFromIndex(currentLines, startFlatIndex, lineWidth);

  if (!wrapResult.changed) {
    return { changed: false, focusFlatIndex: startFlatIndex };
  }

  state.pages = buildPagesFromFlatLines(wrapResult.lines);
  updateDocumentMetadata();

  return {
    changed: true,
    focusFlatIndex: Math.min(
      Math.max(startFlatIndex, wrapResult.lastAffectedIndex),
      wrapResult.lines.length - 1,
    ),
  };
}

function containsBrailleUnicode(value) {
  return /[\u2800-\u28FF]/u.test(value);
}

function computeSourceLineTextFromInputEvent(previousSourceText, lineInput, event) {
  if (!(lineInput instanceof HTMLInputElement)) {
    return previousSourceText;
  }

  const fallbackDisplayedValue = lineInput.value;
  if (!(event instanceof InputEvent)) {
    return containsBrailleUnicode(fallbackDisplayedValue)
      ? previousSourceText
      : fallbackDisplayedValue;
  }

  const inputType = typeof event.inputType === "string" ? event.inputType : "";

  if (
    inputType === "insertText" ||
    inputType === "insertCompositionText" ||
    inputType === "insertFromPaste" ||
    inputType === "insertFromDrop" ||
    inputType === "insertReplacementText"
  ) {
    if (typeof event.data === "string" && event.data.length > 0) {
      return `${previousSourceText}${event.data}`;
    }

    return containsBrailleUnicode(fallbackDisplayedValue)
      ? previousSourceText
      : fallbackDisplayedValue;
  }

  if (inputType === "deleteContentBackward") {
    return previousSourceText.slice(0, -1);
  }

  if (inputType === "deleteWordBackward") {
    return previousSourceText.replace(/\s*\S+\s*$/u, "");
  }

  if (inputType === "deleteByCut") {
    return "";
  }

  if (inputType === "deleteContentForward" || inputType === "deleteWordForward") {
    return previousSourceText;
  }

  return containsBrailleUnicode(fallbackDisplayedValue)
    ? previousSourceText
    : fallbackDisplayedValue;
}

function shouldTranslateLineToBrailleInPlace() {
  if (!state.documentConfig || state.documentType !== DOCUMENT_TYPE_BRAILLE) {
    return false;
  }

  if (!state.realtimeTranslationEnabled || state.inputMode !== INPUT_MODE_TEXT) {
    return false;
  }

  return getDirection() === "text-to-braille";
}

async function translateBrailleTextLine(inputText, translationCache = null) {
  if (!state.documentConfig) {
    return "";
  }

  const normalizedInput = typeof inputText === "string" ? inputText : "";
  if (normalizedInput.length === 0) {
    return "";
  }

  if (translationCache instanceof Map && translationCache.has(normalizedInput)) {
    return translationCache.get(normalizedInput);
  }

  const response = await window.brailleApi.translate({
    table: state.documentConfig.table,
    direction: "text-to-braille",
    executionMode: TRANSLATION_EXECUTION_MODE_PREVIEW,
    inputText: normalizedInput,
  });

  if (!response || typeof response.outputText !== "string") {
    throw new Error("Le service de traduction a retourné une réponse invalide.");
  }

  const translatedLine = response.outputText.split("\n")[0] ?? "";
  if (translationCache instanceof Map) {
    translationCache.set(normalizedInput, translatedLine);
  }

  return translatedLine;
}

async function splitSourceLineByBrailleWidth(sourceLine, lineWidth, translationCache) {
  const normalizedSource = typeof sourceLine === "string" ? sourceLine : "";
  const fullLineDisplay = await translateBrailleTextLine(normalizedSource, translationCache);
  if (fullLineDisplay.length <= lineWidth) {
    return {
      lineSource: normalizedSource,
      overflowSource: "",
      lineDisplay: fullLineDisplay,
    };
  }

  let bestWordSplit = null;
  let scanIndex = 0;
  while (scanIndex < normalizedSource.length) {
    const spaceIndex = normalizedSource.indexOf(" ", scanIndex);
    if (spaceIndex === -1) {
      break;
    }

    const candidateSource = normalizedSource.slice(0, spaceIndex).trimEnd();
    if (candidateSource.length > 0) {
      const candidateDisplay = await translateBrailleTextLine(candidateSource, translationCache);
      if (candidateDisplay.length <= lineWidth) {
        bestWordSplit = {
          splitPosition: spaceIndex + 1,
          lineSource: candidateSource,
          lineDisplay: candidateDisplay,
        };
      }
    }

    scanIndex = spaceIndex + 1;
  }

  if (bestWordSplit) {
    const overflowSource = normalizedSource
      .slice(bestWordSplit.splitPosition)
      .replace(/^\s+/u, "");

    return {
      lineSource: bestWordSplit.lineSource,
      overflowSource,
      lineDisplay: bestWordSplit.lineDisplay,
    };
  }

  let low = 1;
  let high = normalizedSource.length;
  let bestCharSplit = 1;
  let bestCharDisplay = await translateBrailleTextLine(
    normalizedSource.slice(0, 1),
    translationCache,
  );

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidateSource = normalizedSource.slice(0, mid);
    const candidateDisplay = await translateBrailleTextLine(candidateSource, translationCache);

    if (candidateDisplay.length <= lineWidth) {
      bestCharSplit = mid;
      bestCharDisplay = candidateDisplay;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return {
    lineSource: normalizedSource.slice(0, bestCharSplit),
    overflowSource: normalizedSource.slice(bestCharSplit),
    lineDisplay: bestCharDisplay,
  };
}

async function wrapBrailleSourceLinesByDisplayWidth(sourceLines, displayLines, startFlatIndex, lineWidth) {
  const sourceWorking = Array.isArray(sourceLines) ? sourceLines.slice() : [];
  const displayWorking = Array.isArray(displayLines) ? displayLines.slice() : [];
  const translationCache = new Map();
  let changed = false;
  let lastAffectedIndex = Math.max(0, startFlatIndex);

  while (displayWorking.length < sourceWorking.length) {
    displayWorking.push("");
  }

  for (
    let flatLineIndex = Math.max(0, startFlatIndex);
    flatLineIndex < sourceWorking.length;
    flatLineIndex += 1
  ) {
    const currentSourceLine = sourceWorking[flatLineIndex] ?? "";
    const splitResult = await splitSourceLineByBrailleWidth(
      currentSourceLine,
      lineWidth,
      translationCache,
    );

    if (splitResult.lineSource !== currentSourceLine) {
      sourceWorking[flatLineIndex] = splitResult.lineSource;
      changed = true;
    }

    if (displayWorking[flatLineIndex] !== splitResult.lineDisplay) {
      displayWorking[flatLineIndex] = splitResult.lineDisplay;
      changed = true;
    }

    if (splitResult.overflowSource.length === 0) {
      continue;
    }

    if (flatLineIndex + 1 >= sourceWorking.length) {
      sourceWorking.push("");
      displayWorking.push("");
      changed = true;
    }

    const nextSourceLine = sourceWorking[flatLineIndex + 1] ?? "";
    const mergedNextSourceLine = mergeOverflowWithLine(splitResult.overflowSource, nextSourceLine);
    if (mergedNextSourceLine !== nextSourceLine) {
      sourceWorking[flatLineIndex + 1] = mergedNextSourceLine;
      changed = true;
    }

    lastAffectedIndex = flatLineIndex + 1;
  }

  return {
    sourceLines: sourceWorking,
    displayLines: displayWorking,
    changed,
    lastAffectedIndex,
  };
}

function nextLineTranslationRequestId(lineInputId) {
  const nextRequestId = (lineTranslationRequestIds.get(lineInputId) ?? 0) + 1;
  lineTranslationRequestIds.set(lineInputId, nextRequestId);
  return nextRequestId;
}

async function translateLineToBrailleInPlace(lineInput, pageIndex, lineIndex, inputText) {
  if (!(lineInput instanceof HTMLInputElement) || !state.documentConfig) {
    return;
  }

  const requestId = nextLineTranslationRequestId(lineInput.id);
  const startFlatIndex = getFlatLineIndex(pageIndex, lineIndex);
  const lineWidth = state.documentConfig.charactersPerLine;

  const currentDisplayLines = flattenDocumentLines();
  const sourceLines = readSourceBufferLines(currentDisplayLines.length);
  while (sourceLines.length <= startFlatIndex) {
    sourceLines.push("");
    currentDisplayLines.push("");
  }

  sourceLines[startFlatIndex] = typeof inputText === "string" ? inputText : "";

  try {
    const wrapResult = await wrapBrailleSourceLinesByDisplayWidth(
      sourceLines,
      currentDisplayLines,
      startFlatIndex,
      lineWidth,
    );

    if (lineTranslationRequestIds.get(lineInput.id) !== requestId) {
      return;
    }

    const wrappedSourceLines = wrapResult.sourceLines;
    const wrappedDisplayLines = wrapResult.displayLines;
    while (
      wrappedSourceLines.length > 1 &&
      wrappedDisplayLines.length > 1 &&
      wrappedSourceLines[wrappedSourceLines.length - 1] === "" &&
      wrappedDisplayLines[wrappedDisplayLines.length - 1] === ""
    ) {
      wrappedSourceLines.pop();
      wrappedDisplayLines.pop();
    }

    state.pages = buildPagesFromFlatLines(wrappedDisplayLines);
    markDocumentChanged();

    writeSourceBufferLines(wrappedSourceLines);
    const sourceBufferSnapshot = new Map(lineSourceTextById);
    renderEditorPages({ sourceBuffer: sourceBufferSnapshot });

    const focusFlatIndex = Math.min(
      Math.max(startFlatIndex, wrapResult.lastAffectedIndex),
      wrappedDisplayLines.length - 1,
    );
    focusLineByFlatIndex(focusFlatIndex);
    refreshActiveLineSpacePreview();
    refreshAllActionStates();
  } catch (error) {
    if (lineTranslationRequestIds.get(lineInput.id) !== requestId) {
      return;
    }

    setStatus(
      translationStatusMessage,
      `Traduction instantanée indisponible: ${getErrorMessage(error)}`,
      "error",
    );
  }
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

  updateLineInputBfuVisualState(lineInput);

  updateLastFocusedLinePosition(lineInput);
  const { pageIndex, lineIndex } = linePosition;

  if (shouldTranslateLineToBrailleInPlace()) {
    const previousSourceText = lineSourceTextById.get(lineInput.id) ?? "";
    const nextSourceText = computeSourceLineTextFromInputEvent(
      previousSourceText,
      lineInput,
      event,
    );

    lineSourceTextById.set(lineInput.id, nextSourceText);
    void translateLineToBrailleInPlace(lineInput, pageIndex, lineIndex, nextSourceText);
    return;
  }

  const newValue = lineInput.value;
  if (state.pages[pageIndex][lineIndex] === newValue) {
    return;
  }

  state.pages[pageIndex][lineIndex] = newValue;
  lineSourceTextById.set(lineInput.id, newValue);
  markDocumentChanged();

  if (state.documentType === DOCUMENT_TYPE_BRAILLE) {
    const startFlatIndex = getFlatLineIndex(pageIndex, lineIndex);
    const wrapResult = applyDisplayWordWrapFromFlatIndex(startFlatIndex);
    if (wrapResult.changed) {
      const sourceBufferSnapshot = new Map(lineSourceTextById);
      renderEditorPages({ sourceBuffer: sourceBufferSnapshot });
      focusLineByFlatIndex(wrapResult.focusFlatIndex);
      refreshActiveLineSpacePreview();
      refreshAllActionStates();
    } else {
      updateLineCharacterCounter(lineInput);
      updateLinePositionLabel(lineInput);
      refreshActiveLineSpacePreview();
    }
  } else {
    updateLineCharacterCounter(lineInput);
    updateLinePositionLabel(lineInput);
    refreshActiveLineSpacePreview();
  }

  if (isBrailleOnlyEditorMode()) {
    return;
  }

  if (state.realtimeTranslationEnabled) {
    scheduleLiveBraillePreviewRefresh();
  } else if (hasInlineTranslationOutput()) {
    setStatus(
      translationStatusMessage,
      "Le document a changé. Utilise Ctrl/Cmd+T pour mettre à jour la traduction dans l’éditeur.",
      "neutral",
    );
  }
}

function onLineFocus(event) {
  const lineInput = event.currentTarget;
  if (!(lineInput instanceof HTMLInputElement)) {
    return;
  }

  updateLastFocusedLinePosition(lineInput);
  updateLinePositionLabel(lineInput);
  updateLineInputBfuVisualState(lineInput);
  refreshActiveLineSpacePreview();
}

function onLineSelectionChange(event) {
  const lineInput = event.currentTarget;
  if (!(lineInput instanceof HTMLInputElement)) {
    return;
  }

  updateLastFocusedLinePosition(lineInput);
  updateLinePositionLabel(lineInput);
  updateLineInputBfuVisualState(lineInput);
}

function onLineBlur(event) {
  const lineInput = event.currentTarget;
  if (!(lineInput instanceof HTMLInputElement)) {
    return;
  }

  lineInput.classList.remove("is-italic-mode");
}

function createEmptyEditorLineAtEnd() {
  if (!state.documentConfig) {
    return null;
  }

  const currentLines = flattenDocumentLines();
  currentLines.push("");

  const nextPages = buildPagesFromFlatLines(currentLines);
  const sourceBufferSnapshot = isBrailleOnlyEditorMode()
    ? new Map(lineSourceTextById)
    : buildSourceBufferFromDisplayLines();

  state.pages = nextPages;
  if (isBrailleOnlyEditorMode()) {
    const sourceLines = readSourceBufferLines(currentLines.length - 1);
    sourceLines.push("");
    const editorLinesPerPage = getEditorLinesPerPage();
    const expectedTotalLines = nextPages.length * editorLinesPerPage;
    while (sourceLines.length < expectedTotalLines) {
      sourceLines.push("");
    }
    const paddedSourceBuffer = new Map();
    sourceLines.forEach((lineValue, flatLineIndex) => {
      const linePosition = getLinePositionFromFlatIndex(flatLineIndex);
      if (!linePosition) {
        return;
      }

      paddedSourceBuffer.set(
        buildLineInputId(linePosition.pageIndex, linePosition.lineIndex),
        typeof lineValue === "string" ? lineValue : "",
      );
    });
    renderEditorPages({ sourceBuffer: paddedSourceBuffer });
  } else {
    renderEditorPages({ sourceBuffer: sourceBufferSnapshot });
  }

  markDocumentChanged();
  refreshActiveLineSpacePreview();
  refreshAllActionStates();
  return currentLines.length - 1;
}

function focusLineByRelativeOffset(lineInput, offset, options = {}) {
  const {
    keepColumn = true,
    createWhenMissing = false,
    preventTrailingEmpty = false,
  } = options;

  const linePosition = getLinePositionFromInput(lineInput);
  if (!linePosition) {
    return false;
  }

  const currentFlatIndex = getFlatLineIndex(linePosition.pageIndex, linePosition.lineIndex);
  let targetFlatIndex = currentFlatIndex + offset;
  const direction = offset >= 0 ? 1 : -1;

  if (targetFlatIndex < 0) {
    return false;
  }

  const currentLines = flattenDocumentLines();
  const totalLines = currentLines.length;

  if (targetFlatIndex >= totalLines) {
    if (!createWhenMissing) {
      return false;
    }

    const createdFlatIndex = createEmptyEditorLineAtEnd();
    if (createdFlatIndex === null) {
      return false;
    }

    targetFlatIndex = createdFlatIndex;
  }

  if (preventTrailingEmpty && direction > 0 && !createWhenMissing) {
    const targetLineValue = currentLines[targetFlatIndex] ?? "";
    if (isEditorLineEmpty(targetLineValue)) {
      const hasFollowingNonEmptyLine =
        findNextNonEmptyFlatLineIndex(currentLines, targetFlatIndex + 1, 1) !== null;
      if (!hasFollowingNonEmptyLine) {
        return false;
      }
    }
  }

  const targetLinePosition = getLinePositionFromFlatIndex(targetFlatIndex);
  if (!targetLinePosition) {
    return false;
  }

  const targetLineInput = document.querySelector(
    `#${buildLineInputId(targetLinePosition.pageIndex, targetLinePosition.lineIndex)}`,
  );
  if (!(targetLineInput instanceof HTMLInputElement)) {
    return false;
  }

  const sourceSelectionStart = lineInput.selectionStart ?? lineInput.value.length;
  targetLineInput.focus();
  const nextCaret = keepColumn
    ? Math.min(sourceSelectionStart, targetLineInput.value.length)
    : targetLineInput.value.length;
  targetLineInput.setSelectionRange(nextCaret, nextCaret);
  updateLinePositionLabel(targetLineInput);
  updateLineCharacterCounter(targetLineInput);
  refreshActiveLineSpacePreview();
  return true;
}

function splitCurrentNormalLineAtCaret(lineInput) {
  if (!state.documentConfig || state.documentType !== DOCUMENT_TYPE_NORMAL) {
    return false;
  }

  const linePosition = getLinePositionFromInput(lineInput);
  if (!linePosition) {
    return false;
  }

  const currentFlatIndex = getFlatLineIndex(linePosition.pageIndex, linePosition.lineIndex);
  const currentLines = flattenDocumentLines();
  const selectionStart = lineInput.selectionStart ?? lineInput.value.length;
  const selectionEnd = lineInput.selectionEnd ?? selectionStart;
  const currentLineValue = lineInput.value;

  if (selectionStart === selectionEnd && selectionStart >= currentLineValue.length) {
    const nextFlatIndex = currentFlatIndex + 1;
    if (nextFlatIndex >= currentLines.length) {
      return false;
    }

    const nextLineValue = currentLines[nextFlatIndex] ?? "";
    if (isEditorLineEmpty(nextLineValue)) {
      const hasFollowingNonEmptyLine =
        findNextNonEmptyFlatLineIndex(currentLines, nextFlatIndex + 1, 1) !== null;
      if (!hasFollowingNonEmptyLine) {
        return false;
      }
    }

    focusLineByFlatIndex(nextFlatIndex, 0);
    refreshActiveLineSpacePreview();
    return true;
  }

  const leftPart = currentLineValue.slice(0, selectionStart);
  const rightPart = currentLineValue.slice(selectionEnd);
  currentLines[currentFlatIndex] = leftPart;
  currentLines.splice(currentFlatIndex + 1, 0, rightPart);

  state.pages = buildPagesFromFlatLines(currentLines);
  markDocumentChanged();

  const sourceBufferSnapshot = buildSourceBufferFromDisplayLines();
  renderEditorPages({ sourceBuffer: sourceBufferSnapshot });

  const nextNonEmptyFlatIndex = rightPart.length > 0
    ? currentFlatIndex + 1
    : findNextNonEmptyFlatLineIndex(currentLines, currentFlatIndex + 2, 1);

  if (nextNonEmptyFlatIndex !== null) {
    focusLineByFlatIndex(nextNonEmptyFlatIndex, 0);
  } else {
    focusLineByFlatIndex(currentFlatIndex, leftPart.length);
  }

  refreshActiveLineSpacePreview();
  refreshAllActionStates();

  if (state.realtimeTranslationEnabled) {
    scheduleLiveBraillePreviewRefresh();
  } else if (hasInlineTranslationOutput()) {
    setStatus(
      translationStatusMessage,
      "Le document a changé. Utilise Ctrl/Cmd+T pour mettre à jour la traduction dans l’éditeur.",
      "neutral",
    );
  }

  return true;
}

function findNextEditableFlatLineIndex(lines, startIndex) {
  if (!Array.isArray(lines)) {
    return null;
  }

  for (let flatLineIndex = Math.max(0, startIndex); flatLineIndex < lines.length; flatLineIndex += 1) {
    if (!isForcedPageBreakLineValue(lines[flatLineIndex])) {
      return flatLineIndex;
    }
  }

  return null;
}

function insertForcedPageBreakAtCaret(lineInput) {
  if (!state.documentConfig || state.documentType !== DOCUMENT_TYPE_NORMAL) {
    return false;
  }

  const linePosition = getLinePositionFromInput(lineInput);
  if (!linePosition) {
    return false;
  }

  const currentFlatIndex = getFlatLineIndex(linePosition.pageIndex, linePosition.lineIndex);
  const currentLines = flattenDocumentLines();
  const currentLineValue = currentLines[currentFlatIndex] ?? "";

  if (isForcedPageBreakLineValue(currentLineValue)) {
    currentLines.splice(currentFlatIndex + 1, 0, FORCED_PAGE_BREAK_MARKER);
  } else {
    const selectionStart = lineInput.selectionStart ?? currentLineValue.length;
    const selectionEnd = lineInput.selectionEnd ?? selectionStart;
    const leftPart = currentLineValue.slice(0, selectionStart);
    const rightPart = currentLineValue.slice(selectionEnd);

    currentLines[currentFlatIndex] = leftPart;
    if (rightPart.length > 0) {
      currentLines.splice(currentFlatIndex + 1, 0, FORCED_PAGE_BREAK_MARKER, rightPart);
    } else {
      currentLines.splice(currentFlatIndex + 1, 0, FORCED_PAGE_BREAK_MARKER);
    }
  }

  state.pages = buildPagesFromFlatLines(currentLines);
  markDocumentChanged();

  const sourceBufferSnapshot = buildSourceBufferFromDisplayLines();
  renderEditorPages({ sourceBuffer: sourceBufferSnapshot });

  const nextEditableFlatIndex = findNextEditableFlatLineIndex(currentLines, currentFlatIndex + 1);
  if (nextEditableFlatIndex !== null) {
    focusLineByFlatIndex(nextEditableFlatIndex, 0);
  } else {
    focusLineByFlatIndex(currentFlatIndex, currentLines[currentFlatIndex]?.length ?? 0);
  }

  refreshActiveLineSpacePreview();
  refreshAllActionStates();

  if (state.realtimeTranslationEnabled) {
    scheduleLiveBraillePreviewRefresh();
  } else if (hasInlineTranslationOutput()) {
    setStatus(
      translationStatusMessage,
      "Le document a changé. Utilise Ctrl/Cmd+T pour mettre à jour la traduction dans l’éditeur.",
      "neutral",
    );
  }

  setStatus(
    documentStatusMessage,
    "Saut de page forcé inséré (imprimé + braille) à la prochaine traduction.",
    "success",
  );

  return true;
}

function onLineNavigationKeyDown(event) {
  const lineInput = event.currentTarget;
  if (!isLineInput(lineInput)) {
    return;
  }

  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key === "Enter") {
    event.preventDefault();
    if (state.documentType !== DOCUMENT_TYPE_NORMAL) {
      setStatus(
        documentStatusMessage,
        "Le saut de page forcé Ctrl/Cmd+Entrée est disponible en document normal (.gnp).",
        "neutral",
      );
      return;
    }

    insertForcedPageBreakAtCaret(lineInput);
    return;
  }

  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }

  if (
    event.key === "ArrowLeft" ||
    event.key === "ArrowRight" ||
    event.key === "Home" ||
    event.key === "End"
  ) {
    // Let the browser move the caret first, then refresh the compact l#p#c# marker.
    window.requestAnimationFrame(() => {
      if (document.activeElement !== lineInput) {
        return;
      }

      updateLastFocusedLinePosition(lineInput);
      updateLinePositionLabel(lineInput);
      updateLineCharacterCounter(lineInput);
      updateLineInputBfuVisualState(lineInput);
      refreshActiveLineSpacePreview();
    });
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    focusLineByRelativeOffset(lineInput, -1, {
      keepColumn: true,
      createWhenMissing: false,
    });
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    focusLineByRelativeOffset(lineInput, 1, {
      keepColumn: true,
      createWhenMissing: false,
      preventTrailingEmpty: true,
    });
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    if (state.documentType === DOCUMENT_TYPE_NORMAL) {
      splitCurrentNormalLineAtCaret(lineInput);
      return;
    }

    focusLineByRelativeOffset(lineInput, 1, {
      keepColumn: false,
      createWhenMissing: false,
      preventTrailingEmpty: true,
    });
  }
}

function createLineEditor(pageIndex, lineIndex, value, sourceBuffer = null) {
  const lineWrapper = document.createElement("div");
  lineWrapper.className = "line-item";

  const inputId = buildLineInputId(pageIndex, lineIndex);
  const counterId = `${inputId}-counter`;
  const labelId = `${inputId}-position`;

  const label = document.createElement("span");
  label.id = labelId;
  label.className = "line-position-label";
  if (state.documentType === DOCUMENT_TYPE_NORMAL) {
    label.hidden = true;
  }
  label.textContent = buildCompactLineLabel(pageIndex, lineIndex, 1);

  const lineInput = document.createElement("input");
  lineInput.id = inputId;
  lineInput.className = "line-input";
  lineInput.type = "text";
  lineInput.autocomplete = "off";
  lineInput.spellcheck = false;
  lineInput.value = value;
  const fallbackSourceLine = isBrailleOnlyEditorMode() ? "" : value;
  const sourceLine =
    sourceBuffer instanceof Map && sourceBuffer.has(inputId)
      ? sourceBuffer.get(inputId)
      : fallbackSourceLine;
  lineSourceTextById.set(inputId, typeof sourceLine === "string" ? sourceLine : fallbackSourceLine);
  lineInput.dataset.pageIndex = String(pageIndex);
  lineInput.dataset.lineIndex = String(lineIndex);
  if (state.documentType === DOCUMENT_TYPE_NORMAL) {
    lineInput.removeAttribute("aria-labelledby");
  } else {
    lineInput.setAttribute("aria-labelledby", labelId);
  }
  lineInput.addEventListener("keydown", onLineNavigationKeyDown);
  lineInput.addEventListener("input", onLineInput);
  lineInput.addEventListener("focus", onLineFocus);
  lineInput.addEventListener("keyup", onLineSelectionChange);
  lineInput.addEventListener("click", onLineSelectionChange);
  lineInput.addEventListener("select", onLineSelectionChange);
  lineInput.addEventListener("blur", onLineBlur);
  lineInput.addEventListener("keydown", onBrailleLineKeyDown);
  lineInput.addEventListener("keyup", onBrailleLineKeyUp);
  lineInput.addEventListener("blur", onBrailleLineBlur);

  const counter = document.createElement("span");
  counter.id = counterId;
  counter.className = "line-counter";
  counter.setAttribute("aria-hidden", "true");
  if (state.documentType === DOCUMENT_TYPE_NORMAL) {
    counter.hidden = true;
  }
  counter.textContent =
    `${value.length}/${state.documentConfig.charactersPerLine}`;

  const translationLine = document.createElement("div");
  translationLine.id = `${inputId}-translation`;
  translationLine.className = "line-translation";
  translationLine.hidden = true;
  translationLine.setAttribute(
    "aria-label",
    `Traduction de la page ${pageIndex + 1}, ligne ${lineIndex + 1}`,
  );

  lineWrapper.append(label, lineInput, counter, translationLine);
  updateLinePositionLabel(lineInput);
  return lineWrapper;
}

function renderEditorPages(options = {}) {
  const { sourceBuffer = null } = options;

  if (!state.documentConfig) {
    editorPages.replaceChildren();
    return;
  }

  editorPages.replaceChildren();
  lineTranslationRequestIds.clear();
  lineSourceTextById.clear();
  if (state.documentType !== DOCUMENT_TYPE_BRAILLE) {
    void clearLinuxBrlapiDisplay();
  }

  state.pages.forEach((pageLines, pageIndex) => {
    const pageBlock = document.createElement("fieldset");
    pageBlock.className = "page-block";

    const pageLegend = document.createElement("legend");
    pageLegend.textContent = `Page ${pageIndex + 1}`;
    pageBlock.append(pageLegend);

    const linesContainer = document.createElement("div");
    linesContainer.className = "line-list";

    pageLines.forEach((lineValue, lineIndex) => {
      linesContainer.append(createLineEditor(pageIndex, lineIndex, lineValue, sourceBuffer));
    });

    pageBlock.append(linesContainer);
    editorPages.append(pageBlock);
  });

  renderInlineTranslationInEditor();
}

function openDocumentEditor() {
  setWelcomePanelOpen(false);
  setNewDocumentPanelOpen(true);
  setEditorOpen(true);
  void refreshActiveTableStyleSupport();
  updateDocumentMetadata();
  renderEditorPages();
  refreshActiveLineSpacePreview();
  refreshAllActionStates();
  if (state.realtimeTranslationEnabled && !isBrailleOnlyEditorMode()) {
    scheduleLiveBraillePreviewRefresh({ immediate: true });
  } else {
    clearLiveBraillePreview();
  }
}

function resetTranslationOutput() {
  clearInlineTranslation();
  setStatus(translationStatusMessage, "", "neutral");
}

function closeCurrentDocument(options = {}) {
  const { preserveStatusMessage = false } = options;
  clearBrailleChordState();
  void clearLinuxBrlapiDisplay();
  cancelLiveBraillePreviewRefresh();
  styleSupportRequestId += 1;
  lineTranslationRequestIds.clear();
  lineSourceTextById.clear();

  state.documentConfig = null;
  state.documentMeta = null;
  state.pages = [];
  state.documentType = DOCUMENT_TYPE_NORMAL;
  state.filePath = null;
  state.isDirty = false;
  lastFocusedLinePosition = null;
  setSelectedDocumentTypeInForm(DOCUMENT_TYPE_NORMAL);

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
      "Document fermé. Crée ou ouvre un document .gnp/.gnb pour continuer.",
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
  const selector = `#${buildLineInputId(linePosition.pageIndex, linePosition.lineIndex)}`;
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

function canApplyBfuStyleActions() {
  return (
    state.documentConfig !== null &&
    state.documentType === DOCUMENT_TYPE_NORMAL &&
    !isFileBusy &&
    !isTranslationBusy
  );
}

function applyStyleTagToLineSelection(lineInput, openTag, closeTag) {
  if (!isLineInput(lineInput)) {
    return null;
  }

  const currentValue = lineInput.value;
  const selectionStart = lineInput.selectionStart ?? currentValue.length;
  const selectionEnd = lineInput.selectionEnd ?? selectionStart;
  const selectedText = currentValue.slice(selectionStart, selectionEnd);
  const beforeSelection = currentValue.slice(0, selectionStart);
  const afterSelection = currentValue.slice(selectionEnd);

  const nextValue =
    `${beforeSelection}` +
    `${openTag}` +
    `${selectedText}` +
    `${closeTag}` +
    `${afterSelection}`;

  lineInput.value = nextValue;
  lineInput.dispatchEvent(new Event("input", { bubbles: true }));
  lineInput.focus();

  const selectionStartAfterWrap = selectionStart + openTag.length;
  const selectionEndAfterWrap = selectionStartAfterWrap + selectedText.length;
  lineInput.setSelectionRange(selectionStartAfterWrap, selectionEndAfterWrap);

  return {
    selectionWasEmpty: selectionStart === selectionEnd,
  };
}

function toggleStyleTagAtLineCaret(lineInput, styleName) {
  if (!isLineInput(lineInput)) {
    return null;
  }

  const styleTags = BFU_STYLE_TAG_BY_NAME[styleName];
  if (!styleTags) {
    return null;
  }

  const currentValue = lineInput.value;
  const { selectionStart, isEmpty } = getLineSelectionRange(lineInput);
  if (!isEmpty) {
    return null;
  }

  const styleIsActive = isStyleClassActiveAtTextPosition(currentValue, selectionStart, styleName);
  const tagToInsert = styleIsActive ? styleTags.closeTag : styleTags.openTag;
  const nextValue =
    `${currentValue.slice(0, selectionStart)}` +
    `${tagToInsert}` +
    `${currentValue.slice(selectionStart)}`;

  lineInput.value = nextValue;
  lineInput.dispatchEvent(new Event("input", { bubbles: true }));
  lineInput.focus();

  const nextCaret = selectionStart + tagToInsert.length;
  lineInput.setSelectionRange(nextCaret, nextCaret);
  updateLineInputBfuVisualState(lineInput);

  return {
    activated: !styleIsActive,
  };
}

function applyBfuStyleByName(styleName) {
  if (!canApplyBfuStyleActions()) {
    setStatus(
      documentStatusMessage,
      "La mise en forme BFU est disponible uniquement en document normal (.gnp).",
      "neutral",
    );
    return;
  }

  const styleTags = BFU_STYLE_TAG_BY_NAME[styleName];
  if (!styleTags) {
    return;
  }

  if (!isStyleSupportedByCurrentTable(styleName)) {
    setStatus(
      documentStatusMessage,
      `La table active ne prend pas en charge le ${styleTags.label} BFU.`,
      "neutral",
    );
    return;
  }

  const targetLineInput = resolveFormattingTargetLineInput();
  if (!targetLineInput) {
    setStatus(
      documentStatusMessage,
      "Sélectionne une ligne du document avant d'appliquer une mise en forme BFU.",
      "neutral",
    );
    return;
  }

  if (styleName === "italic") {
    const { isEmpty } = getLineSelectionRange(targetLineInput);
    if (isEmpty) {
      const toggleResult = toggleStyleTagAtLineCaret(targetLineInput, styleName);
      if (!toggleResult) {
        return;
      }

      if (toggleResult.activated) {
        setStatus(
          documentStatusMessage,
          "Mode italique activé. Appuie de nouveau sur Ctrl/Cmd+I pour le désactiver.",
          "success",
        );
      } else {
        setStatus(documentStatusMessage, "Mode italique désactivé.", "neutral");
      }
      return;
    }
  }

  const applyResult = applyStyleTagToLineSelection(
    targetLineInput,
    styleTags.openTag,
    styleTags.closeTag,
  );
  if (!applyResult) {
    return;
  }

  const message = applyResult.selectionWasEmpty
    ? `Balises ${styleTags.openTag}${styleTags.closeTag} insérées pour le ${styleTags.label} BFU.`
    : `Mise en forme ${styleTags.label} BFU appliquée à la sélection.`;
  setStatus(documentStatusMessage, message, "success");
}

function onApplyBoldStyle() {
  applyBfuStyleByName("bold");
}

function onApplyItalicStyle() {
  applyBfuStyleByName("italic");
}

function onApplyUnderlineStyle() {
  applyBfuStyleByName("underline");
}

function getDirection() {
  const checkedDirection = document.querySelector('input[name="direction"]:checked');
  return checkedDirection ? checkedDirection.value : "text-to-braille";
}

function getDocumentTextForTranslation() {
  return buildTranslationTextFromDocumentLines(state.pages.flat());
}

function getDocumentText() {
  const documentText = getDocumentTextForTranslation();
  if (documentText.length === 0) {
    throw new Error("Le document est vide. Saisis du texte avant la traduction.");
  }

  return documentText;
}

function countBraillePagesInOutputText(outputText) {
  const normalizedOutputText =
    typeof outputText === "string"
      ? outputText.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n")
      : "";

  if (normalizedOutputText.length === 0) {
    return 1;
  }

  return normalizedOutputText.split("\f").length;
}

function buildNativeFormattingForSegment(nativeFormatting, beginningPageNumber) {
  if (!nativeFormatting || typeof nativeFormatting !== "object") {
    return undefined;
  }

  const normalizedPageLayout = normalizePageLayoutConfig(nativeFormatting.pageLayout);
  return {
    ...nativeFormatting,
    pageLayout: {
      ...normalizedPageLayout,
      beginningPageNumber,
    },
  };
}

async function translateDocumentWithForcedPageBreaks(options) {
  const {
    table,
    direction,
    executionMode,
    nativeFormatting,
    documentLines,
    baseInputText,
  } = options;
  const { usefulLines, segments } = buildTranslationSegmentsFromDocumentLines(documentLines);

  if (usefulLines.length === 0) {
    return {
      outputText: "",
      engine: null,
      executionMode,
      warning: null,
    };
  }

  const hasForcedPageBreaks = segments.length > 1;
  if (!hasForcedPageBreaks) {
    const response = await window.brailleApi.translate({
      table,
      direction,
      executionMode,
      nativeFormatting,
      inputText: typeof baseInputText === "string" ? baseInputText : usefulLines.join("\n"),
    });

    if (!response || typeof response.outputText !== "string") {
      throw new Error("Le service de traduction a retourné une réponse invalide.");
    }

    return response;
  }

  const warnings = [];
  const warningSet = new Set();
  const engines = [];
  const outputSegments = [];
  const pageLayout = normalizePageLayoutConfig(nativeFormatting?.pageLayout);
  const shouldAdjustBrailleBeginningNumber =
    executionMode === TRANSLATION_EXECUTION_MODE_PRODUCTION &&
    pageLayout.numberBraillePages === true;
  let nextBeginningPageNumber = pageLayout.beginningPageNumber;

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segmentLines = segments[segmentIndex];
    const segmentInputText = segmentLines.join("\n");

    if (segmentInputText.length === 0) {
      outputSegments.push("");
      if (shouldAdjustBrailleBeginningNumber) {
        nextBeginningPageNumber += 1;
      }
      continue;
    }

    const segmentNativeFormatting = shouldAdjustBrailleBeginningNumber
      ? buildNativeFormattingForSegment(nativeFormatting, nextBeginningPageNumber)
      : nativeFormatting;
    const response = await window.brailleApi.translate({
      table,
      direction,
      executionMode,
      nativeFormatting: segmentNativeFormatting,
      inputText: segmentInputText,
    });

    if (!response || typeof response.outputText !== "string") {
      throw new Error("Le service de traduction a retourné une réponse invalide.");
    }

    outputSegments.push(response.outputText);

    if (typeof response.warning === "string" && response.warning.length > 0) {
      if (!warningSet.has(response.warning)) {
        warningSet.add(response.warning);
        warnings.push(response.warning);
      }
    }

    if (typeof response.engine === "string" && response.engine.length > 0) {
      engines.push(response.engine);
    }

    if (shouldAdjustBrailleBeginningNumber) {
      nextBeginningPageNumber += countBraillePagesInOutputText(response.outputText);
    }
  }

  const uniqueEngines = [...new Set(engines)];
  return {
    outputText: outputSegments.join("\f"),
    engine:
      uniqueEngines.length === 1
        ? uniqueEngines[0]
        : uniqueEngines.length > 1
          ? "mixed-forced-page-break"
          : null,
    executionMode,
    warning: warnings.length > 0 ? warnings.join(" ") : null,
  };
}

function hasInlineTranslationOutput() {
  return state.inlineTranslatedLines.some((line) => typeof line === "string" && line.length > 0);
}

function renderInlineTranslationInEditor() {
  if (!state.documentConfig) {
    return;
  }

  const hideTranslationOutput = isBrailleOnlyEditorMode();

  state.pages.forEach((pageLines, pageIndex) => {
    pageLines.forEach((_lineValue, lineIndex) => {
      const lineId = `page-${pageIndex + 1}-line-${lineIndex + 1}-translation`;
      const translationElement = document.querySelector(`#${lineId}`);
      if (!(translationElement instanceof HTMLElement)) {
        return;
      }

      const flatLineIndex = getFlatLineIndex(pageIndex, lineIndex);
      const translatedLine = state.inlineTranslatedLines[flatLineIndex] ?? "";
      translationElement.textContent = hideTranslationOutput ? "" : translatedLine;
      translationElement.hidden = hideTranslationOutput || translatedLine.length === 0;
    });
  });
}

function applyInlineTranslationFromText(outputText) {
  if (!state.documentConfig) {
    state.inlineTranslatedLines = [];
    return;
  }

  if (isBrailleOnlyEditorMode()) {
    clearInlineTranslation();
    return;
  }

  const sourceLines = state.pages.flat();
  state.inlineTranslatedLines = mapTranslatedTextToDocumentLines(sourceLines, outputText);
  renderInlineTranslationInEditor();
}

function clearInlineTranslation() {
  state.inlineTranslatedLines = [];
  renderInlineTranslationInEditor();
}

function setLiveBrailleStatus(message, variant = "neutral") {
  setStatus(translationStatusMessage, message, variant);
}

function clearLiveBraillePreview() {
  clearInlineTranslation();

  if (isBrailleOnlyEditorMode()) {
    setLiveBrailleStatus(
      "Mode braille actif: l’éditeur affiche uniquement le braille.",
      "neutral",
    );
    return;
  }

  setLiveBrailleStatus(
    state.realtimeTranslationEnabled
      ? "Aucune traduction affichée dans l’éditeur pour le moment."
      : "Traduction en temps réel désactivée.",
    "neutral",
  );
}

async function refreshLiveBraillePreview() {
  if (!state.documentConfig) {
    clearLiveBraillePreview();
    return;
  }

  if (isBrailleOnlyEditorMode()) {
    clearLiveBraillePreview();
    return;
  }

  if (!state.realtimeTranslationEnabled) {
    clearLiveBraillePreview();
    return;
  }

  const sourceLines = state.pages.flat();
  const sourceText = buildTranslationTextFromDocumentLines(sourceLines);
  if (sourceText.length === 0) {
    clearInlineTranslation();
    setLiveBrailleStatus(
      "Traduction en attente. Saisis du texte dans le document.",
      "neutral",
    );
    return;
  }

  const realtimeDirection = getDirection();
  const requestId = ++liveBraillePreviewRequestId;
  setLiveBrailleStatus("Mise à jour de la traduction dans l’éditeur…", "neutral");

  try {
    const response = await translateDocumentWithForcedPageBreaks({
      table: state.documentConfig.table,
      direction: realtimeDirection,
      executionMode: TRANSLATION_EXECUTION_MODE_PREVIEW,
      documentLines: sourceLines,
      baseInputText: sourceText,
    });

    if (requestId !== liveBraillePreviewRequestId) {
      return;
    }

    if (!response || typeof response.outputText !== "string") {
      throw new Error("Le service de traduction a retourné une réponse invalide.");
    }

    applyInlineTranslationFromText(response.outputText);
    setLiveBrailleStatus("Traduction de l’éditeur à jour.", "success");
  } catch (error) {
    if (requestId !== liveBraillePreviewRequestId) {
      return;
    }

    clearInlineTranslation();
    setLiveBrailleStatus(
      `Traduction intégrée indisponible: ${getErrorMessage(error)}`,
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

function getSelectedDocumentTypeFromForm() {
  const selectedType = document.querySelector('input[name="document-type"]:checked');
  if (!(selectedType instanceof HTMLInputElement)) {
    return DOCUMENT_TYPE_NORMAL;
  }

  return normalizeDocumentType(selectedType.value);
}

function setSelectedDocumentTypeInForm(documentType) {
  const normalizedType = normalizeDocumentType(documentType);
  documentTypeRadios.forEach((radio) => {
    if (!(radio instanceof HTMLInputElement)) {
      return;
    }

    radio.checked = radio.value === normalizedType;
  });
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
  const pageLayout = readPageLayoutConfigFromForm();

  const now = new Date().toISOString();
  state.documentType = getSelectedDocumentTypeFromForm();
  state.documentConfig = {
    table: selectedTable.table,
    tableLabel: selectedTable.label,
    linesPerPage,
    charactersPerLine,
    pageLayout,
  };
  state.documentMeta = {
    createdAt: now,
    updatedAt: now,
  };
  const editorLinesPerPage = getEditorLinesPerPageForType(state.documentType, linesPerPage);
  state.pages = [buildEmptyPage(editorLinesPerPage)];
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
  const selectedTypeInput = document.querySelector('input[name="document-type"]:checked');
  if (selectedTypeInput instanceof HTMLInputElement) {
    selectedTypeInput.focus();
  } else {
    tableSelect.focus();
  }
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
    if (state.documentType === DOCUMENT_TYPE_BRAILLE) {
      setDirection("text-to-braille");
      setInputMode(INPUT_MODE_TEXT, { announce: false });
      setRealtimeTranslationEnabled(true, { announce: false });
    } else {
      setRealtimeTranslationEnabled(true, { announce: false });
      setDirection("text-to-braille");
      setInputMode(INPUT_MODE_TEXT, { announce: false });
    }
    resetTranslationOutput();
    setStatus(
      documentStatusMessage,
      `Document créé. Pense à l’enregistrer au format ${getDocumentExtension()}.`,
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

  state.pages.push(buildEmptyPage(getEditorLinesPerPage()));
  markDocumentChanged();
  renderEditorPages();
  updateDocumentMetadata();

  const newPageIndex = state.pages.length - 1;
  setStatus(documentStatusMessage, `Page ${newPageIndex + 1} ajoutée.`, "success");
  focusLineInput(newPageIndex, 0);
  if (state.realtimeTranslationEnabled && !isBrailleOnlyEditorMode()) {
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

  if (isBrailleOnlyEditorMode()) {
    clearInlineTranslation();
    setStatus(
      translationStatusMessage,
      "Mode braille actif: conversion instantanée pendant la saisie standard.",
      "neutral",
    );
    return;
  }

  const translationDirection = getDirection();
  const shouldGenerateBrailleCompanion =
    state.documentType === DOCUMENT_TYPE_NORMAL &&
    translationDirection === "text-to-braille";
  const sourceLinesSnapshot = state.pages.flat();

  if (shouldGenerateBrailleCompanion && !state.filePath) {
    const saveSucceeded = await saveDocumentWithOptions({
      forcePrompt: true,
      announceSuccess: false,
      canceledMessage:
        "Traduction annulée: enregistre d’abord le fichier .gnp pour générer son .gnb.",
    });

    if (!saveSucceeded) {
      return;
    }
  }

  isTranslationBusy = true;
  refreshAllActionStates();
  setStatus(translationStatusMessage, "", "neutral");

  try {
    const inputText = getDocumentText();
    const response = await translateDocumentWithForcedPageBreaks({
      table: state.documentConfig.table,
      direction: translationDirection,
      executionMode: TRANSLATION_EXECUTION_MODE_PRODUCTION,
      nativeFormatting: {
        linesPerPage: state.documentConfig.linesPerPage,
        charactersPerLine: state.documentConfig.charactersPerLine,
        pageLayout: normalizePageLayoutConfig(state.documentConfig.pageLayout),
      },
      documentLines: sourceLinesSnapshot,
      baseInputText: inputText,
    });

    if (!response || typeof response.outputText !== "string") {
      throw new Error("Le service de traduction a retourné une réponse invalide.");
    }

    const translationWarning =
      typeof response.warning === "string" && response.warning.length > 0
        ? response.warning
        : null;
    const usedNativeEngine = response.engine === "native-liblouisutdml";

    if (!shouldGenerateBrailleCompanion) {
      applyInlineTranslationFromText(response.outputText);
      let translationMessage = usedNativeEngine
        ? "Traduction terminée avec le moteur natif (liblouisutdml)."
        : "Traduction terminée.";
      if (translationWarning) {
        translationMessage += ` ${translationWarning}`;
      }

      setStatus(translationStatusMessage, translationMessage, "success");
    } else {
      const translatedPages = buildPagesFromTranslatedText(response.outputText);
      const normalizedPageLayout = normalizePageLayoutConfig(state.documentConfig.pageLayout);
      const shouldSplitIntoVolumes = normalizedPageLayout.splitIntoVolumes === true;
      let editorBraillePages = translatedPages;
      let generatedFilePath = null;
      let generatedVolumeCount = 0;
      let generationError = null;

      try {
        if (shouldSplitIntoVolumes) {
          const volumeGenerationResult = await generateBrailleCompanionVolumes(
            translatedPages,
            normalizedPageLayout.pagesPerVolume,
          );
          generatedFilePath = volumeGenerationResult.savedPaths[0] ?? null;
          generatedVolumeCount = volumeGenerationResult.savedPaths.length;
          editorBraillePages = volumeGenerationResult.volumePages[0] ?? translatedPages;
        } else {
          generatedFilePath = await generateBrailleCompanionDocument(response.outputText);
        }
      } catch (error) {
        generationError = error;
      }

      switchEditorToBrailleDocument(editorBraillePages, {
        sourceLines: sourceLinesSnapshot,
        filePath: generatedFilePath,
        markDirty: generatedFilePath === null,
      });

      if (generationError) {
        let translationMessage =
          shouldSplitIntoVolumes
            ? "Traduction braille appliquée dans l’éditeur, mais la génération des volumes .gnb a échoué: " +
              getErrorMessage(generationError)
            : "Traduction braille appliquée dans l’éditeur, mais l’enregistrement automatique du .gnb a échoué: " +
          getErrorMessage(generationError);
        if (translationWarning) {
          translationMessage += ` ${translationWarning}`;
        }

        setStatus(
          translationStatusMessage,
          translationMessage,
          "error",
        );
        setStatus(
          documentStatusMessage,
          shouldSplitIntoVolumes
            ? "Éditeur basculé vers un document braille non enregistré. Enregistre en .gnb pour conserver les changements."
            : "Éditeur basculé vers le document braille non enregistré. Enregistre en .gnb pour conserver les changements.",
          "neutral",
        );
      } else {
        const translationOutcomeMessage = shouldSplitIntoVolumes
          ? `Traduction terminée${usedNativeEngine ? " avec le moteur natif" : ""}. ` +
            `${generatedVolumeCount} volume(s) généré(s) (${normalizedPageLayout.pagesPerVolume} page(s)/volume). ` +
            `Éditeur basculé vers ${toFileName(generatedFilePath)}.`
          : usedNativeEngine
            ? `Traduction terminée avec le moteur natif. Éditeur basculé vers ${toFileName(generatedFilePath)}.`
            : `Traduction terminée. Éditeur basculé vers ${toFileName(generatedFilePath)}.`;

        setStatus(
          translationStatusMessage,
          translationOutcomeMessage,
          "success",
        );
        setStatus(
          documentStatusMessage,
          shouldSplitIntoVolumes
            ? `Volumes braille générés (${generatedVolumeCount}). Document actif: ${toFileName(generatedFilePath)}.`
            : `Document braille actif: ${toFileName(generatedFilePath)}.`,
          "success",
        );
        if (translationWarning) {
          setStatus(documentStatusMessage, translationWarning, "neutral");
        }
      }
    }
  } catch (error) {
    clearInlineTranslation();
    setStatus(translationStatusMessage, `Erreur: ${getErrorMessage(error)}`, "error");
  } finally {
    isTranslationBusy = false;
    refreshAllActionStates();
  }
}

function seedLineSourceBufferFromLines(sourceLines) {
  if (!state.documentConfig || !Array.isArray(sourceLines)) {
    return;
  }

  lineSourceTextById.clear();

  state.pages.forEach((pageLines, pageIndex) => {
    pageLines.forEach((_lineValue, lineIndex) => {
      const inputId = buildLineInputId(pageIndex, lineIndex);
      const flatLineIndex = getFlatLineIndex(pageIndex, lineIndex);
      const sourceLine = sourceLines[flatLineIndex];
      lineSourceTextById.set(inputId, typeof sourceLine === "string" ? sourceLine : "");
    });
  });
}

function switchEditorToBrailleDocument(translatedPages, options = {}) {
  const {
    sourceLines = [],
    filePath = null,
    markDirty = false,
  } = options;

  if (!state.documentConfig || !Array.isArray(translatedPages)) {
    throw new Error("Impossible de basculer vers le document braille.");
  }

  state.documentType = DOCUMENT_TYPE_BRAILLE;
  state.pages = translatedPages.map((page) => (Array.isArray(page) ? page.slice() : []));
  state.filePath = typeof filePath === "string" && filePath.length > 0 ? filePath : null;
  state.isDirty = markDirty || state.filePath === null;
  if (state.documentMeta) {
    state.documentMeta.updatedAt = new Date().toISOString();
  }

  setSelectedDocumentTypeInForm(DOCUMENT_TYPE_BRAILLE);
  setDirection("text-to-braille");
  setInputMode(INPUT_MODE_TEXT, { announce: false });
  setRealtimeTranslationEnabled(true, { announce: false });

  clearInlineTranslation();
  renderEditorPages();
  seedLineSourceBufferFromLines(sourceLines);
  updateDocumentMetadata();
  refreshActiveLineSpacePreview();
  refreshAllActionStates();
  focusLineInput(0, 0);
}

function splitTranslatedTextByBraillePageBreaks(translatedTextValue) {
  if (typeof translatedTextValue !== "string" || !translatedTextValue.includes("\f")) {
    return null;
  }

  const normalizedOutput = translatedTextValue
    .replace(/\r\n/gu, "\n")
    .replace(/\r/gu, "\n");

  return normalizedOutput.split("\f").map((pageSegment) => {
    const pageLines = pageSegment.split("\n");

    while (pageLines.length > 0 && pageLines[pageLines.length - 1] === "") {
      pageLines.pop();
    }

    return pageLines.length > 0 ? pageLines : [""];
  });
}

function buildBraillePagesFromExplicitPageSegments(pageSegments, linesPerPage, charactersPerLine) {
  const builtPages = [];

  pageSegments.forEach((segmentLines) => {
    const safeSegmentLines = Array.isArray(segmentLines) && segmentLines.length > 0
      ? segmentLines
      : [""];
    const wrappedSegmentLines = wrapFlatLinesFromIndex(
      safeSegmentLines,
      0,
      charactersPerLine,
    ).lines;

    for (
      let startLineIndex = 0;
      startLineIndex < wrappedSegmentLines.length;
      startLineIndex += linesPerPage
    ) {
      const pageLines = wrappedSegmentLines.slice(startLineIndex, startLineIndex + linesPerPage);
      while (pageLines.length < linesPerPage) {
        pageLines.push("");
      }
      builtPages.push(pageLines);
    }
  });

  if (builtPages.length === 0) {
    builtPages.push(buildEmptyPage(linesPerPage));
  }

  return builtPages;
}

function buildPagesFromTranslatedText(translatedTextValue) {
  if (!state.documentConfig) {
    throw new Error("Aucun document actif pour préparer le fichier traduit.");
  }

  const explicitPageSegments = splitTranslatedTextByBraillePageBreaks(translatedTextValue);
  if (explicitPageSegments) {
    return buildBraillePagesFromExplicitPageSegments(
      explicitPageSegments,
      state.documentConfig.linesPerPage,
      state.documentConfig.charactersPerLine,
    );
  }

  const translatedLines =
    translatedTextValue.length > 0 ? translatedTextValue.split("\n") : [""];
  const wrapResult = wrapFlatLinesFromIndex(
    translatedLines,
    0,
    state.documentConfig.charactersPerLine,
  );

  return buildPagesFromFlatLines(wrapResult.lines, state.documentConfig.linesPerPage);
}

function cloneBraillePages(pages) {
  if (!Array.isArray(pages)) {
    return [];
  }

  return pages.map((page) => (Array.isArray(page) ? page.slice() : []));
}

function splitBraillePagesIntoVolumes(braillePages, pagesPerVolume) {
  const normalizedPagesPerVolume = ensureBoundedIntegerFromNumber(
    pagesPerVolume,
    "Pages braille par volume",
    1,
    9999,
  );
  const safePages = cloneBraillePages(braillePages);

  if (safePages.length === 0) {
    return [[buildEmptyPage(state.documentConfig?.linesPerPage ?? 25)]];
  }

  const volumePages = [];
  for (
    let startPageIndex = 0;
    startPageIndex < safePages.length;
    startPageIndex += normalizedPagesPerVolume
  ) {
    volumePages.push(
      safePages.slice(startPageIndex, startPageIndex + normalizedPagesPerVolume),
    );
  }

  return volumePages;
}

async function saveBrailleCompanionDocumentFromPages(braillePages, filePath) {
  if (!state.documentConfig || !state.filePath) {
    throw new Error("Le document source doit être enregistré en .gnp avant génération.");
  }

  const targetPath =
    typeof filePath === "string" && filePath.length > 0
      ? filePath
      : toCompanionBraillePath(state.filePath);

  const companionPayload = buildDocumentPayload({
    documentType: DOCUMENT_TYPE_BRAILLE,
    defaultDirection: "text-to-braille",
    inputMode: INPUT_MODE_TEXT,
    realtimeTranslationEnabled: true,
    pages: cloneBraillePages(braillePages),
  });

  const response = await window.brailleApi.saveDocument({
    document: companionPayload,
    filePath: targetPath,
  });

  if (!response || typeof response !== "object") {
    throw new Error("La réponse de génération du fichier .gnb est invalide.");
  }

  if (response.canceled === true) {
    throw new Error("La génération du fichier .gnb a été annulée.");
  }

  if (typeof response.filePath !== "string" || response.filePath.length === 0) {
    throw new Error("Le chemin du fichier .gnb généré est invalide.");
  }

  return response.filePath;
}

async function generateBrailleCompanionDocument(translatedOutputText) {
  const translatedPages = buildPagesFromTranslatedText(translatedOutputText);
  return saveBrailleCompanionDocumentFromPages(translatedPages);
}

async function generateBrailleCompanionVolumes(translatedPages, pagesPerVolume) {
  if (!state.filePath) {
    throw new Error("Le document source doit être enregistré en .gnp avant génération.");
  }

  const volumePages = splitBraillePagesIntoVolumes(translatedPages, pagesPerVolume);
  const savedPaths = [];

  for (let volumeIndex = 0; volumeIndex < volumePages.length; volumeIndex += 1) {
    const volumeFilePath = toVolumeBraillePath(state.filePath, volumeIndex + 1);

    try {
      const savedPath = await saveBrailleCompanionDocumentFromPages(
        volumePages[volumeIndex],
        volumeFilePath,
      );
      savedPaths.push(savedPath);
    } catch (error) {
      const generatedVolumesLabel =
        savedPaths.length > 0
          ? savedPaths.map((savedPath) => toFileName(savedPath)).join(", ")
          : "aucun";
      throw new Error(
        `Impossible de générer le volume ${volumeIndex + 1}: ${getErrorMessage(error)}. ` +
          `Volumes déjà générés: ${generatedVolumesLabel}.`,
      );
    }
  }

  return {
    volumePages,
    savedPaths,
  };
}

async function onTranslate(event) {
  event.preventDefault();
  await runFullDocumentTranslation();
}

function buildDocumentPayload(overrides = {}) {
  if (!state.documentConfig) {
    throw new Error("Aucun document actif à enregistrer.");
  }

  const now = new Date().toISOString();
  const createdAt =
    typeof overrides.createdAt === "string"
      ? overrides.createdAt
      : state.documentMeta?.createdAt ?? now;
  const updatedAt =
    typeof overrides.updatedAt === "string"
      ? overrides.updatedAt
      : now;
  const documentType = normalizeDocumentType(overrides.documentType ?? state.documentType);

  return {
    format: GBS_DOCUMENT_FORMAT,
    formatVersion: GBS_DOCUMENT_FORMAT_VERSION,
    appName: "Galarneau Braille Suite",
    documentType,
    createdAt,
    updatedAt,
    defaultDirection: overrides.defaultDirection ?? getDirection(),
    inputMode: normalizeInputMode(overrides.inputMode ?? state.inputMode),
    realtimeTranslationEnabled:
      typeof overrides.realtimeTranslationEnabled === "boolean"
        ? overrides.realtimeTranslationEnabled
        : state.realtimeTranslationEnabled,
    showSpaceMarkersEnabled:
      typeof overrides.showSpaceMarkersEnabled === "boolean"
        ? overrides.showSpaceMarkersEnabled
        : state.showSpaceMarkersEnabled,
    documentConfig: {
      table: state.documentConfig.table,
      tableLabel: state.documentConfig.tableLabel,
      linesPerPage: state.documentConfig.linesPerPage,
      charactersPerLine: state.documentConfig.charactersPerLine,
      pageLayout: normalizePageLayoutConfig(state.documentConfig.pageLayout),
    },
    pages: Array.isArray(overrides.pages)
      ? overrides.pages.map((page) => (Array.isArray(page) ? page.slice() : []))
      : state.pages.map((page) => page.slice()),
  };
}

function applyLoadedDocumentFromFile(loadedDocument, filePath) {
  if (!loadedDocument || typeof loadedDocument !== "object") {
    throw new Error("Le document ouvert est invalide.");
  }

  if (loadedDocument.format !== GBS_DOCUMENT_FORMAT) {
    throw new Error("Le fichier ne correspond pas au format attendu.");
  }

  if (loadedDocument.formatVersion !== GBS_DOCUMENT_FORMAT_VERSION) {
    throw new Error("La version du format de document n'est pas supportée.");
  }

  const config = loadedDocument.documentConfig;
  if (!config || typeof config !== "object") {
    throw new Error("La configuration du document est manquante.");
  }

  const selectedTable = findTableByPath(config.table);
  if (!selectedTable) {
    throw new Error("La table braille du document n'est pas supportée.");
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
  const pageLayout = normalizePageLayoutConfig(config.pageLayout);
  const documentType = normalizeDocumentType(loadedDocument.documentType);
  const isBrailleDocument = documentType === DOCUMENT_TYPE_BRAILLE;

  if (!Array.isArray(loadedDocument.pages) || loadedDocument.pages.length === 0) {
    throw new Error("Le document ne contient aucune page.");
  }

  const normalizedPages = loadedDocument.pages.map((page, pageIndex) => {
    if (!Array.isArray(page)) {
      throw new Error(`La page ${pageIndex + 1} est invalide.`);
    }

    if (isBrailleDocument && page.length !== linesPerPage) {
      throw new Error(
        `La page ${pageIndex + 1} ne respecte pas le format de ${linesPerPage} lignes.`,
      );
    }

    if (!isBrailleDocument && page.length === 0) {
      throw new Error(`La page ${pageIndex + 1} ne contient aucune ligne.`);
    }

    return page.map((line, lineIndex) => {
      if (typeof line !== "string") {
        throw new Error(
          `La ligne ${lineIndex + 1} de la page ${pageIndex + 1} est invalide.`,
        );
      }

      if (isBrailleDocument && line.length > charactersPerLine) {
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
    pageLayout,
  };
  state.documentMeta = {
    createdAt,
    updatedAt,
  };
  state.documentType = documentType;
  if (isBrailleDocument) {
    state.pages = normalizedPages;
  } else {
    const flattenedLines = normalizedPages.flat();
    state.pages = buildPagesFromFlatLines(
      flattenedLines,
      getEditorLinesPerPageForType(DOCUMENT_TYPE_NORMAL, linesPerPage),
    );
  }
  state.filePath = filePath;
  state.isDirty = false;

  setSelectedDocumentTypeInForm(documentType);
  tableSelect.value = selectedTable.table;
  linesPerPageInput.value = String(linesPerPage);
  charactersPerLineInput.value = String(charactersPerLine);
  applyPageLayoutConfigToForm(pageLayout);
  const effectiveDirection =
    documentType === DOCUMENT_TYPE_BRAILLE ? "text-to-braille" : defaultDirection;
  const effectiveInputMode =
    documentType === DOCUMENT_TYPE_BRAILLE ? INPUT_MODE_TEXT : inputMode;
  const effectiveRealtimeTranslationEnabled =
    documentType === DOCUMENT_TYPE_BRAILLE ? true : realtimeTranslationEnabled;
  setDirection(effectiveDirection);
  setInputMode(effectiveInputMode, { announce: false });
  setRealtimeTranslationEnabled(effectiveRealtimeTranslationEnabled, { announce: false });
  setShowSpaceMarkersEnabled(showSpaceMarkersEnabled, { announce: false });

  resetTranslationOutput();
  openDocumentEditor();
}

async function saveDocumentWithOptions(options = {}) {
  const {
    forcePrompt = false,
    announceSuccess = true,
    canceledMessage,
  } = options;
  if (!state.documentConfig || isFileBusy || isTranslationBusy) {
    return false;
  }

  isFileBusy = true;
  refreshAllActionStates();

  try {
    assertBrailleApiAvailable();

    const documentPayload = buildDocumentPayload();
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
        canceledMessage ?? (forcePrompt ? "Enregistrement sous annulé." : "Enregistrement annulé."),
        "neutral",
      );
      return false;
    }

    if (typeof response.filePath !== "string" || response.filePath.length === 0) {
      throw new Error("Le chemin du document enregistré est invalide.");
    }

    state.filePath = response.filePath;
    state.isDirty = false;
    state.documentType = normalizeDocumentType(documentPayload.documentType);
    if (state.documentMeta) {
      state.documentMeta.updatedAt = documentPayload.updatedAt;
    }

    updateDocumentMetadata();
    if (announceSuccess) {
      setStatus(
        documentStatusMessage,
        `Document enregistré: ${toFileName(state.filePath)}.`,
        "success",
      );
    }
    return true;
  } catch (error) {
    setStatus(documentStatusMessage, `Erreur: ${getErrorMessage(error)}`, "error");
    return false;
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

function coerceBoundedInteger(value, fallbackValue, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    return fallbackValue;
  }

  return value;
}

function buildOpenDocumentRequestPayload() {
  const selectedTableFromState = state.documentConfig
    ? findTableByPath(state.documentConfig.table)
    : null;
  const selectedTableFromForm = findTableByPath(tableSelect.value);
  const selectedTable = selectedTableFromState ?? selectedTableFromForm ?? state.tables[0] ?? null;

  const linesPerPageCandidate = state.documentConfig
    ? state.documentConfig.linesPerPage
    : Number.parseInt(linesPerPageInput.value, 10);
  const charactersPerLineCandidate = state.documentConfig
    ? state.documentConfig.charactersPerLine
    : Number.parseInt(charactersPerLineInput.value, 10);
  const pageLayout = normalizePageLayoutConfig(
    state.documentConfig?.pageLayout ?? readPageLayoutConfigFromForm(),
  );

  return {
    importOptions: {
      table: selectedTable?.table ?? "fr-bfu-g2.ctb",
      tableLabel: selectedTable?.label ?? "Francais BFU grade 2",
      linesPerPage: coerceBoundedInteger(linesPerPageCandidate, 25, 1, 60),
      charactersPerLine: coerceBoundedInteger(charactersPerLineCandidate, 40, 1, 120),
      pageLayout,
    },
  };
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

    const response = await window.brailleApi.openDocument(buildOpenDocumentRequestPayload());
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
    const importWarning =
      typeof response.warning === "string" && response.warning.length > 0
        ? response.warning
        : null;
    const openedDocumentMessage =
      response.imported === true
        ? `Document importe: ${toFileName(response.filePath)}.`
        : `Document ouvert: ${toFileName(response.filePath)}.`;
    const statusMessage = importWarning
      ? `${openedDocumentMessage} ${importWarning}`
      : openedDocumentMessage;
    setStatus(
      documentStatusMessage,
      statusMessage,
      importWarning ? "neutral" : "success",
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

function onLinuxBrlapiEnabledToggleChange(event) {
  const toggle = event.currentTarget;
  if (!(toggle instanceof HTMLInputElement)) {
    return;
  }

  setLinuxBrlapiEnabled(toggle.checked);
}

function onPageLayoutControlChange() {
  refreshPageLayoutControlState();
}

function toggleRealtimeTranslation() {
  setRealtimeTranslationEnabled(!state.realtimeTranslationEnabled);
}

function onGlobalKeyDown(event) {
  if (event.defaultPrevented) {
    return;
  }

  if (!(event.ctrlKey || event.metaKey) || event.altKey) {
    return;
  }

  const normalizedKey = event.key.toLowerCase();

  if (!event.shiftKey && normalizedKey === "b") {
    event.preventDefault();
    onApplyBoldStyle();
    return;
  }

  if (!event.shiftKey && normalizedKey === "i") {
    event.preventDefault();
    onApplyItalicStyle();
    return;
  }

  if (!event.shiftKey && normalizedKey === "u") {
    event.preventDefault();
    onApplyUnderlineStyle();
    return;
  }

  if (event.shiftKey || normalizedKey !== "t") {
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

  if (payload.action === "apply-bold-style") {
    onApplyBoldStyle();
    return;
  }

  if (payload.action === "apply-italic-style") {
    onApplyItalicStyle();
    return;
  }

  if (payload.action === "apply-underline-style" || payload.action === "apply-highlight-style") {
    onApplyUnderlineStyle();
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
    return;
  }

  if (payload.action === "toggle-linux-brlapi" || payload.action === "toggle-braille-display") {
    toggleLinuxBrlapiEnabled();
  }
}

async function bootstrap() {
  setWelcomePanelOpen(true);
  setNewDocumentPanelOpen(false);
  setEditorOpen(false);
  state.documentType = DOCUMENT_TYPE_NORMAL;
  setSelectedDocumentTypeInForm(DOCUMENT_TYPE_NORMAL);
  if (startupNormalText) {
    startupNormalText.textContent = STARTUP_TEXT_MESSAGE;
  }
  if (startupBrailleOutput instanceof HTMLTextAreaElement) {
    startupBrailleOutput.value = "";
  }
  setStartupBrailleStatus("Préparation de la traduction braille d’accueil…", "neutral");
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
  applyPageLayoutConfigToForm(DEFAULT_PAGE_LAYOUT);
  renderBrailleDotGuide();
  isCreateLoading = true;
  refreshAllActionStates();

  try {
    await initializeTables();
    await initializeRuntimeInfo();
    await initializeLinuxBrlapiSupport();
    isCreateLocked = false;
    await renderStartupWelcomeMessage({ focusBrailleOutput: true });

    const nativeEngineInfo = state.runtimeInfo?.productionEngine ?? null;
    const nativeEngineReady = nativeEngineInfo?.available === true;
    const nativeEngineReason =
      typeof nativeEngineInfo?.reason === "string" && nativeEngineInfo.reason.length > 0
        ? nativeEngineInfo.reason
        : null;
    setStatus(
      documentStatusMessage,
      nativeEngineReady
        ? "Utilise Ctrl/Cmd+N pour afficher la création de document. Moteur natif liblouisutdml prêt pour la traduction complète."
        : `Utilise Ctrl/Cmd+N pour afficher la création de document. Le preview fonctionne via liblouis-js; le moteur natif s'activera quand le binaire file2brl sera disponible.${
            nativeEngineReason ? ` ${nativeEngineReason}` : ""
          }`,
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
if (applyBoldStyleButton instanceof HTMLButtonElement) {
  applyBoldStyleButton.addEventListener("click", onApplyBoldStyle);
}
if (applyItalicStyleButton instanceof HTMLButtonElement) {
  applyItalicStyleButton.addEventListener("click", onApplyItalicStyle);
}
if (applyUnderlineStyleButton instanceof HTMLButtonElement) {
  applyUnderlineStyleButton.addEventListener("click", onApplyUnderlineStyle);
}
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
if (linuxBrlapiEnabledToggle instanceof HTMLInputElement) {
  linuxBrlapiEnabledToggle.addEventListener("change", onLinuxBrlapiEnabledToggleChange);
}
[
  pageStructurePrintPagesToggle,
  pageStructureBraillePagesToggle,
  pageStructureNumberBraillePagesToggle,
  pageStructureContinuePagesToggle,
  pageStructurePageSeparatorToggle,
  pageStructurePageSeparatorNumberToggle,
  pageStructurePrintPageNumberAtSelect,
  pageStructureBraillePageNumberAtSelect,
  pageStructureBeginningPageNumberInput,
  pageStructureContentsToggle,
  pageStructurePrintPageNumbersInContentsToggle,
  pageStructureBraillePageNumbersInContentsToggle,
  pageStructureSplitIntoVolumesToggle,
  pageStructurePagesPerVolumeInput,
].forEach((control) => {
  if (!(control instanceof HTMLElement)) {
    return;
  }

  control.addEventListener("change", onPageLayoutControlChange);
});
window.addEventListener("keydown", onGlobalKeyDown);

if (typeof window.brailleApi?.onMenuAction === "function") {
  window.brailleApi.onMenuAction(onMenuActionRequest);
}

bootstrap();
