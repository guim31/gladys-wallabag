# Wallabag for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) external integration for
[Wallabag](https://wallabag.org), the open-source read-it-later application:
unread articles and their reading time, a trigger when an article is saved or
read, links saved from scenes, and the newest unread articles on the dashboard.

Tested against a real Wallabag 2.6.14 (the official Docker image); not yet on a
real Gladys installation: feedback welcome.

## Features

- **Device**: a **Wallabag** device with the unread articles, the starred
  articles, the articles read (archived) today and the estimated reading time
  of the unread ones, with history.
- **Scene triggers**: _New article_ and _Article archived_ (filter: site;
  title, link, site, tags, reading time, starred and article id passed on).
- **Scene actions**: save a link with tags, mark an article as read (by id,
  e.g. the one of a trigger, or by address), read the newest unread titles
  (for a message).
- **Dashboard widget**: unread count, reading time, articles read today, the
  six newest unread articles with links, a _Refresh_ button; for every tag or
  one.
- English, French, German and Spanish.

### Compared with Linkwarden and Karakeep

[gladys-linkwarden](https://github.com/guim31/gladys-linkwarden) and
[gladys-karakeep](https://github.com/guim31/gladys-karakeep) follow
**bookmark managers**: links you keep and organize for good, in collections or
lists. Wallabag is a **read-it-later** app: it fetches the article itself, you
read it in Wallabag, then archive it. So this integration counts what is left
to read and how long it takes, and tells when an article is read; use the
others to file links, this one to empty a reading list.

## Requirements

- Gladys Assistant 5.1 or later.
- Wallabag 2, self-hosted or the hosted [wallabag.it](https://wallabag.it),
  reachable from the Gladys machine.
- An API client (Wallabag → API clients management → Create a new client) and
  your Wallabag username and password: the Wallabag API logs in with OAuth2's
  password grant.

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-wallabag`.
2. In the **Configuration** tab, enter the address of Wallabag (for example
   `192.168.1.50:8080` or `https://app.wallabag.it`), the client ID and secret,
   your username and password, then **Test the connection**.
3. Add the **Wallabag** device from the **Discovery** tab.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

Wallabag pushes nothing: the container reads it every 5 minutes by default (1
to 60) with a few requests of its REST API, without the content of the
articles (`detail=metadata`): the unread articles (100 per page, 20 pages at
most), the starred count, the articles archived most recently, and the
articles saved most recently. The OAuth2 access token (one hour) is renewed
with the refresh token, and a new login happens only when that one expires
too. The device is published with `should_poll: false`; only changed states
are sent to Gladys. What the triggers already saw is kept in
`/data/wallabag-state.json`, so a restart announces nothing twice.

## Limitations

- One Wallabag user, the owner of the login.
- The triggers fire at the next read, not instantly; at most ten articles of
  each kind per read; nothing at the first read.
- The trigger filter is the site only: a filter compares one exact value, and
  an article has several tags (they are passed on as a variable).
- Annotations, the article content and the starred flag are not managed from
  Gladys.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and a fake Wallabag answering with
bodies recorded on a real Wallabag 2.6.14 (`test/fixtures/wallabag/`).

## Credits

- [Wallabag](https://github.com/wallabag/wallabag), by Nicolas Lœuillet,
  Jérémy Benoist and contributors (MIT): this integration only talks to its
  REST API and contains none of its code.
- The cover shows the Wallabag logo by Maylis Agniel, from the
  [wallabag/logo](https://github.com/wallabag/logo) repository, under the
  [Free Art License 1.3](https://artlibre.org/licence/lal/en/).
- The devices, triggers and widget follow those of
  [gladys-miniflux](https://github.com/guim31/gladys-miniflux).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by the Wallabag
project.

## License

Apache-2.0, see [LICENSE](LICENSE).
