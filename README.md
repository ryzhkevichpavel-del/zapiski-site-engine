# Zapiski Site Kit

Zapiski Site Kit is a small self-hosted Python website engine for content,
community profiles, comments, media uploads, admin editing, and a compact
client cabinet shell.

It grew out of a real production website and is published as a clean
open-source extraction: no deployment keys, no private database, no server
map, and no production history.

## What is inside

- a no-framework Python HTTP server
- SQLite-backed content, sessions, profiles, comments, questions, likes, and subscriptions
- a compact admin workspace for managing public sections and materials
- responsive public pages with profile and community features
- optional bridge hooks for private back-office systems
- vendored Editor.js browser assets with their license files

## What is intentionally not inside

- production databases
- user uploads
- SSH keys, tokens, passwords, or server inventory
- private deployment scripts
- the private Telegram/back-office service

## Quick start

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python server.py --host 127.0.0.1 --port 8765
```

Then open:

```text
http://127.0.0.1:8765
```

On first admin setup the app creates a one-time setup key in `data/setup_key.txt`.
The `data/` folder is ignored by Git and must never be committed.

## Development checks

```powershell
python -m compileall server.py site_backend
python -m pytest
```

## Project status

This repository is an early public extraction from a live project. The first
open-source goal is to make the core site engine easier to run, test, and reuse
without exposing private production infrastructure.

See [ROADMAP.md](ROADMAP.md) for the next maintenance work.
