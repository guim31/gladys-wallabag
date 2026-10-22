# Wallabag

Connect Gladys to [Wallabag](https://wallabag.org), the open-source
read-it-later application: follow your unread articles and their reading time,
react when an article is saved or read, save a link from a scene, and show the
newest unread articles on the dashboard.

Tested with a real Wallabag 2.6.14 (the official Docker image). Feedback is
welcome on the Gladys forum.

## Requirements

- Gladys Assistant 5.1 or later.
- Wallabag 2, self-hosted or the hosted service
  [wallabag.it](https://wallabag.it), reachable from the Gladys machine.
- An API client: in Wallabag, open **API clients management → Create a new
  client** (a name is enough), then note its **Client ID** and **Client
  secret**.
- Your Wallabag username and password: the Wallabag API asks for them to log
  in (OAuth2). The integration sees the articles of that user.

## Configuration

1. Open the **Configuration** tab of the integration.
2. In **Wallabag address**, enter the address of the server, for instance
   `192.168.1.50:8080`, or a full address like `https://wallabag.example.org`
   or `https://app.wallabag.it`.
3. Paste the **Client ID** and the **Client secret**, then your **Username**
   and **Password**.
4. Optional: **Read Wallabag every** (5 minutes by default).
5. Click **Test the connection**: it shows the user, the unread articles, their
   reading time and the starred ones.
6. Open the **Discover** tab and add the **Wallabag** device.

The password is used to get a login token, renewed every hour without asking
for it again; it is never written in the logs.

## Device

**Wallabag**, four values kept in the history:

- _Unread articles_: the "Unread" list of Wallabag.
- _Starred articles_: the "Starred" list (read or not).
- _Read today_: the articles marked as read (archived) since midnight, in the
  time zone of Gladys.
- _Reading time (unread)_: the sum of the reading times Wallabag estimates for
  the unread articles, in minutes. Past 2,000 unread articles, the rest is
  estimated from the average.

The values are read every few minutes (the setting above) and right after every
change made from Gladys.

## Dashboard widget

**Wallabag**: the number of unread articles, their reading time, the articles
read today, the six articles saved most recently and not read yet (site,
reading time, tags, a star for the starred ones, links to the article and to
Wallabag when they are https), and a **Refresh** button that reads Wallabag
right away. Set to a tag (for instance `cooking` on the kitchen tablet), the
widget only shows the unread articles of that tag.

## Scene triggers

- **New article**: an article was saved in Wallabag (from the browser
  extension, the mobile app or a scene).
- **Article archived**: an article was marked as read (archived).

Both have an optional filter, the **site** (the domain of the article, exactly
as Wallabag shows it, for instance `www.theguardian.com`), and pass on: title,
link, site, tags (separated by commas), reading time in minutes, starred,
article id.

Nothing fires at the first read after the installation. At most 10 articles of
each kind are announced per read (a bulk import does not send hundreds of
messages).

## Scene actions

- **Save a link in Wallabag**: a web address (or a variable holding one) and
  optional tags, separated by commas. Wallabag fetches the page before
  answering, which can take a few seconds. A link already saved is not
  duplicated: it gets the new tags. Outputs: article id, title, site, reading
  time, already saved before.
- **Mark a Wallabag article as read**: the id of the article (for instance the
  one given by a trigger) or its address. Outputs: id and title.
- **Read the unread Wallabag titles**: the articles saved most recently and not
  read yet (1 to 10), of every tag or of one. Outputs: number read, unread
  articles in all, titles one per line ("Title — site"), their reading time,
  title, link and id of the newest.

## Scene examples

- **Evening reading**: at 9 pm, _Read the unread Wallabag titles_ (3
  articles), then send a message with its _Titles_ and _Their reading time_
  outputs (insert them with the variable picker).
- **Keep a recipe**: a trigger of another integration that gives a link (a
  message received, an RSS feed) → _Save a link in Wallabag_ with the tag
  `cooking`; the kitchen widget, set to that tag, shows it.
- **Reading goal**: _Article archived_ → if _Read today_ equals 5, send "Goal
  of the day reached".

## Troubleshooting

- **"Wallabag refused the API client"**: the client ID or secret is wrong, or
  the client was deleted: create a new one.
- **"Wallabag refused the username or the password"**: check your login by
  signing in to Wallabag. An account that signs in through an external provider
  has no password the API can use.
- **"Wallabag does not answer"**: check the address and the port from the
  Gladys machine. Behind a reverse proxy, enter the full address, path
  included.
- **"This address does not answer like Wallabag"**: the address leads to
  another service, or to a login page (an authentication proxy in front of
  Wallabag must let `/oauth/v2/token` and `/api/` through).
- **An article saved without a title**: Wallabag could not fetch the page
  (site unreachable from the Wallabag server, protected page). That is how
  Wallabag itself behaves.
- More details: set the `LOG_LEVEL` variable of the integration to `debug`.

## Limitations

- The filter of the triggers only compares exact values: a site, not a tag (an
  article carries several; the tags are passed on as a variable).
- Annotations, the content of the articles and the starred flag are not
  managed from Gladys.
- Wallabag does not notify: an article is announced at the next read of the
  integration (5 minutes by default). Each read makes a few small requests,
  without the content of the articles; wallabag.it publishes no quota.
- The links of the widget only open https addresses.
- Not affiliated with Wallabag.
