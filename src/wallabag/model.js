// -----------------------------------------------------------------------------
// Wallabag answers -> the small, bounded objects the rest of the code uses.
// Pure functions. Nothing here keeps the content of an article.
// -----------------------------------------------------------------------------

const str = (value, max = 1000) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** A text with its web addresses cut to scheme, host and path (a query may hold a token). */
export const scrubUrls = (text) =>
  text.replace(/\bhttps?:\/\/[^\s"'<>]+/gi, (url) => siteOf(url.replace(/[).,;:]+$/, '')) || 'URL');

/** The address of a page without query string nor fragment. */
export function siteOf(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '';
    }
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.slice(0, 1000);
  } catch {
    return '';
  }
}

/** Wallabag dates: `2026-10-22T00:41:45+0000`. Milliseconds, or null. */
export function timeOf(value) {
  if (typeof value !== 'string' || value === '') {
    return null;
  }
  const ms = Date.parse(value.replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
  return Number.isFinite(ms) ? ms : null;
}

/** Wallabag answers 0/1 in JSON (and true/false in some versions). */
const flag = (value) => value === 1 || value === true || value === '1';

/**
 * @param {object} raw an entry of `GET /api/entries.json` (or of a POST/PATCH)
 */
export function summarizeEntry(raw) {
  const url = /^https?:\/\//i.test(raw?.url ?? '') ? str(raw.url, 2000) : '';
  let domain = str(raw?.domain_name, 200);
  if (!domain && url) {
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = '';
    }
  }
  const minutes = Number(raw?.reading_time);
  return {
    id: raw.id,
    title: str(raw.title) || url || '…',
    url,
    domain,
    tags: (Array.isArray(raw.tags) ? raw.tags : [])
      .map((tag) => str(tag?.label, 100))
      .filter(Boolean),
    readingTime: Number.isInteger(minutes) && minutes > 0 ? minutes : 0,
    archived: flag(raw.is_archived),
    starred: flag(raw.is_starred),
    createdAt: timeOf(raw.created_at),
    archivedAt: timeOf(raw.archived_at),
  };
}

/**
 * The article a scene designates: its id (a number, "12", the entry id of a
 * trigger) or its address. Null when it is neither.
 * @returns {{ id: number } | { url: string } | null}
 */
export function parseEntryRef(raw) {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (/^\d+$/.test(text)) {
    const id = Number(text);
    return Number.isSafeInteger(id) && id > 0 ? { id } : null;
  }
  const url = parseUrl(text);
  return url ? { url } : null;
}

/** An http(s) address to save, or null (Wallabag itself saves any text). */
export function parseUrl(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text === '' || text.length > 2000) {
    return null;
  }
  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname !== '' ? url.href : null;
  } catch {
    return null;
  }
}

/** "cuisine, à lire ;later" -> 'cuisine,à lire,later' (Wallabag's comma list). */
export function parseTags(raw) {
  if (typeof raw !== 'string') {
    return '';
  }
  const seen = new Set();
  const tags = [];
  for (const part of raw.split(/[,;\n]/)) {
    const tag = part.trim().slice(0, 100);
    if (tag !== '' && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      tags.push(tag);
    }
  }
  return tags.slice(0, 20).join(',');
}

/** 135 -> "2 h 15", 40 -> "40 min" (a widget tile holds 12 characters). */
export function formatMinutes(minutes) {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
}
