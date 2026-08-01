export function normalizeContentType(value) {
  if (typeof value !== 'string') return '';
  return value.split(';', 1)[0].trim().toLowerCase();
}

export function createMetadata({
  source,
  finalUrl = source,
  title = '',
  contentType = '',
  statusCode = null,
  browserRendered,
  type,
  error,
}) {
  const metadata = {
    source,
    final_url: finalUrl || source,
    title: title || '',
    content_type: normalizeContentType(contentType),
    status_code: Number.isInteger(statusCode) ? statusCode : null,
    browser_rendered: Boolean(browserRendered),
  };

  if (type) metadata.type = type;
  if (error) metadata.error = error;

  return metadata;
}
