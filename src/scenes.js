// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`): save an address with tags,
// archive (mark as read) an article, and read the newest unread titles to
// send them in a message or speak them.
// -----------------------------------------------------------------------------

// The text output of "Read the unread titles": one line per article.
export const lines = (entries) =>
  entries.map((entry) => (entry.domain ? `${entry.title} — ${entry.domain}` : entry.title));

export const SCENE_ACTIONS = {
  async save_url(hub, { fields = {} }) {
    const { entry, already } = await hub.saveUrl(fields.url, fields.tags);
    return {
      entry_id: entry.id,
      title: entry.title,
      domain: entry.domain,
      reading_time: entry.readingTime,
      already_saved: already,
    };
  },
  async archive_entry(hub, { fields = {} }) {
    const entry = await hub.archiveEntry(fields.entry);
    return { entry_id: entry.id, title: entry.title };
  },
  async read_unread(hub, { fields = {} }) {
    const { entries, total } = await hub.readUnread({ count: fields.count, tag: fields.tag });
    return {
      count: entries.length,
      unread: total,
      titles: lines(entries).join('\n').slice(0, 10_000),
      reading_time: entries.reduce((sum, e) => sum + e.readingTime, 0),
      latest_title: entries[0]?.title ?? '',
      latest_url: entries[0]?.url ?? '',
      latest_id: entries[0]?.id ?? 0,
    };
  },
};
