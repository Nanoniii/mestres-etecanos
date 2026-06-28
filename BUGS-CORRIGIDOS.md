# Bugs encontrados — Perfil e Modo Online Ranqueado

## 1. "Permission denied" no leaderboard (a causa raiz não está no código)

Procurei em todo o projeto e **não existe nenhum arquivo de regras do
Firebase** (`database.rules.json` ou equivalente). Isso confirma o que
costuma causar esse erro: todo Realtime Database novo nasce no Firebase
**em modo bloqueado (`.read: false`, `.write: false`) ou em "modo de teste"
com prazo de validade** — e depois que esse prazo expira, ele volta a
bloquear tudo. Como o jogo nunca chegou a definir regras próprias, qualquer
leitura (como o leaderboard fazendo `db.ref('jogadores')...`) e qualquer
escrita (o perfil salvando `db.ref('jogadores/seuId')...`) caem direto no
bloqueio padrão → `PERMISSION_DENIED`.

**Isso não se corrige só no código** — precisa publicar regras no Console
do Firebase. Criei o arquivo `database.rules.json` já pronto com as regras
certas pro formato de dados que o jogo usa (sem login real, cada jogador
só grava no próprio ID):

```
console.firebase.google.com → seu projeto → Realtime Database → Regras
→ cole o conteúdo de database.rules.json → Publicar
```

As regras liberam:
- `jogadores`: leitura pública (precisa pro leaderboard funcionar pra todo
  mundo), escrita só no próprio nó.
- `rooms`: leitura/escrita liberadas (é assim que duas pessoas conseguem
  entrar na mesma sala e jogar uma partida).
- `filaRanked` / `filaRankedConvite`: leitura/escrita pro matchmaking
  funcionar, do jeito que o `ranked.js` já espera.
- Também adicionei o índice `pontosRanked` em `jogadores`, que o
  `ranked.js` já comentava que era necessário pra a query do leaderboard
  (`orderByChild('pontosRanked')`) funcionar bem.

## 2. Pontos de ELO e vitórias/derrotas duplicando (bug real de código)

**Esse era o bug mais sério.** `checarFimDeJogoUI()` — a função que registra
vitória/derrota no perfil e calcula o ELO da ranqueada — é chamada em
vários pontos: depois de um ataque seu, depois de uma habilidade sua, e
**depois de toda ação que chega do adversário pelo Firebase**, mesmo já
tendo processado o fim de jogo antes.

Como nada impedia ela de rodar mais de uma vez, bastava o jogo já ter
acabado e o adversário ainda disparar mais uma ação (uma habilidade, um
ataque, etc. — coisas que podem chegar fora de ordem pela rede) para o
jogo registrar **outra vitória/derrota e recalcular o ELO de novo**, do
nada, sem você ter jogado mais nada.

**Corrigido em `js/app.js` e `js/motor.js`**: adicionei uma trava
(`jogoAtual.fimDeJogoProcessado`) que garante que o resultado da partida
só é processado uma única vez, não importa quantas vezes
`checarFimDeJogoUI()` seja chamada depois disso.

## 3. Listener de ações do Firebase nunca era desligado ao fim da partida

Junto com o bug acima: quando a partida online/ranqueada terminava, o
listener que escuta novas ações da sala (`escutarAcoesOnline`, em
`js/online.js`) continuava ativo. Ele só era desligado se você clicasse
manualmente em "Sair da sala" — clicar em "Jogar novamente" voltava pro
menu e deixava esse listener pendurado, escutando uma sala que já tinha
acabado.

**Corrigido**: agora, ao processar o fim de jogo de uma partida online,
o jogo desliga os listeners daquela sala e marca a sala como
`status: 'encerrada'` no Firebase. Também limpei o estado da sala antiga
ao clicar em "Jogar novamente", pra próxima partida online começar do
zero sem nenhuma referência da anterior sobrando.

## 4. "Buscar Partida" caía direto no fluxo de jogar contra CPU

Quando você clicava em **"Buscar Partida ⚔"** sem ter montado um baralho
ainda, `entrarFilaRanked()` mostrava um aviso rápido (some em ~2,5s) e
mandava você pra tela da **Galeria** — só que essa é a mesma tela usada
pelo modo "Jogar vs CPU". Sem nenhum aviso fixo nem botão de volta, você
acabava montando o baralho normalmente e clicando em "Ir para a partida →",
que leva direto pra tela de escolher quantos CPUs — nunca voltava pra fila
ranqueada de fato.

O modo Online comum (com código de sala) já tinha esse problema resolvido:
ao ir pra Galeria sem baralho, aparece um banner fixo lembrando de voltar.
O modo Ranqueado simplesmente não tinha o equivalente.

**Corrigido em `js/ranked.js`**: agora, ao precisar montar baralho antes de
entrar na fila, o jogo mostra um banner dourado fixo na Galeria
("🏆 Fila Ranqueada — Monte seu baralho e clique abaixo para voltar a
procurar um adversário") com um botão que chama `entrarFilaRanked()` de
novo — sem nunca passar pela tela de escolher CPU. O banner também é
removido automaticamente se você cancelar a busca ou for pareado com
alguém.


## 5. Botão "Ir para a partida →" (fluxo CPU) ainda escapava do banner do Ranked

O bug 4 ficou incompleto na correção anterior: o banner avisando "volte
pra fila ranqueada" foi adicionado, mas o **botão original** "Ir para a
partida →" — o mesmo usado pelo modo "Jogar vs CPU" — continuava visível
e clicável do lado do banner, na mesma tela da Galeria. Dava pra ignorar
o banner e clicar nele direto, caindo numa partida offline contra CPU do
mesmo jeito.

**Corrigido em `js/app.js`** (`renderizarSlotsBaralho`): esse botão agora
só aparece quando o contexto realmente é "Jogar contra CPU"
(`modoSelecionado === 'cpu'`). Vindo do modo Online ou Ranqueado, ele fica
escondido — só resta a opção de voltar pra fila/sala pelo banner. Aplicado
nos dois fluxos (Online comum e Ranqueado).

## 6. Vencedor de partida ranqueada não aparecia no leaderboard

A lógica de quem venceu/perdeu estava correta nos dois lados (testei
isoladamente os dois clientes simulando o fluxo completo). O problema real
estava em `sincronizarPerfilFirebase()`, em `js/perfil.js`: a função usava
um `try/catch` ao redor de uma chamada assíncrona (`db.ref(...).update(...)`,
que retorna uma Promise) — e `try/catch` **não captura rejeição de
Promise**. Se essa escrita falhasse por qualquer motivo (rede, permissão,
ou a aba fechando rápido demais depois da pessoa ver "Você venceu!"), o
erro desaparecia completamente em silêncio, sem nenhum aviso — o resultado
daquele jogador simplesmente não chegava no Firebase, e por isso não
aparecia no leaderboard.

**Corrigido**:
- `sincronizarPerfilFirebase()` agora retorna a Promise da escrita e trata
  o erro de forma assíncrona de verdade (`.catch()`), mostrando um aviso
  na tela se a sincronização falhar, em vez de falhar em silêncio.
- A tela de fim de jogo ranqueado agora mostra **"salvando no
  leaderboard..."** e só troca para **"✅ salvo no leaderboard"** quando a
  escrita de fato confirma — assim dá pra saber, antes de fechar a aba, se
  o resultado realmente foi salvo.
- Também adicionei um aviso específico em `js/online.js` e `js/ranked.js`:
  se você testar abrindo duas abas do **mesmo navegador**, elas compartilham
  o mesmo perfil (mesmo ID salvo no localStorage) — o jogo vai tratar as
  duas abas como "a mesma pessoa", e as estatísticas de uma sobrescrevem as
  da outra no Firebase. Isso não é bug de lógica, é a identidade sem-login
  do jogo funcionando como projetado — mas antes não havia nenhum aviso
  disso, então adicionei um para evitar confusão em testes. Para testar com
  2 jogadores de verdade, use uma aba anônima, outro navegador ou outro
  aparelho.


## Arquivos alterados
- `js/app.js` — trava contra duplicação de resultado + limpeza de sala ao
  fim da partida online + reset de estado ao "Jogar novamente" + esconder
  o botão de partida CPU fora do contexto CPU + feedback visual de
  "salvando no leaderboard...".
- `js/motor.js` — inicializa a nova flag de controle (`fimDeJogoProcessado`).
- `js/perfil.js` — corrige tratamento de erro assíncrono na sincronização
  com o Firebase, retornando a Promise da escrita.
- `js/ranked.js` — banner fixo na Galeria pra não cair no fluxo de CPU ao
  entrar na fila ranqueada sem baralho montado + aviso de perfil duplicado
  no matchmaking.
- `js/online.js` — recalcula visibilidade do botão de CPU ao entrar na
  Galeria pelo fluxo online + aviso de perfil duplicado ao entrar em sala.
- `database.rules.json` — **novo arquivo**, precisa ser publicado no
  Console do Firebase manualmente (não roda sozinho só por estar na pasta).
