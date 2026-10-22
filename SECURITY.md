# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration stores the Wallabag address, the API client (ID and secret)
and your Wallabag username and password in the configuration of Gladys (the
secret and the password are `secret` fields, never sent back to the browser).
The OAuth2 tokens it gets from them stay in memory. Under
`/data/wallabag-state.json`, it keeps only what its triggers need (user id,
last article id seen, last archive time and article ids). It never logs the
secrets, the tokens, the titles or the addresses of the articles. It talks to
the Wallabag address you enter, and to nothing else. The credentials give full
access to the Wallabag account: create an API client dedicated to Gladys, so it
can be deleted alone.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Wallabag itself (see its
[security policy](https://github.com/wallabag/wallabag/security/policy)).
