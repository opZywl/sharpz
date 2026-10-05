[![EN](https://img.shields.io/badge/lang-EN-blue)](CONTRIBUTING.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](docs/pt-BR/CONTRIBUTING.md)

# Contributing

Thanks for your interest in Sharpz! Bugs, ideas and pull requests are welcome.

## Before you start

- **Found a problem or have an idea?** Open an [issue](https://github.com/opZywl/sharpz/issues/new/choose) using one of the templates.
- **Found a security flaw?** Do not open a public issue. See the [security policy](SECURITY.md).
- Issues and pull requests can be written in English or Portuguese.
- By taking part, you agree to the [code of conduct](CODE_OF_CONDUCT.md).

## Setting up the environment

You will need Windows 10 or 11, Python 3.13, Node.js 20 or newer and Google Chrome.

```powershell
git clone https://github.com/opZywl/sharpz.git
cd sharpz
.\sharpz.cmd install
```

After the first install, use `.\sharpz.cmd open` to start the server and the dashboard. The details are in [Installation and usage](docs/en/installation.md) and [Development](docs/en/development.md).

## Making a change

1. Create a branch from `main`.
2. Make the change and run the checks:

   ```powershell
   .\venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"
   .\venv\Scripts\python.exe -m imgpdf.smoke_test
   uvx ruff check .
   cd web
   npx tsc --noEmit -p .
   ```

3. Write commits in the format `type: (scope) description`, for example `fix: (image) fix the cutout of PNGs with transparency`.
4. Open the pull request and fill in the template. CI must pass before the merge.

## Project conventions

- Interface text in English and Brazilian Portuguese (with correct accents), with no library or internal tool names.
- Documentation in both languages: `README.md` and `docs/en/` in English, `README.pt-BR.md` and `docs/pt-BR/` in Portuguese.
- No code comments.
- A new Python dependency goes in `requirements.txt`, and its tested version goes in `constraints.txt`.
- Never commit generated files, AI models, videos, audio, logs or secrets (`.gitignore` already blocks the common cases).
