# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-22

### Added

- Wallabag in Gladys, over its REST API and OAuth2 (an API client and your
  login, tokens renewed on their own): a **Wallabag** device with the unread
  articles, the starred articles, the articles read today and the reading time
  of the unread ones.
- **New article** and **Article archived** scene triggers, filtered by site,
  with the title, link, site, tags, reading time and article id.
- Scene actions: save a link with tags, mark an article as read (by id or
  address), read the newest unread titles for a message.
- **Wallabag** dashboard widget: unread count, reading time, articles read
  today, newest unread articles, for every tag or one, and a Refresh button.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-wallabag/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-wallabag/releases/tag/v1.0.0
