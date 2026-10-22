// -----------------------------------------------------------------------------
// The "Wallabag" dashboard widget: the unread count, their reading time, the
// articles read today, the newest unread articles (each opens the article or
// Wallabag) and a "Refresh" button. Set to a tag, the widget shows the unread
// articles of that tag only.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { CommandError, WIDGET_KEY } from './hub.js';
import { formatMinutes } from './wallabag/model.js';
import { DONE_TEXT, each, pick } from './texts.js';

export const MAX_ITEMS = 6;
export const ACTIONS = { refresh: 'refresh' };

export const TEXT = {
  unread: { en: 'Unread', fr: 'Non lus', de: 'Ungelesen', es: 'Sin leer' },
  reading: { en: 'To read', fr: 'À lire', de: 'Zu lesen', es: 'Por leer' },
  today: { en: 'Read today', fr: "Lus aujourd'hui", de: 'Heute gelesen', es: 'Leídos hoy' },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  open: {
    en: 'Read the article',
    fr: "Lire l'article",
    de: 'Artikel lesen',
    es: 'Leer el artículo',
  },
  open_wallabag: {
    en: 'Open in Wallabag',
    fr: 'Ouvrir dans Wallabag',
    de: 'In Wallabag öffnen',
    es: 'Abrir en Wallabag',
  },
  starred: { en: 'Starred', fr: 'Favori', de: 'Favorit', es: 'Favorito' },
  empty: {
    en: 'Nothing left to read.',
    fr: 'Plus rien à lire.',
    de: 'Nichts mehr zu lesen.',
    es: 'No queda nada por leer.',
  },
  unavailable: {
    en: 'Wallabag does not answer right now.',
    fr: 'Wallabag ne répond pas pour le moment.',
    de: 'Wallabag antwortet gerade nicht.',
    es: 'Wallabag no responde en este momento.',
  },
  waiting: {
    en: 'Waiting for Wallabag: check the configuration of the integration.',
    fr: "En attente de Wallabag : vérifiez la configuration de l'intégration.",
    de: 'Warte auf Wallabag: Prüfe die Konfiguration der Integration.',
    es: 'Esperando a Wallabag: compruebe la configuración de la integración.',
  },
};

const cut = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);
const https = (url) => typeof url === 'string' && /^https:\/\//i.test(url) && url.length <= 2000;

/** One row of the list. */
export function entryItem(entry, language, baseUrl) {
  const item = {
    title: cut(entry.title, 60),
    subtitle: cut(
      [entry.domain, entry.readingTime > 0 ? formatMinutes(entry.readingTime) : '']
        .filter(Boolean)
        .join(' · '),
      60,
    ),
  };
  if (entry.starred) {
    item.badge = { text: pick(TEXT.starred, language), color: WIDGET_COLORS.WARNING };
  }
  if (entry.tags.length > 0) {
    item.description = cut(entry.tags.map((tag) => `#${tag}`).join(' '), 600);
  }
  const links = [];
  // The links of a card must be https: an http article or Wallabag is left out.
  if (https(entry.url)) {
    links.push({ url: entry.url, label: pick(TEXT.open, language) });
  }
  if (https(baseUrl) && entry.id) {
    links.push({ url: `${baseUrl}/view/${entry.id}`, label: pick(TEXT.open_wallabag, language) });
  }
  if (links.length > 0) {
    item.links = links;
  }
  return item;
}

export async function buildContent(hub, { language = 'en', settings = {} } = {}) {
  if (!hub.loaded) {
    return {
      ttl_seconds: 60,
      components: [{ type: 'text', variant: 'body', text: pick(TEXT.waiting, language) }],
    };
  }
  const tag = typeof settings?.tag === 'string' ? settings.tag.trim().slice(0, 100) : '';
  const list = await hub.widgetEntries(tag, MAX_ITEMS);
  const components = [
    {
      type: 'value',
      label: tag ? cut(`#${tag}`, 24) : pick(TEXT.unread, language),
      value: list ? list.total : hub.counters.unread,
      icon: 'bookmark',
    },
  ];
  if (!tag) {
    components.push(
      {
        type: 'value',
        label: pick(TEXT.reading, language),
        value: formatMinutes(hub.counters.reading_time),
        icon: 'clock',
      },
      {
        type: 'value',
        label: pick(TEXT.today, language),
        value: hub.counters.read_today,
        icon: 'check-circle',
        color: hub.counters.read_today > 0 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
      },
    );
  }
  if (list === null) {
    components.push({ type: 'text', variant: 'caption', text: pick(TEXT.unavailable, language) });
  } else if (list.entries.length === 0) {
    components.push({ type: 'text', variant: 'caption', text: pick(TEXT.empty, language) });
  } else {
    components.push({
      type: 'card-list',
      display: 'list',
      items: list.entries.map((e) => entryItem(e, language, hub.config.url ?? '')),
    });
  }
  components.push({
    type: 'button',
    label: pick(TEXT.refresh, language),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: ACTIONS.refresh },
  });
  // The hub nudges the widget after every read and every change.
  return { ttl_seconds: 300, components };
}

async function action(hub, { actionKey }) {
  const language = hub.language;
  if (actionKey === ACTIONS.refresh) {
    await hub.refresh();
    if (hub.failure !== null || !hub.loaded) {
      const error = new CommandError('unreachable', language);
      throw new Error(pick(error.messages, language), { cause: error });
    }
    return { message: each(DONE_TEXT, 'refresh') };
  }
  throw new Error(`Unknown action ${actionKey}`);
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    get: (hub, request) => buildContent(hub, request),
    action,
  },
};
