# Release process

This project uses small tagged releases.

## Before a release

Run local checks:

```powershell
python -m compileall server.py site_backend
python -m pytest
```

Review the diff for private data:

- no production databases
- no uploads
- no keys, tokens, passwords, or API secrets
- no private server inventory
- no real user data

Check GitHub Actions after pushing.

## Creating a release

Use a short semantic version tag:

```powershell
gh release create v0.1.2 --repo ryzhkevichpavel-del/zapiski-site-engine --target main --title "v0.1.2 title" --notes "Short release notes."
```

Release notes should explain what changed and whether the change affects:

- setup
- security
- privacy
- data storage
- optional bridge boundaries

## After a release

- confirm the latest release is public
- confirm the latest GitHub Actions run is green
- keep follow-up work tracked as issues
