[![EN](https://img.shields.io/badge/lang-EN-blue)](SECURITY.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](docs/pt-BR/SECURITY.md)

# Security policy

## Supported versions

Only the latest version of the `main` branch receives security fixes.

## Reporting a vulnerability

Do not open a public issue. Use one of these private channels:

- the **Report a vulnerability** button in the repository's [Security](https://github.com/opZywl/sharpz/security/advisories/new) tab;
- or the email contato@lucas-lima.dev.

Include what happens, how to reproduce it and what the impact is. Reports are reviewed as soon as possible, and you will hear back about the fix.

## Scope

Sharpz is made to run on your own computer: the server listens on `127.0.0.1:8000` and the dashboard on `localhost:5174`. Exposing these services to the internet or to a shared network is not a supported use.
