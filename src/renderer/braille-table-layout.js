(function exposeBrailleTableLayout(root, createApi) {
  const api = createApi();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  root.GbsBrailleTableLayout = api;
})(globalThis, function createBrailleTableLayoutApi() {
  function normalizeColumnWidths(columnWidths) {
    if (!Array.isArray(columnWidths)) {
      return [];
    }

    return columnWidths.map((columnWidth) =>
      Number.isInteger(columnWidth) ? Math.max(1, columnWidth) : 1,
    );
  }

  function getColumnWidths(contentRows) {
    const columnCount = contentRows.reduce(
      (maxColumns, rowCells) => Math.max(maxColumns, Array.isArray(rowCells) ? rowCells.length : 0),
      0,
    );
    const columnWidths = new Array(columnCount).fill(1);

    contentRows.forEach((rowCells) => {
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        const cellValue = rowCells[columnIndex];
        const visibleCellLength =
          typeof cellValue === "string"
            ? cellValue.replace(/\s+$/u, "").length
            : 0;
        columnWidths[columnIndex] = Math.max(
          columnWidths[columnIndex],
          visibleCellLength,
        );
      }
    });

    return columnWidths;
  }

  function fitColumnWidthsToLineLength(columnWidths, targetLineLength) {
    const safeColumnWidths = normalizeColumnWidths(columnWidths);
    if (safeColumnWidths.length === 0) {
      return [];
    }

    if (!Number.isInteger(targetLineLength)) {
      return safeColumnWidths;
    }

    const minimumLineLength = safeColumnWidths.length + 1;
    if (targetLineLength < minimumLineLength) {
      return safeColumnWidths;
    }

    const availableContentWidth = targetLineLength - minimumLineLength;
    const currentContentWidth = safeColumnWidths.reduce(
      (totalWidth, columnWidth) => totalWidth + columnWidth,
      0,
    );
    if (currentContentWidth >= availableContentWidth) {
      return safeColumnWidths;
    }

    const expandedColumnWidths = safeColumnWidths.slice();
    let remainingWidth = availableContentWidth - currentContentWidth;
    let columnIndex = 0;

    while (remainingWidth > 0) {
      expandedColumnWidths[columnIndex] += 1;
      columnIndex = (columnIndex + 1) % expandedColumnWidths.length;
      remainingWidth -= 1;
    }

    return expandedColumnWidths;
  }

  function resolveColumnWidths(contentRows, targetLineLength = null) {
    const baseColumnWidths = getColumnWidths(contentRows);
    return fitColumnWidthsToLineLength(baseColumnWidths, targetLineLength);
  }

  return Object.freeze({
    getColumnWidths,
    fitColumnWidthsToLineLength,
    resolveColumnWidths,
  });
});
