# Open-source scope

This repository is the public site engine and interface layer only.

Included:

- public content rendering
- admin editing APIs
- profile and community APIs
- local SQLite stores
- browser assets needed by the public site
- optional bridge client code with no secret token

Excluded:

- production server map
- deployment scripts
- Telegram bot runtime
- private back-office database
- uploaded media
- real user data

The extraction keeps the useful engineering parts while avoiding unnecessary
risk for the production website.
