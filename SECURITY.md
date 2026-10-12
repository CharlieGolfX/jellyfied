# Security policy

## Supported versions

Security fixes go into the newest release. Please update before reporting: the version you run
is shown in the account menu and on the sign-in screen.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub: on the repository's **Security** tab, choose
[**Report a vulnerability**](https://github.com/CharlieGolfX/jellyfied/security/advisories/new).
Include what you found, how to reproduce it, and which version of Jellyfied and of the Jellyfin
server you used. Leave out access tokens and real addresses.

You can expect a first answer within a week. Once a fix is released, the advisory is published
and you are credited in it, unless you would rather not be.

## Scope

Jellyfied is a web client for a Jellyfin server and stores nothing on the server side itself.
In scope are problems in this repository's code and container image, for example:

- access tokens leaking (into logs, addresses sent to other sites, or other users of a device),
- script injection through library metadata, subtitles or server responses,
- the container's nginx configuration, including the reverse proxy and its security headers,
- the build and release pipeline.

Problems in the Jellyfin server belong to the
[Jellyfin project](https://github.com/jellyfin/jellyfin/security/policy).

## What Jellyfied keeps in the browser

The session tokens of the accounts signed in on a device, and interface preferences, in the
browser's local storage. Anyone who can use that browser profile can use those accounts, so sign
out on devices you share.
