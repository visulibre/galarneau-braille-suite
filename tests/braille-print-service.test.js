const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createBrfBuffer,
  ensureBrfExtension,
} = require("../src/main/braille-print-service");

test("converts all 64 six-dot Unicode Braille cells to unique BRF characters", () => {
  const brailleCells = Array.from({ length: 64 }, (_value, dotMask) =>
    String.fromCodePoint(0x2800 + dotMask),
  ).join("");
  const brfCharacters = createBrfBuffer({ pages: [[brailleCells]] }).toString("ascii");

  assert.equal(brfCharacters.length, 64);
  assert.equal(new Set(brfCharacters).size, 64);
  assert.equal(brfCharacters[0], " ");
});

test("preserves BRF ASCII and encodes line and page breaks", () => {
  const brf = createBrfBuffer({
    pages: [
      ["ABC", "DEF"],
      ["GHI"],
    ],
  });

  assert.deepEqual(brf, Buffer.from("ABC\r\nDEF\fGHI", "ascii"));
});

test("rejects eight-dot Braille cells instead of dropping dots", () => {
  assert.throws(
    () => createBrfBuffer({ pages: [[String.fromCodePoint(0x2840)]] }),
    /point 7 ou 8/u,
  );
});

test("rejects characters that are not representable in BRF", () => {
  assert.throws(
    () => createBrfBuffer({ pages: [["é"]] }),
    /n'est pas représentable/u,
  );
});

test("enforces the .brf extension on exported paths", () => {
  assert.equal(ensureBrfExtension("document"), "document.brf");
  assert.equal(ensureBrfExtension("document.brf"), "document.brf");
  assert.equal(ensureBrfExtension("document.gnb"), "document.brf");
});
