[![EN](https://img.shields.io/badge/lang-EN-blue)](../../CONTRIBUTING.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](CONTRIBUTING.md)

# Como contribuir

Obrigado pelo interesse no Sharpz! Bugs, ideias e pull requests são bem-vindos.

## Antes de começar

- **Encontrou um problema ou tem uma ideia?** Abra uma [issue](https://github.com/opZywl/sharpz/issues/new/choose) usando um dos modelos.
- **Encontrou uma falha de segurança?** Não abra issue pública. Veja a [política de segurança](SECURITY.md).
- Issues e pull requests podem ser escritos em português ou em inglês.
- Ao participar, você concorda com o [código de conduta](CODE_OF_CONDUCT.md).

## Preparando o ambiente

Você vai precisar de Windows 10 ou 11, Python 3.13, Node.js 20 ou mais novo e o Google Chrome.

```powershell
git clone https://github.com/opZywl/sharpz.git
cd sharpz
.\sharpz.cmd instalar
```

Depois da primeira instalação, use `.\sharpz.cmd abrir` para subir o servidor e o painel. Os detalhes estão em [Instalação e uso](instalacao.md) e [Desenvolvimento](desenvolvimento.md).

## Fazendo uma mudança

1. Crie uma branch a partir da `main`.
2. Faça a mudança e rode as verificações:

   ```powershell
   .\venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"
   .\venv\Scripts\python.exe -m imgpdf.smoke_test
   uvx ruff check .
   cd web
   npx tsc --noEmit -p .
   ```

3. Faça commits no formato `tipo: (escopo) descrição`, por exemplo `fix: (imagem) corrige o recorte em PNG com transparência`.
4. Abra o pull request preenchendo o modelo. O CI precisa passar antes do merge.

## Convenções do projeto

- Textos da interface em inglês e em português do Brasil (com acentos), sem nomes de bibliotecas ou ferramentas internas.
- Documentação nos dois idiomas: `README.md` e `docs/en/` em inglês, `README.pt-BR.md` e `docs/pt-BR/` em português.
- Sem comentários no código.
- Nova dependência Python vai no `requirements.txt`, e a versão testada vai no `constraints.txt`.
- Nunca envie arquivos gerados, modelos de IA, vídeos, áudios, logs ou segredos (o `.gitignore` já bloqueia os casos comuns).
