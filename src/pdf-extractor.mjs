async function withPdfParser(buffer, callback) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    return await callback(parser);
  } finally {
    await parser.destroy();
  }
}

async function parseFullPdfDocument(buffer) {
  return withPdfParser(buffer, async (parser) => {
    const result = await parser.getRaw();
    return {
      text: result.text || '',
      numpages: Number.isInteger(result.numpages)
        ? result.numpages
        : (Number.isInteger(result.total) ? result.total : 0),
    };
  });
}

export async function parseSelectedPdfPages(buffer, pages) {
  return withPdfParser(buffer, async (parser) => {
    const result = await parser.getText({ partial: pages });
    const totalPages = Number.isInteger(result.total) ? result.total : 0;
    const invalidPages = pages.filter((pageNumber) => pageNumber > totalPages);

    if (invalidPages.length > 0) {
      const error = new RangeError(
        `Requested page ${invalidPages.join(', ')} is out of range; PDF has ${totalPages} pages`,
      );
      error.totalPages = totalPages;
      error.requestedPages = pages;
      error.extractedPages = [];
      error.invalidPages = invalidPages;
      throw error;
    }

    return {
      text: result.text || '',
      totalPages,
      extractedPages: pages,
    };
  });
}

export async function extractPdfContent({
  buffer,
  pages,
  maxChars,
  fullDocumentParser = parseFullPdfDocument,
  selectedPagesParser = parseSelectedPdfPages,
}) {
  if (pages === null || pages === undefined) {
    const data = await fullDocumentParser(buffer);
    return {
      text: (data.text || '').trim().slice(0, maxChars),
      totalPages: Number.isInteger(data.numpages) ? data.numpages : 0,
      requestedPages: null,
      extractedPages: 'all',
      extractionMode: 'full_document',
    };
  }

  const data = await selectedPagesParser(buffer, pages);
  return {
    text: (data.text || '').trim().slice(0, maxChars),
    totalPages: data.totalPages,
    requestedPages: pages,
    extractedPages: data.extractedPages,
    extractionMode: 'selected_pages',
  };
}
