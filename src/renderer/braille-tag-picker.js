(function exposeBrailleTagPicker(root, createApi) {
  const api = createApi();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  root.GbsBrailleTagPicker = api;
})(globalThis, function createBrailleTagPickerApi() {
  const NORMAL_DOCUMENT_TAGS = Object.freeze([
    { value: "<h1>", label: "Titre niveau 1", kind: "paired", closeTag: "</h1>" },
    { value: "<h2>", label: "Titre niveau 2", kind: "paired", closeTag: "</h2>" },
    { value: "<p>", label: "Paragraphe", kind: "paired", closeTag: "</p>" },
    { value: "<b>", label: "Gras", kind: "paired", closeTag: "</b>" },
    { value: "<i>", label: "Italique", kind: "paired", closeTag: "</i>" },
    { value: "<u>", label: "Surlignage BFU", kind: "paired", closeTag: "</u>" },
    { value: "<anc>", label: "Encadré de ligne", kind: "marker" },
    { value: "<anc#>", label: "Encadré de largeur définie", kind: "number", min: 1, max: 120 },
    { value: "<par>", label: "Retrait de paragraphe", kind: "marker" },
    { value: "</par>", label: "Fin du retrait de paragraphe", kind: "marker" },
    { value: "<cb#>", label: "Début de bloc de colonne", kind: "number", min: 0, max: 120 },
    { value: "<cb>", label: "Fin de bloc de colonne", kind: "marker" },
    { value: "</cb>", label: "Fin de bloc de colonne", kind: "marker" },
  ]);
  const BRAILLE_DOCUMENT_TAGS = Object.freeze([
    {
      value: "<tableau>",
      label: "Tableau braille",
      kind: "table",
      minColumns: 1,
      maxColumns: 32,
      minRows: 1,
      maxRows: 200,
    },
  ]);

  function getOptions(documentType) {
    return documentType === "braille" ? BRAILLE_DOCUMENT_TAGS : NORMAL_DOCUMENT_TAGS;
  }

  function createInsertion(tagOption, selectedText) {
    if (!tagOption || typeof tagOption.value !== "string") {
      throw new TypeError("Une balise valide est requise.");
    }

    const text = typeof selectedText === "string" ? selectedText : "";
    if (tagOption.kind === "paired") {
      const closeTag =
        typeof tagOption.closeTag === "string" ? tagOption.closeTag : `</${tagOption.value.slice(1, -1)}>`;
      const value = `${tagOption.value}${text}${closeTag}`;
      return {
        value,
        selectionStart: tagOption.value.length,
        selectionEnd: tagOption.value.length + text.length,
      };
    }

    const value = `${tagOption.value}${text}`;
    const caretPosition = tagOption.value.length;
    return {
      value,
      selectionStart: caretPosition,
      selectionEnd: caretPosition,
    };
  }

  function formatParameterizedTag(tagOption, parameter) {
    if (!tagOption || tagOption.kind !== "number") {
      throw new TypeError("Une balise numérique valide est requise.");
    }

    if (typeof parameter === "string" && parameter.trim().length === 0) {
      return null;
    }

    const parsedParameter = Number(parameter);
    if (
      !Number.isInteger(parsedParameter) ||
      parsedParameter < tagOption.min ||
      parsedParameter > tagOption.max
    ) {
      return null;
    }

    return tagOption.value.replace("#", String(parsedParameter));
  }

  return Object.freeze({ getOptions, createInsertion, formatParameterizedTag });
});
