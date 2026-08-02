import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

function cacheKey(sourceUrl) {
  return createHash('sha256').update(sourceUrl).digest('hex');
}

function normalizeCachedMetadata(metadata, sourceUrl) {
  return {
    sourceUrl,
    finalUrl: metadata.final_url || sourceUrl,
    contentType: metadata.content_type || 'application/pdf',
    statusCode: Number.isInteger(metadata.status_code) ? metadata.status_code : 200,
    etag: metadata.etag || '',
    lastModified: metadata.last_modified || '',
    cachedAt: metadata.cached_at || '',
  };
}

export function createPdfCache({ directory, ttlSeconds, now = () => Date.now() }) {
  if (!directory) throw new Error('PDF cache directory is required');
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('PDF cache TTL must be a positive integer');
  }

  const pending = new Map();

  function pathsFor(sourceUrl) {
    const key = cacheKey(sourceUrl);
    return {
      pdfPath: join(directory, `${key}.pdf`),
      metadataPath: join(directory, `${key}.json`),
    };
  }

  async function readFresh(sourceUrl) {
    const { pdfPath, metadataPath } = pathsFor(sourceUrl);

    try {
      const [buffer, rawMetadata] = await Promise.all([
        readFile(pdfPath),
        readFile(metadataPath, 'utf8'),
      ]);
      const metadata = JSON.parse(rawMetadata);
      const cachedTime = Date.parse(metadata.cached_at || '');
      if (!Number.isFinite(cachedTime) || now() - cachedTime > ttlSeconds * 1000) {
        return null;
      }

      return {
        buffer,
        cacheHit: true,
        ...normalizeCachedMetadata(metadata, sourceUrl),
      };
    } catch {
      return null;
    }
  }

  async function writeEntry(sourceUrl, downloaded) {
    await mkdir(directory, { recursive: true });
    const { pdfPath, metadataPath } = pathsFor(sourceUrl);
    const suffix = `${process.pid}-${randomUUID()}`;
    const temporaryPdfPath = `${pdfPath}.${suffix}.tmp`;
    const temporaryMetadataPath = `${metadataPath}.${suffix}.tmp`;
    const cachedAt = new Date(now()).toISOString();
    const metadata = {
      source_url: sourceUrl,
      final_url: downloaded.finalUrl || sourceUrl,
      content_type: downloaded.contentType || 'application/pdf',
      status_code: Number.isInteger(downloaded.statusCode) ? downloaded.statusCode : 200,
      etag: downloaded.etag || '',
      last_modified: downloaded.lastModified || '',
      cached_at: cachedAt,
      size_bytes: downloaded.buffer.length,
    };

    try {
      await writeFile(temporaryPdfPath, downloaded.buffer);
      await writeFile(temporaryMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
      await rename(temporaryPdfPath, pdfPath);
      await rename(temporaryMetadataPath, metadataPath);
    } finally {
      await Promise.all([
        rm(temporaryPdfPath, { force: true }).catch(() => {}),
        rm(temporaryMetadataPath, { force: true }).catch(() => {}),
      ]);
    }

    return {
      buffer: downloaded.buffer,
      cacheHit: false,
      ...normalizeCachedMetadata(metadata, sourceUrl),
    };
  }

  async function get(sourceUrl, downloader) {
    await mkdir(directory, { recursive: true });
    const cached = await readFresh(sourceUrl);
    if (cached) return cached;

    const key = cacheKey(sourceUrl);
    if (pending.has(key)) return pending.get(key);

    const operation = (async () => {
      const rechecked = await readFresh(sourceUrl);
      if (rechecked) return rechecked;

      const downloaded = await downloader();
      if (!Buffer.isBuffer(downloaded?.buffer)) {
        throw new TypeError('PDF downloader must return a Buffer');
      }
      return writeEntry(sourceUrl, downloaded);
    })();

    pending.set(key, operation);
    try {
      return await operation;
    } finally {
      pending.delete(key);
    }
  }

  return { get };
}
