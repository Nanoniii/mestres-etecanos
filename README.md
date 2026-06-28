# Mestres Etecanos — Protótipo Jogável

Este pacote é a primeira versão jogável do jogo descrito em `Mestres Etecanos.txt`:
um TCG (jogo de cartas) onde cada matéria da escola é um "mestre" de combate.
Roda 100% no navegador, sem servidor — é só abrir `index.html`.
Site: https://nanoniii.github.io/mestres-etecanos/

## O que já funciona

- **Gate de passkey**: 50 chaves únicas (hashes SHA-256, nenhuma em texto puro no
  código) protegem o acesso. Veja `js/auth.js`.
- **Galeria de cartas** com filtro por raridade e montagem de baralho (até 4
  cartas, repetição permitida).
- **Partida completa contra CPU**, 2 a 4 jogadores na mesa (você + CPU(s)),
  com:
  - turnos, ordem aleatória inicial, colocação de cartas (com 1 turno de
    espera antes de atacar);
  - custos de raridade (Inicial livre / Raro exige Inicial em campo / Lendário
    sacrifica 1 carta da mão / Mítico sacrifica Lendária + outra carta);
  - mana, ataque, defesa por carta-escudo, dano direto;
  - bônus de raridade (3 Iniciais ou 2 Raras) e bônus de equipe (Humanas,
    Curso Técnico, Exatas, Linguagens);
  - as 12 habilidades das 10 matérias com arte pronta, incluindo as duas
    opções de Biologia;
  - fim de jogo / último jogador vivo vence.
- **Visual "sala de aula lendária"** (quadro-negro + giz dourado) já com tema
  completo em `css/estilo.css`, responsivo.

## O que eu corrigi nesta rodada

O protótipo já estava bem avançado, mas eu encontrei e corrigi alguns bugs de
lógica reais (testados com um script de simulação em Node antes de fechar):

1. **"Pão com Mortadela" e "Agora é Banco de Dados!"** curavam um atributo
   `vida` que as cartas não possuem (o jogo trata vida como atributo do
   *jogador*, não da carta — decisão de design já documentada no código).
   Isso fazia a cura virar `NaN` e não ter efeito nenhum. Agora as duas curam
   a vida do jogador, como o resto das regras.
2. **"É joguinho?" (PTIC)** deveria só destruir uma carta inimiga com menos de
   50% de vida — mas como a carta-alvo não tem `vida` própria, a checagem
   sempre falhava silenciosamente e a habilidade destruía qualquer carta,
   sempre. Agora a checagem usa a vida do jogador que controla a carta-alvo.
3. **"Defensor dos Indígenas" (Biologia)** dizia que os "minions" tomam 50% do
   dano, mas isso nunca era de fato aplicado no combate. Implementei a
   redução de dano em `executarAtaque`.
4. **"Coordenador do Ensino Médio" (Biologia)** cancelava a habilidade
   inimiga por 2 turnos, mas nada no código checava esse cancelamento — a
   carta "cancelada" continuava usando a habilidade normalmente. Agora a
   habilidade é bloqueada (e não cobra mana) enquanto estiver cancelada, com
   indicação visual na carta.
5. Pequena trava de segurança em `colocarCarta` para nunca colocar em campo
   uma carta que não esteja mais de fato na mão do jogador.

## Sobre as imagens das cartas

Ainda não recebi o `.zip` com a arte final das 10 cartas prontas (Português,
Artes, Física, História, Química, P.W., S.E., B.D., PTIC, Biologia). Para o
protótipo não ficar com imagens quebradas, gerei **artes provisórias**
simples (ícone + nome + selo de raridade, no estilo do jogo) em
`assets/cartas/`, com o mesmo nome de arquivo que `js/cartas-dados.js` já
espera. Quando você tiver a arte definitiva, basta substituir cada arquivo
pelo nome correspondente (ex.: `ana.jpg`, `Samproni.jpg` etc.) — nenhum código
precisa mudar.

O script que gerou essas artes provisórias está em
`ferramentas/gerar_cartas_provisorias.py`, caso queira gerar variações.

## O que ficou de fora por agora (combinado no FAQ)

- **Inglês, Geografia, P.A. e Matemática**: já têm status e habilidade
  descritos no `.txt` e em `js/habilidades.js` (`silence_please`,
  `sem_professor`, `sono`), mas **não foram adicionadas** em
  `js/cartas-dados.js` porque não há arte pronta ainda. É só acrescentar o
  objeto da carta no array `CARTAS` quando a arte chegar — a lógica das
  habilidades já está pronta e esperando.
- **Multiplayer online via Firebase**: o `.txt` menciona uma URL de Realtime
  Database. Não implementei isso ainda — é uma adição relativamente grande
  (sincronizar estado de partida entre clientes, lobby, reconexão etc.) que
  vale ser feita como o próximo passo, com você me dizendo se quer
  autenticação de jogador, salas por código, etc.
- **Sistema de loot/abertura de "caixas"** e **evolução de cartas**: descritos
  no documento como ideias a discutir mais — não implementados.
- **Bônus de escolha aleatório (-5% a +5%)** ao comprar carta: não
  implementado ainda.
- **Música de fundo**: pasta `assets/musicas/` já criada, só falta colocar os
  arquivos (ex. trilhas do Kevin MacLeod) e eu adiciono o player.
- **Gráficos "3D"**: o protótipo está em 2D (cartas ilustradas), como base
  para iterar. Recriar a mesa em 3D é um projeto à parte (provavelmente
  three.js) — me diga se é a próxima prioridade.

## Como jogar localmente

Abra `index.html` em qualquer navegador moderno (Chrome, Edge, Firefox).
Não precisa de servidor, build, nem instalar nada.

## Estrutura de arquivos

```
mestres-etecanos/
├── index.html
├── css/estilo.css
├── js/
│   ├── cartas-dados.js   (banco de cartas, raridades, equipes)
│   ├── habilidades.js    (lógica de cada habilidade)
│   ├── motor.js          (regras, turnos, combate, IA da CPU)
│   ├── app.js            (interface / renderização)
│   └── auth.js           (gate de passkey)
├── assets/
│   ├── cartas/           (artes — provisórias por enquanto)
│   └── musicas/
└── ferramentas/
    └── gerar_cartas_provisorias.py
```
