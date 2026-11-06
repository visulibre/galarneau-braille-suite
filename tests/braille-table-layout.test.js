const assert = require("node:assert/strict");
const test = require("node:test");
const brailleTableLayout = require("../src/renderer/braille-table-layout");

test("calculates each table column width from its longest cell", () => {
  assert.deepEqual(
    brailleTableLayout.getColumnWidths([
      ["Titre", "B"],
      ["A", "contenu"],
      ["", "  "],
    ]),
    [5, 7],
  );
});

test("keeps at least one display cell for empty columns", () => {
  assert.deepEqual(brailleTableLayout.getColumnWidths([["", "x"], ["", ""]]), [1, 1]);
});

test("ignores trailing layout spaces when computing column widths", () => {
  assert.deepEqual(
    brailleTableLayout.getColumnWidths([
      ["abc   ", "x"],
      ["a", "xy"],
    ]),
    [3, 2],
  );
});
