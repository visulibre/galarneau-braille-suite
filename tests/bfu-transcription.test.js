const assert = require("node:assert/strict");
const test = require("node:test");
const brailleService = require("../src/main/braille-service");

const BFU_TABLE = "tables/unicode.dis,tables/fr-bfu-g2.ctb";

function translate(inputText, executionMode = "preview") {
  return brailleService.translate({
    table: BFU_TABLE,
    direction: "text-to-braille",
    executionMode,
    inputText,
    nativeFormatting: {
      linesPerPage: 25,
      charactersPerLine: 40,
      pageLayout: {
        printPages: false,
        braillePages: false,
        numberBraillePages: false,
        pageSeparator: false,
      },
    },
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
