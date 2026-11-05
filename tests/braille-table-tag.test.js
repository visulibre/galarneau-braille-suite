const assert = require("node:assert/strict");
const test = require("node:test");
const brailleTableTag = require("../src/renderer/braille-table-tag");

test("parses a table tag with a header row", () => {
  assert.deepEqual(brailleTableTag.parse("<tableau c=3 r=4 e>"), {
    valid: true,
    columnCount: 3,
    rowCount: 4,
    includeHeaderRow: true,
  });
});

test("parses a table tag without a header row when e is absent", () => {
  assert.deepEqual(brailleTableTag.parse("<tableau c=2 r=5>"), {
    valid: true,
    columnCount: 2,
    rowCount: 5,
    includeHeaderRow: false,
  });
});

test("rejects table dimensions outside supported bounds", () => {
  assert.match(brailleTableTag.parse("<tableau c=33 r=4>")?.error ?? "", /colonnes/u);
  assert.match(brailleTableTag.parse("<tableau c=3 r=201>")?.error ?? "", /rangées/u);
});

test("reports malformed table tags and ignores unrelated text", () => {
  assert.equal(brailleTableTag.parse("texte courant"), null);
  assert.equal(brailleTableTag.parse("<tableau c=3>")?.valid, false);
});
