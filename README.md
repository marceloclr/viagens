# Gerador de Roteiros — estrutura separada

A curadoria saiu do HTML. O que era um literal de 690 linhas no meio do motor virou
uma árvore de arquivos JSON que pode ser revisada, versionada e corrigida sem que
ninguém precise abrir o arquivo do sistema.

O produto continua sendo **um arquivo único**, que abre com dois cliques, sem servidor.

## Fluxo

```
dados/*.json  ──▶  tools/build.mjs  ──▶  dist/Gerador_Roteiros_v2.html
   (fonte)          (ferramenta)              (produto)
```

A direção importa: os JSON são a origem, o HTML é o resultado. Uma página não escreve
arquivos no disco — quem lê `dados/` e costura tudo é um script Node, no seu terminal.

O que o HTML gera são os **roteiros do usuário**: o PDF pela impressão e o JSON do
roteiro pela exportação. Dado de quem viaja, não a base curada.

## O arquivo de roteiro

O botão **⬇ Exportar roteiro**, no console de edição, grava um `.json` versionado com a
configuração, as cidades, os dias, os horários, os blocos, a hospedagem escolhida, o
histórico de edição e os destinos declarados. **⬆ Importar roteiro** — disponível também
na barra do formulário, que é onde ele faz falta depois de recarregar a página — devolve
tudo isso ao sistema.

A regra que governa a volta: **o arquivo carrega a escolha, a base carrega o dado.**
Tarifa, duração, endereço, idade mínima e dia de fechamento vêm sempre da curadoria
corrente; um arquivo antigo não ressuscita um preço que já foi corrigido. Cada registro
consumido sai com impressão digital, recalculada na importação: o que divergir é
declarado item a item, e identificador que não existe mais vira conflito, não exceção
capturada. Ingressos, custos, plano B, validação e nota são recalculados; clima e câmbio
são reconsultados, porque previsão gravada há meses continuaria dizendo "previsão".

## Árvore

```
gerador-roteiros/
├── dados/                    ← FONTE DA VERDADE. Editar aqui.
│   ├── fontes.json               tabela de proveniência: resolve os tokens @ref:*
│   ├── paises.json
│   ├── ordem.json                ordem curada das cidades e demais coleções
│   ├── catalogo.json             objetivos, perfis, ritmos de caminhada, transporte
│   ├── trechos.json              atravessam fronteiras, por isso ficam na raiz
│   ├── avulsos.json              nós logísticos sem cidade cadastrada (Lisboa, escala)
│   ├── it/
│   │   ├── cidades.json · zonas.json · climatologia.json
│   │   ├── aeroportos.json · estacoes.json
│   │   ├── hospedagens.json · alimentacao.json · consular.json
│   │   └── atracoes/ roma.json · cassino.json · monte_santangelo.json · …
│   └── fr/  (mesma forma)
├── src/
│   └── index.html            ← motor, render, formulário, CSS. Dois marcadores no
│                               lugar dos literais: /*@BASE@*/ e /*@CATALOGO@*/
├── dist/
│   └── Gerador_Roteiros_v2.html  ← o que você distribui
├── tools/
│   ├── extrair-base.mjs      migração, executada uma única vez (já rodou)
│   ├── validar-base.mjs      integridade referencial e disciplina de proveniência
│   ├── build.mjs             composição
│   ├── conferir-build.mjs    prova de fidelidade contra o arquivo de origem
│   └── testar.cjs            as 92 verificações do bloco [21], fora do navegador
└── origem_fase3.html         referência histórica, para a conferência de fidelidade
```

## Comandos

```bash
npm run validar     # confere dados/ — erro bloqueia o build
npm run build       # valida e compõe dist/
npm run conferir    # prova que a reconstrução é idêntica à origem
npm run testar      # roda o arnês sobre o arquivo construído
npm run tudo        # build + conferir + testar
npm run servir      # http://localhost:8080 — só se quiser desenvolver servido
```

## Uma cidade nova, do começo ao fim

1. `dados/<pais>/cidades.json` — acrescente o registro
2. `dados/<pais>/atracoes/<cidade>.json` — crie o arquivo
3. `dados/<pais>/zonas.json` — rótulos e matriz de deslocamento interno
4. `dados/trechos.json` — como se chega e como se sai
5. `dados/ordem.json` — onde ela entra na lista do formulário
6. `npm run tudo`

Nenhum passo toca no motor.

## O que o validador exige

- id único em cidade, atração, hospedagem, aeroporto, estação e representação
- toda referência resolvida: atração aponta para cidade existente, cidade aponta para
  aeroporto existente, trecho parte e chega a cidades cadastradas
- `noitesMin ≤ noitesIdeal ≤ noitesMax`
- **todo valor afirmado traz fonte.** Campo com `tipo` diferente de `INDISPONIVEL` e
  sem `fonte` é erro, não aviso. É a regra do §11/§12 verificada no dado, e não apenas
  na renderização — a única forma de a promessa "nunca inventar" sobreviver à
  curadoria feita por outra pessoa, meses depois
- `INDISPONIVEL` não pode trazer valor; o inverso, tampouco
- token `@ref:*` inexistente em `fontes.json` é erro

Avisos não bloqueiam: cidade sem coordenadas (clima ficará indisponível), atração sem
endereço (sem link de mapa), plantão consular publicado sem ressalva de emergência.

## Por que `file://` obriga a este desenho

`fetch('dados/x.json')` e módulos ES são barrados pela política de origem em arquivos
locais. `<script>` clássico não é. O build resolve isso pela raiz: os dados entram no
HTML como literal, e o produto não faz requisição nenhuma para existir.

Se preferir desenvolver servido, `npm run servir` e abra `src/index.html` — mas aí os
marcadores ainda estarão lá. O caminho servido só faz sentido depois de um carregador
por `fetch`, que não existe hoje e não é necessário.

## Fronteiras que este desenho preserva

- **Curadoria e motor não se misturam.** `dados/` é revisável por quem não programa.
- **A separação é reversível.** `conferir-build` compara os 15 conjuntos da base entre
  origem e produto, registro a registro e na mesma ordem. Se divergir, o build mentiu.
- **A ordem é dado.** Ela governa a sequência dos chips no formulário; deixá-la a cargo
  do sistema de arquivos mudaria o produto sem mudar um registro sequer.
