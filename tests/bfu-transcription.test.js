const assert = require("node:assert/strict");
const test = require("node:test");
const brailleService = require("../src/main/braille-service");

const BFU_TABLE = "tables/unicode.dis,tables/fr-bfu-g2.ctb";

function buildNativeFormatting(overrides = {}) {
  const source =
    overrides && typeof overrides === "object" && !Array.isArray(overrides)
      ? overrides
      : {};
  const sourcePageLayout =
    source.pageLayout && typeof source.pageLayout === "object" && !Array.isArray(source.pageLayout)
      ? source.pageLayout
      : {};

  return {
    linesPerPage: Number.isInteger(source.linesPerPage) ? source.linesPerPage : 25,
    charactersPerLine: Number.isInteger(source.charactersPerLine) ? source.charactersPerLine : 40,
    pageLayout: {
      printPages: false,
      braillePages: false,
      numberBraillePages: false,
      pageSeparator: false,
      ...sourcePageLayout,
    },
  };
}

function translate(inputText, executionMode = "preview", nativeFormattingOverrides = {}) {
  return brailleService.translate({
    table: BFU_TABLE,
    direction: "text-to-braille",
    executionMode,
    inputText,
    nativeFormatting: buildNativeFormatting(nativeFormattingOverrides),
  });
}

test("uses CBFU passage indicators for four or more uppercase words", () => {
  const result = translate("MAISON BALLARD ET FILS");

  assert.ok(result.outputText.startsWith("⠒⠨"));
  assert.equal(result.outputText.includes("⠨⠨"), false);
});

test("keeps word indicators for uppercase sequences shorter than four words", () => {
  const result = translate("MAISON BALLARD ET");

  assert.equal(result.outputText.includes("⠨⠨"), true);
  assert.equal(result.outputText.startsWith("⠒⠨"), false);
});

test("counts uppercase words across source line breaks", () => {
  const result = translate("MAISON BALLARD ET\nFILS");

  assert.ok(result.outputText.startsWith("⠒⠨"));
  assert.equal(result.outputText.includes("⠨⠨"), false);
});

test("does not treat title-case words as an uppercase passage", () => {
  const result = translate("Jean Sébastien Marie Louise");

  assert.equal(result.outputText.startsWith("⠒⠨"), false);
});

test("uses CBFU phrase indicators for long bold and italic emphases", () => {
  for (const executionMode of ["preview", "production"]) {
    for (const style of ["b", "i", "u"]) {
      const result = translate(
        `<${style}>un deux trois quatre</${style}>`,
        executionMode,
      );
      const words = result.outputText.split(/\s+/u);

      assert.ok(result.outputText.startsWith("⠒⠸"), `${executionMode} ${style}`);
      assert.ok(words.at(-1).startsWith("⠸"), `${executionMode} ${style}`);
      assert.equal(words.at(-1).endsWith("⠸"), false, `${executionMode} ${style}`);
    }
  }
});

test("keeps word-level emphasis indicators below the four-word threshold", () => {
  const result = translate("<i>un deux trois</i>");

  assert.equal(result.outputText.startsWith("⠒⠸"), false);
});

test("maps typographic apostrophes to braille apostrophe (dot 3)", () => {
  for (const executionMode of ["preview", "production"]) {
    const straightApostrophe = translate("l'objectif", executionMode).outputText;
    const typographicApostrophe = translate("l’objectif", executionMode).outputText;

    assert.equal(typographicApostrophe, straightApostrophe, executionMode);
    assert.ok(typographicApostrophe.includes("⠄"), executionMode);
    assert.equal(typographicApostrophe.includes("⠶"), false, executionMode);
  }
});

test("uses CBFU horizontal opening and closing lines for <anc>", () => {
  const result = translate("<anc>exemple");
  const [openingLine, contentLine, closingLine] = result.outputText.split("\n");

  assert.equal(openingLine, "⠶".repeat(contentLine.length));
  assert.equal(closingLine, "⠛".repeat(contentLine.length));
  assert.equal(contentLine.includes("⠿"), false);
});

test("sets the requested minimum width for <anc#>", () => {
  const result = translate("<anc12>exemple");
  const [openingLine, contentLine, closingLine] = result.outputText.split("\n");

  assert.equal(contentLine.length, 13);
  assert.equal(openingLine.length, contentLine.length);
  assert.equal(closingLine.length, contentLine.length);
});

test("semantic heading tags are removed from preview while keeping their text", () => {
  const semanticResult = translate(
    "<h1>titre & principal</h1>\n<h2>sous-titre < deuxième</h2>\ntexte courant",
  );
  const plainResult = translate("titre & principal\nsous-titre < deuxième\ntexte courant");

  assert.equal(semanticResult.outputText, plainResult.outputText);
});

test("production applies liblouisutdml semantics to explicitly tagged headings", () => {
  const result = translate(
    "<h1>titre & principal</h1>\n<h2>sous-titre < deuxième</h2>\ntexte courant",
    "production",
  );
  const nativeEngineAvailable =
    brailleService.getRuntimeInfo().productionEngine.available;

  assert.doesNotMatch(result.outputText, /<\/?h[12]>/u);
  assert.ok(result.outputText.length > 0);
  if (nativeEngineAvailable) {
    assert.equal(result.engine, "native-liblouisutdml");
    assert.ok(result.outputText.includes("\n"));
  }
});

test("separates an inline <anc> frame from surrounding text", () => {
  const result = translate("avant\n<anc>exemple\naprès");
  const lines = result.outputText.split("\n");

  assert.equal(lines[1], "");
  assert.ok(lines[2].startsWith("⠶"));
  assert.ok(lines[4].startsWith("⠛"));
  assert.equal(lines[5], "");
});

test("applies uppercase passage indicators to native production output", () => {
  const result = translate("MAISON BALLARD ET FILS", "production");
  const passageStart =
    result.engine === "native-liblouisutdml" ? ":¨" : "⠒⠨";
  const repeatedCapitalIndicators =
    result.engine === "native-liblouisutdml" ? "¨¨" : "⠨⠨";

  assert.ok(result.outputText.startsWith(passageStart));
  assert.equal(result.outputText.includes(repeatedCapitalIndicators), false);
});

test("preserves source line breaks in preview output", () => {
  const result = translate("alpha\nbeta\ngamma");
  const lines = result.outputText.split("\n");

  assert.equal(lines.length, 3);
  assert.ok(lines.every((line) => line.length > 0));
});

test("interprets <cb#> block markers across lines until closing tag", () => {
  const result = translate("<cb4>alpha\nbeta\n<cb>gamma\ndelta");
  const lines = result.outputText.split("\n");

  assert.equal(lines.length, 4);
  assert.ok(lines[0].startsWith("    "));
  assert.ok(lines[1].startsWith("    "));
  assert.ok(lines[2].startsWith("    "));
  assert.equal(lines[3].startsWith("    "), false);
});

test("production fallback keeps page numbers and separators on incomplete final braille page", () => {
  const sourceText =
    "<b>Titre principal :</b>\n" +
    "ligne un\n" +
    "ligne deux\n" +
    "ligne trois\n" +
    "ligne quatre\n" +
    "ligne cinq";

  const result = translate(sourceText, "production", {
    linesPerPage: 6,
    charactersPerLine: 40,
    pageLayout: {
      printPages: true,
      braillePages: true,
      numberBraillePages: true,
      pageSeparator: true,
      pageSeparatorNumber: true,
      printPageNumberAt: "top",
      braillePageNumberAt: "bottom",
      beginningPageNumber: 1,
    },
  });

  assert.equal(result.engine, "liblouis-js-production-fallback");

  const pages = result.outputText.split("\f");
  assert.ok(pages.length >= 2);

  const firstPageLines = pages[0].split("\n");
  const lastPageLines = pages[pages.length - 1].split("\n");
  const expectedLastPageNumber = String(pages.length);
  const expectedFirstPageNumber = "1";
  const expectedFirstPageBrailleNumber = translate(expectedFirstPageNumber).outputText;
  const expectedBrailleLastPageNumber = translate(expectedLastPageNumber).outputText;
  const expectedFirstPageBrailleField =
    expectedFirstPageBrailleNumber.length <= 3
      ? expectedFirstPageBrailleNumber.padStart(3, " ")
      : expectedFirstPageBrailleNumber.slice(-3);
  const expectedLastPageBrailleField =
    expectedBrailleLastPageNumber.length <= 3
      ? expectedBrailleLastPageNumber.padStart(3, " ")
      : expectedBrailleLastPageNumber.slice(-3);

  assert.equal(firstPageLines.length, 6);
  assert.equal(lastPageLines.length, 6);
  assert.equal(firstPageLines[0].slice(0, -3).trim(), "");
  assert.equal(lastPageLines[0].slice(0, -3).trim(), "");
  assert.equal(firstPageLines[0].slice(-3), expectedFirstPageNumber.padStart(3, " "));
  assert.equal(lastPageLines[0].slice(-3), expectedLastPageNumber.padStart(3, " "));
  assert.match(firstPageLines[4], /-/u);
  assert.match(lastPageLines[4], /-/u);
  assert.equal(lastPageLines[4].includes(expectedLastPageNumber), true);
  assert.equal(firstPageLines[5].slice(0, -3).trim(), "");
  assert.equal(lastPageLines[5].slice(0, -3).trim(), "");
  assert.equal(firstPageLines[5].slice(-3), expectedFirstPageBrailleField);
  assert.equal(lastPageLines[5].slice(-3), expectedLastPageBrailleField);
});

test("production fallback can keep a fixed print page number across multiple braille pages", () => {
  const sourceText =
    "<b>Titre :</b>\n" +
    "ligne un\n" +
    "ligne deux\n" +
    "ligne trois\n" +
    "ligne quatre\n" +
    "ligne cinq\n" +
    "ligne six\n" +
    "ligne sept";

  const result = translate(sourceText, "production", {
    linesPerPage: 5,
    charactersPerLine: 40,
    pageLayout: {
      printPages: true,
      braillePages: true,
      numberBraillePages: true,
      pageSeparator: true,
      pageSeparatorNumber: true,
      printPageNumberAt: "top",
      braillePageNumberAt: "bottom",
      beginningPageNumber: 10,
      printPageNumber: 3,
      printPageBreakAfterSegment: true,
    },
  });

  assert.equal(result.engine, "liblouis-js-production-fallback");

  const pages = result.outputText.split("\f");
  assert.ok(pages.length >= 2);

  const firstPageLines = pages[0].split("\n");
  const lastPageLines = pages[pages.length - 1].split("\n");

  // Printed page number must stay tied to the source page (fixed per segment).
  assert.equal(firstPageLines[0].slice(-3), "  3");
  assert.equal(lastPageLines[0].slice(-3), "  3");

  // Braille page numbers still follow braille pagination.
  const expectedFirstBraillePageNumber = translate("10").outputText;
  const expectedLastBraillePageNumber = translate(String(10 + pages.length - 1)).outputText;
  const expectedFirstBrailleField =
    expectedFirstBraillePageNumber.length <= 3
      ? expectedFirstBraillePageNumber.padStart(3, " ")
      : expectedFirstBraillePageNumber.slice(-3);
  const expectedLastBrailleField =
    expectedLastBraillePageNumber.length <= 3
      ? expectedLastBraillePageNumber.padStart(3, " ")
      : expectedLastBraillePageNumber.slice(-3);

  assert.equal(firstPageLines[firstPageLines.length - 1].slice(-3), expectedFirstBrailleField);
  assert.equal(lastPageLines[lastPageLines.length - 1].slice(-3), expectedLastBrailleField);

  // Separator with print page number appears only when the source page boundary is reached.
  assert.equal(firstPageLines[firstPageLines.length - 2].includes("3"), false);
  assert.equal(lastPageLines[lastPageLines.length - 2].includes("3"), true);
});
