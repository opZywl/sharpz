[![EN](https://img.shields.io/badge/lang-EN-blue)](../../SECURITY.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](SECURITY.md)

# Política de segurança

## Versões com suporte

Só a versão mais recente da branch `main` recebe correções de segurança.

## Como relatar uma vulnerabilidade

Não abra issue pública. Use um destes canais privados:

- o botão **Report a vulnerability** na aba [Security](https://github.com/opZywl/sharpz/security/advisories/new) do repositório;
- ou o e-mail contato@lucas-lima.dev.

Inclua o que acontece, como reproduzir e qual o impacto. O relato é analisado o quanto antes, e você recebe retorno sobre a correção.

## Escopo

O Sharpz foi feito para rodar no próprio computador: o servidor escuta em `127.0.0.1:8000` e o painel em `localhost:5174`. Expor esses serviços na internet ou em uma rede compartilhada não é um uso suportado.
