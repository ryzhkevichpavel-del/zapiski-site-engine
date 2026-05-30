# Contributing

Thanks for looking at Zapiski Site Kit.

Good first contributions:

- improve setup instructions
- add tests around content storage and public rendering
- simplify the optional bridge boundaries
- improve accessibility and mobile layout without making the UI larger
- document safe self-hosting defaults

Before opening a pull request:

```powershell
python -m compileall server.py site_backend
python -m pytest
```

Do not include private data, generated databases, uploads, local backups, or
deployment files in pull requests.
