const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

function loadDocxExtractor() {
  const filePath = path.resolve(__dirname, "../src/main/gbs-document-service.js");
  const source =
    fs.readFileSync(filePath, "utf8") +
    "\nmodule.exports.__test_extractDocxTextFromXml = extractDocxTextFromXml;\n" +
    "module.exports.__test_buildImportedDocumentFromText = buildImportedDocumentFromText;\n" +
    "module.exports.__test_extractDocxDeclaredPageCountFromAppXml = extractDocxDeclaredPageCountFromAppXml;\n";

  const mod = new Module(filePath, module);
  mod.filename = filePath;
  mod.paths = Module._nodeModulePaths(path.dirname(filePath));
  mod._compile(source, filePath);

  return {
    extractDocxTextFromXml: mod.exports.__test_extractDocxTextFromXml,
    buildImportedDocumentFromText: mod.exports.__test_buildImportedDocumentFromText,
    extractDocxDeclaredPageCountFromAppXml:
      mod.exports.__test_extractDocxDeclaredPageCountFromAppXml,
  };
}

function buildDocxParagraphXml(runXmlByParagraph) {
  const paragraphs = runXmlByParagraph
    .map((runs) => `<w:p>${runs.join("")}</w:p>`)
    .join("");
  return `<w:document><w:body>${paragraphs}</w:body></w:document>`;
}

const IMPORT_CENTERED_LINE_MARKER = "\u0001GBS_CENTERED_LINE\u0001";

test("docx import merges adjacent runs that share the same style", () => {
  const { extractDocxTextFromXml } = loadDocxExtractor();
  const xmlContent = buildDocxParagraphXml([
    [
      "<w:r><w:rPr><w:b/></w:rPr><w:t>meme</w:t></w:r>",
      "<w:r><w:rPr><w:b/></w:rPr><w:t>mot</w:t></w:r>",
      "<w:r><w:t> normal</w:t></w:r>",
    ],
  ]);

  const outputText = extractDocxTextFromXml(xmlContent);

  assert.equal(outputText, "<b>mememot</b> normal");
  assert.equal(outputText.includes("</b><b>"), false);
});

test("docx import keeps style transitions without redundant duplicate tags", () => {
  const { extractDocxTextFromXml } = loadDocxExtractor();
  const xmlContent = buildDocxParagraphXml([
    [
      "<w:r><w:rPr><w:b/></w:rPr><w:t>debut</w:t></w:r>",
      "<w:r><w:t> milieu </w:t></w:r>",
      "<w:r><w:rPr><w:b/></w:rPr><w:t>fin</w:t></w:r>",
    ],
  ]);

  const outputText = extractDocxTextFromXml(xmlContent);

  assert.equal(outputText, "<b>debut</b> milieu <b>fin</b>");
  assert.equal(outputText.includes("</b><b>"), false);
});

test("docx import centers short heading lines fully bold and ending with a colon", () => {
  const { extractDocxTextFromXml } = loadDocxExtractor();
  const xmlContent = buildDocxParagraphXml([
    [
      "<w:r><w:rPr><w:b/></w:rPr><w:t>Objectif principal :</w:t></w:r>",
    ],
    [
      "<w:r><w:t>Texte courant.</w:t></w:r>",
    ],
  ]);

  const outputText = extractDocxTextFromXml(xmlContent);
  const outputLines = outputText.split("\n");

  assert.equal(outputLines.length, 2);
  assert.equal(
    outputLines[0],
    `${IMPORT_CENTERED_LINE_MARKER}<b>Objectif principal :</b>`,
  );
  assert.equal(outputLines[1], "Texte courant.");
});

test("docx import does not center heading-like text when paragraph is mixed bold and normal", () => {
  const { extractDocxTextFromXml } = loadDocxExtractor();
  const xmlContent = buildDocxParagraphXml([
    [
      "<w:r><w:rPr><w:b/></w:rPr><w:t>Objectif :</w:t></w:r>",
      "<w:r><w:t> details</w:t></w:r>",
    ],
  ]);

  const outputText = extractDocxTextFromXml(xmlContent);

  assert.equal(outputText, "<b>Objectif :</b> details");
  assert.equal(outputText.startsWith(IMPORT_CENTERED_LINE_MARKER), false);
});

test("docx import preserves explicit page breaks and maps them to forced page break markers", () => {
  const { extractDocxTextFromXml, buildImportedDocumentFromText } = loadDocxExtractor();
  const xmlContent = buildDocxParagraphXml([
    [
      "<w:r><w:t>Page un</w:t></w:r>",
      "<w:r><w:br w:type=\"page\"/></w:r>",
      "<w:r><w:t>Suite page deux</w:t></w:r>",
    ],
    [
      "<w:r><w:t>Ligne suivante</w:t></w:r>",
    ],
  ]);

  const extractedText = extractDocxTextFromXml(xmlContent);
  assert.equal(extractedText.includes("\f"), true);

  const importedDocument = buildImportedDocumentFromText(extractedText, {
    table: "fr-bfu-g2.ctb",
    tableLabel: "Francais BFU grade 2",
    linesPerPage: 25,
    charactersPerLine: 40,
    pageLayout: {
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
    },
  });

  const importedLines = importedDocument.pages[0].filter((line) => line.length > 0);
  assert.deepEqual(importedLines, [
    "Page un",
    "[[GBS_PAGE_BREAK]]",
    "Suite page deux",
    "Ligne suivante",
  ]);
});

test("docx import reads declared page count from Word app metadata", () => {
  const { extractDocxDeclaredPageCountFromAppXml } = loadDocxExtractor();
  const appXmlContent =
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
    "<Properties><Pages>12</Pages></Properties>";

  assert.equal(extractDocxDeclaredPageCountFromAppXml(appXmlContent), 12);
  assert.equal(extractDocxDeclaredPageCountFromAppXml("<Properties></Properties>"), null);
});

test("docx import exposes page end marker line numbers for explicit page breaks", () => {
  const { buildImportedDocumentFromText } = loadDocxExtractor();
  const importMetadata = {};

  buildImportedDocumentFromText(
    "Premiere page\fDeuxieme page\fTroisieme page",
    {
      table: "fr-bfu-g2.ctb",
      tableLabel: "Francais BFU grade 2",
      linesPerPage: 25,
      charactersPerLine: 40,
      pageLayout: {
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
      },
    },
    importMetadata,
  );

  assert.equal(importMetadata.forcedPageBreakCount, 2);
  assert.deepEqual(importMetadata.forcedPageBreakLineNumbers, [2, 4]);
});
