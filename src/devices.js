// -----------------------------------------------------------------------------
// Wallabag -> Gladys device: one "Wallabag" device per user
// (`wallabag:<user id>`, the owner of the credentials), read only: unread
// articles, starred articles, articles read (archived) today, and the
// estimated reading time of the unread ones. Articles are saved and archived
// through the scene actions, never through a device feature.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPE,
  DEVICE_FEATURE_UNITS as UNIT,
} from '@gladysassistant/integration-sdk';
import { NAMES, pick } from './texts.js';

export const WALLABAG_TYPE = 'wallabag';
export const COUNTERS = ['unread', 'starred', 'read_today', 'reading_time'];

const MAX_COUNT = 10_000_000;

export const wallabagIds = (gladys, userId) => gladys.externalIds(WALLABAG_TYPE, String(userId));

const counter = (name, externalId) => ({
  name,
  external_id: externalId,
  category: CAT.COUNTER_SENSOR,
  type: TYPE.SENSOR.INTEGER,
  read_only: true,
  has_feedback: false,
  min: 0,
  max: MAX_COUNT,
  keep_history: true,
});

/**
 * @param {object} gladys
 * @param {{ id: number, name: string }} user
 * @param {string} language
 * @param {string} url Wallabag base URL (a device param, shown in Gladys)
 */
export function buildWallabagDevice(gladys, user, language, url) {
  const names = pick(NAMES, language);
  const ids = wallabagIds(gladys, user.id);
  return {
    name: 'Wallabag',
    external_id: ids.device,
    model: 'Wallabag',
    should_poll: false,
    features: [
      counter(names.unread, ids.feature('unread')),
      counter(names.starred, ids.feature('starred')),
      counter(names.read_today, ids.feature('read_today')),
      {
        name: names.reading_time,
        external_id: ids.feature('reading_time'),
        category: CAT.DURATION,
        type: TYPE.DURATION.INTEGER,
        unit: UNIT.MINUTES,
        read_only: true,
        has_feedback: false,
        min: 0,
        max: MAX_COUNT,
        keep_history: true,
      },
    ],
    params: [
      { name: 'WALLABAG_URL', value: url },
      { name: 'WALLABAG_USER', value: user.name.slice(0, 100) },
    ],
  };
}

/** @param {{ unread: number, starred: number, read_today: number, reading_time: number }} counters */
export function buildWallabagStates(gladys, userId, counters) {
  const ids = wallabagIds(gladys, userId);
  return COUNTERS.map((key) => ({
    device_feature_external_id: ids.feature(key),
    state: counters[key],
  }));
}

/** `ext:...:wallabag:<user>` -> the user id; null when not ours. */
export function parseExternalId(gladys, externalId) {
  if (typeof externalId !== 'string') {
    return null;
  }
  const prefix = gladys.externalId(`${WALLABAG_TYPE}:`);
  if (!externalId.startsWith(prefix)) {
    return null;
  }
  const id = externalId.slice(prefix.length).split(':')[0];
  const user = Number(id);
  return id !== '' && Number.isInteger(user) ? user : null;
}
