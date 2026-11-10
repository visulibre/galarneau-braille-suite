const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const BRAILLE_TABLE_DELIMITER_CHARACTER = String.fromCodePoint(0x283f); // dots 1-2-3-4-5-6

function loadSpreadsheetTableHelpers() {
  const filePath = path.resolve(__dirname, "../src/main/gbs-document-service.js");
  const source =
    fs.readFileSync(filePath, "utf8") +
    "\nmodule.exports.__test_buildBrailleTableLinesFromRows = buildBrailleTableLinesFromRows;\n";

  const mod = new Module(filePath, module);
  mod.filename = filePath;
  mod.paths = Module._nodeModulePaths(path.dirname(filePath));
  mod._compile(source, filePath);

  return {
    buildBrailleTableLinesFromRows: mod.exports.__test_buildBrailleTableLinesFromRows,
  };
}

test("spreadsheet tables close on the configured last character", () => {
  const { buildBrailleTableLinesFromRows } = loadSpreadsheetTableHelpers();
  [29, 40].forEach((targetLineLength) => {
    const tableLines = buildBrailleTableLinesFromRows(
      [
        ["Nom", "Age"],
        ["Ana", "30"],
      ],
      targetLineLength,
    );

    assert.equal(tableLines.length, 5);
    tableLines.forEach((lineValue) => {
      assert.equal(lineValue.length, targetLineLength);
      assert.equal(lineValue[0], BRAILLE_TABLE_DELIMITER_CHARACTER);
      assert.equal(
        lineValue[targetLineLength - 1],
        BRAILLE_TABLE_DELIMITER_CHARACTER,
      );
    });

    const contentLine = tableLines[1];
    const delimiterCount = Array.from(contentLine).filter(
      (character) => character === BRAILLE_TABLE_DELIMITER_CHARACTER,
    ).length;
    assert.equal(delimiterCount, 3);
  });
});

test("spreadsheet tables keep content width when narrower than data", () => {
  const { buildBrailleTableLinesFromRows } = loadSpreadsheetTableHelpers();
  const tableLines = buildBrailleTableLinesFromRows(
    [["colonne tres longue", "encore plus longue"]],
    12,
  );

  assert.ok(tableLines.length >= 3);
  assert.ok(tableLines[0].length > 12);
  assert.ok(tableLines[1].length > 12);
  assert.ok(tableLines[2].length > 12);
});
