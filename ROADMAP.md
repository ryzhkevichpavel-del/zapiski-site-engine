# Roadmap

Zapiski Site Kit is an early public extraction. The next work is focused on
making it easier to maintain as a reusable self-hosted project.

## Near term

- Add a seed/demo content command for local evaluation.
- Add focused tests for public rendering, profile privacy, and media handling.
- Document safe deployment patterns without publishing private infrastructure.
- Split optional private bridge code behind clearer configuration boundaries.

## Maintenance automation

- Use AI-assisted pull request review for Python and JavaScript changes.
- Generate release notes from merged changes.
- Add security-oriented checks for accidental secrets, private paths, and user data.
- Improve issue triage with labels for setup, security, docs, and UI.

## Boundaries

This project will stay a clean public extraction. Production databases, uploads,
keys, private server maps, and private back-office services are out of scope.
