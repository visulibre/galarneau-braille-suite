(function exposeBrailleTableLayout(root, createApi) {
  const api = createApi();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  root.GbsBrailleTableLayout = api;
})(globalThis, function createBrailleTableLayoutApi() {
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

  return Object.freeze({ getColumnWidths });
});
