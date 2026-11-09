const assert = require("node:assert/strict");
const test = require("node:test");
const brailleTagPicker = require("../src/renderer/braille-tag-picker");

test("provides document-specific supported tags", () => {
  assert.ok(brailleTagPicker.getOptions("normal").some((option) => option.value === "<h1>"));
  assert.deepEqual(
    brailleTagPicker.getOptions("braille").map((option) => option.value),
    ["<tableau>"],
  );
});

test("wraps selected text and positions the selection inside the tag", () => {
  const boldTag = brailleTagPicker.getOptions("normal").find((option) => option.value === "<b>");

  assert.deepEqual(brailleTagPicker.createInsertion(boldTag, "mot"), {
    value: "<b>mot</b>",
    selectionStart: 3,
    selectionEnd: 6,
  });
});

test("inserts marker tags before the selected text", () => {
  const frameTag = brailleTagPicker.getOptions("normal").find((option) => option.value === "<anc>");

  assert.deepEqual(brailleTagPicker.createInsertion(frameTag, "texte"), {
    value: "<anc>texte",
    selectionStart: 5,
    selectionEnd: 5,
  });
});

test("formats bounded numeric tag parameters", () => {
  const offsetTag = brailleTagPicker.getOptions("normal").find((option) => option.value === "<cb#>");

  assert.equal(brailleTagPicker.formatParameterizedTag(offsetTag, "12"), "<cb12>");
  assert.equal(brailleTagPicker.formatParameterizedTag(offsetTag, ""), null);
  assert.equal(brailleTagPicker.formatParameterizedTag(offsetTag, "121"), null);
});
