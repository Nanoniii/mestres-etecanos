// =====================================================
// MESTRES ETECANOS - App / Interface
// =====================================================

let jogoAtual = null;
let baralhoEmMontagem = [];
let filtroGaleriaAtivo = 'todas';
let modoSelecionado = 'cpu';
let qtdJogadoresSelecionada = 2;
let acaoPendente = null; // { tipo: 'atacar'|'escudo'|'habilidade', carta }

// ---------- Timer de turno (cada ação tem um limite de tempo) ----------
const DURACAO_TIMER_TURNO_MS = 20000; // 20 segundos por ação
let timerTurnoIntervalo = null;
let timerTurnoFimEm = null; // timestamp (Date.now()) de quando o timer acaba

function $(sel, ctx = document) { return ctx.querySelector(sel); }
function $all(sel, ctx = document) { return Array.from(ctx.querySelectorAll(sel)); }

// Identifica o jogador local ("você") tanto no modo CPU quanto no modo online.
// Em partidas online TODOS os jogadores têm ehCPU=false, então não dá pra usar
// "!ehCPU" pra achar quem é você — precisa comparar com o onlineId.
function obterJogadorLocal() {
  if (!jogoAtual) return null;
  if (jogoAtual.modoOnline) {
    return jogoAtual.jogadores.find(j => j.onlineId === jogoAtual.meuOnlineId);
  }
  return jogoAtual.jogadores.find(j => !j.ehCPU);
}

// ---------- Navegação entre telas ----------
function mostrarTela(nomeTela) {
  const telaAtual = document.querySelector('.tela.ativa');
  const telaAlvo = document.getElementById(`tela-${nomeTela}`);
  if (!telaAlvo || telaAlvo === telaAtual) return;

  // Se está saindo da tela da mesa de jogo, o timer de turno não tem mais sentido.
  if (telaAtual && telaAtual.id === 'tela-mesa' && nomeTela !== 'mesa') {
    pararTimerTurno();
  }

  $all('.nav-telas button').forEach(b => b.classList.remove('ativo'));
  const navBtn = document.querySelector(`.nav-telas button[data-tela="${nomeTela}"]`);
  if (navBtn) navBtn.classList.add('ativo');

  if (telaAtual) telaAtual.classList.remove('ativa');
  telaAlvo.classList.add('ativa');

  // Esconde header no menu principal; mostra nas demais telas
  const header = document.getElementById('topo-app');
  if (header) {
    if (nomeTela === 'menu') {
      header.style.display = 'none';
      document.querySelector('.tela-conteudo').style.padding = '0';
    } else {
      header.style.display = 'flex';
      document.querySelector('.tela-conteudo').style.padding = '28px';
    }
  }

  window.scrollTo({ top: 0 });
}

// ---------- Galeria de cartas ----------
function renderizarGaleria() {
  const grade = document.getElementById('grade-galeria');
  grade.innerHTML = '';
  const colecao = typeof getColecao === 'function' ? getColecao() : {};
  const cartasFiltradas = CARTAS.filter(c => filtroGaleriaAtivo === 'todas' || c.raridade === filtroGaleriaAtivo);

  cartasFiltradas.forEach(cartaBase => {
    const wrap = document.createElement('div');
    const noBaralho = baralhoEmMontagem.filter(id => id === cartaBase.id).length;
    // Ana Paula (portugues) é grátis; resto precisa estar na coleção
    const temNaColecao = cartaBase.id === 'portugues' || (colecao[cartaBase.id] && colecao[cartaBase.id] > 0);
    wrap.innerHTML = `
      <div class="carta${temNaColecao ? '' : ' carta-bloqueada'}" data-raridade="${cartaBase.raridade}" data-id="${cartaBase.id}" tabindex="${temNaColecao ? '0' : '-1'}" role="button"
           aria-label="${cartaBase.nome}, raridade ${MOLDURAS[cartaBase.raridade].nome}">
        <img class="arte" src="${cartaBase.imagem}" alt="${cartaBase.nome}">
        <span class="selo-raridade">${MOLDURAS[cartaBase.raridade].nome}</span>
        <div class="badge-status">
          <span class="badge-atq">⚔ ${cartaBase.atq}</span>
          <span class="badge-def">🛡 ${cartaBase.def}</span>
        </div>
        ${!temNaColecao ? '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:28px;">🔒</div>' : ''}
      </div>
      <div class="carta-mini-nome">${cartaBase.nome}${noBaralho ? ` (${noBaralho}x no baralho)` : ''}</div>
    `;
    if (temNaColecao) {
      wrap.querySelector('.carta').addEventListener('click', () => adicionarAoBaralho(cartaBase.id));
    }
    grade.appendChild(wrap);
  });
}

function adicionarAoBaralho(idCarta) {
  if (baralhoEmMontagem.length >= LIMITE_BARALHO) {
    avisar(`Seu baralho já tem ${LIMITE_BARALHO} cartas — o máximo permitido.`);
    return;
  }
  baralhoEmMontagem.push(idCarta);
  renderizarGaleria();
  renderizarSlotsBaralho();
}

function removerDoBaralho(indice) {
  baralhoEmMontagem.splice(indice, 1);
  renderizarGaleria();
  renderizarSlotsBaralho();
}

function renderizarSlotsBaralho() {
  const cont = document.getElementById('slots-baralho');
  cont.innerHTML = '';
  for (let i = 0; i < LIMITE_BARALHO; i++) {
    if (baralhoEmMontagem[i]) {
      const cartaBase = buscarCartaPorId(baralhoEmMontagem[i]);
      const el = document.createElement('div');
      el.className = 'mini-carta-slot';
      el.style.setProperty('--cor-borda', `var(--cor-${cartaBase.raridade})`);
      el.innerHTML = `<img src="${cartaBase.imagem}" alt="${cartaBase.nome}"><span class="remover">×</span>`;
      el.querySelector('.remover').addEventListener('click', (e) => { e.stopPropagation(); removerDoBaralho(i); });
      cont.appendChild(el);
    } else {
      const el = document.createElement('div');
      el.className = 'slot-vazio';
      el.textContent = '+';
      cont.appendChild(el);
    }
  }
  document.getElementById('contagem-baralho').textContent = `${baralhoEmMontagem.length}/${LIMITE_BARALHO}`;
  document.getElementById('btn-ir-para-partida').disabled = baralhoEmMontagem.length === 0;
}

function avisar(msg) {
  const el = document.getElementById('aviso-flutuante');
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(window.__avisoTimeout);
  window.__avisoTimeout = setTimeout(() => { el.style.opacity = '0'; }, 2600);
}

// ---------- Timer de turno ----------
// Sempre que é a vez do jogador humano, ele tem DURACAO_TIMER_TURNO_MS (20s)
// para realizar uma ação (atacar, usar habilidade, colocar carta, definir
// escudo ou passar o turno). Qualquer ação reinicia a contagem — é o mesmo
// turno, então a pessoa ganha mais 20s pra decidir a próxima jogada. Se o
// tempo esgotar sem nenhuma ação, o turno passa automaticamente.
function gerenciarTimerTurno() {
  if (!jogoAtual) { pararTimerTurno(); return; }

  const humano = obterJogadorLocal();
  const ehVezDoHumano = jogoAtual.jogadorAtual() === humano && humano && humano.vivo && !jogoAtual.jogoEncerrado;

  if (!ehVezDoHumano) {
    pararTimerTurno();
    return;
  }

  // Só reinicia o relógio se ele não estiver rodando ainda (evita resetar o
  // timer sozinho a cada re-render que não veio de uma ação do jogador).
  if (timerTurnoIntervalo === null) {
    iniciarTimerTurno();
  }
}

function iniciarTimerTurno() {
  pararTimerTurno();
  const wrap = document.getElementById('timer-turno-wrap');
  if (!wrap) return;

  timerTurnoFimEm = Date.now() + DURACAO_TIMER_TURNO_MS;
  wrap.style.display = 'flex';
  atualizarVisualTimerTurno();

  timerTurnoIntervalo = setInterval(() => {
    const restanteMs = timerTurnoFimEm - Date.now();
    if (restanteMs <= 0) {
      pararTimerTurno();
      tempoDeAcaoEsgotado();
      return;
    }
    atualizarVisualTimerTurno();
  }, 200);
}

// Reinicia a contagem de 20s — chamado a cada ação válida do jogador humano
// (colocar carta, atacar, usar habilidade, definir escudo), pra dar o tempo
// cheio de novo pra próxima decisão dentro do mesmo turno.
function reiniciarTimerTurno() {
  const humano = obterJogadorLocal();
  const ehVezDoHumano = jogoAtual && jogoAtual.jogadorAtual() === humano && humano && humano.vivo && !jogoAtual.jogoEncerrado;
  if (!ehVezDoHumano) { pararTimerTurno(); return; }
  iniciarTimerTurno();
}

function atualizarVisualTimerTurno() {
  const barra = document.getElementById('timer-turno-barra');
  const texto = document.getElementById('timer-turno-texto');
  const wrap = document.getElementById('timer-turno-wrap');
  if (!barra || !texto || !wrap || timerTurnoFimEm === null) return;

  const restanteMs = Math.max(0, timerTurnoFimEm - Date.now());
  const restanteS = Math.ceil(restanteMs / 1000);
  const pct = Math.max(0, Math.min(100, (restanteMs / DURACAO_TIMER_TURNO_MS) * 100));

  barra.style.width = `${pct}%`;
  texto.textContent = `${restanteS}s`;

  const alerta = restanteS <= 5;
  barra.classList.toggle('timer-alerta', alerta);
  wrap.classList.toggle('timer-alerta', alerta);
}

function pararTimerTurno() {
  if (timerTurnoIntervalo !== null) {
    clearInterval(timerTurnoIntervalo);
    timerTurnoIntervalo = null;
  }
  timerTurnoFimEm = null;
  const wrap = document.getElementById('timer-turno-wrap');
  if (wrap) wrap.style.display = 'none';
}

// Chamado quando os 20s acabam sem nenhuma ação: fecha qualquer modal aberto
// (se o jogador estava no meio de uma escolha, ela é cancelada) e passa o
// turno automaticamente, deixando claro no log o motivo.
function tempoDeAcaoEsgotado() {
  fecharModal();
  jogoAtual.logar('⏱ O tempo da ação esgotou e o turno passou automaticamente.');
  avisar('Tempo esgotado! Seu turno passou.');
  passarTurnoHumano();
}

// ---------- Configuração de partida ----------
function configurarPartida() {
  document.getElementById('resumo-baralho-partida').textContent =
    baralhoEmMontagem.length > 0
      ? baralhoEmMontagem.map(id => buscarCartaPorId(id).nome).join(', ')
      : 'Nenhuma carta selecionada ainda — volte para a Galeria.';

  const avisoEl = document.getElementById('aviso-baralho-arriscado');
  const baralhoBase = baralhoEmMontagem.map(id => buscarCartaPorId(id));
  const temInicial = baralhoBase.some(c => c.raridade === RARIDADE.INICIAL || c.raridade === RARIDADE.COMUM);
  const temLendariaOuMenos = baralhoBase.some(c => c.raridade !== RARIDADE.MITICO);
  if (avisoEl) {
    if (!temInicial && !temLendariaOuMenos) {
      avisoEl.style.display = 'block';
      avisoEl.textContent = '⚠ Seu baralho só tem cartas Míticas. Sem nenhuma carta Inicial, Comum ou Lendária, pode ficar impossível jogar a primeira carta. Considere trocar pelo menos 1 carta.';
    } else if (!temInicial) {
      avisoEl.style.display = 'block';
      avisoEl.textContent = '⚠ Seu baralho não tem nenhuma carta Inicial ou Comum — cartas Raras vão ficar bloqueadas até você ter uma em campo.';
    } else {
      avisoEl.style.display = 'none';
    }
  }

  mostrarTela('partida-config');
}

function iniciarPartida() {
  if (baralhoEmMontagem.length === 0) {
    avisar('Monte um baralho com pelo menos 1 carta antes de jogar.');
    return;
  }

  const baralhoBase = baralhoEmMontagem.map(id => buscarCartaPorId(id));
  const totalJogadores = qtdJogadoresSelecionada;
  const jogadores = [];

  const nomesCPU = ['Professor Substituto', 'Coordenação', 'Monitor da Sala', 'Diretoria'];
  jogadores.push(new Jogador('Você', false));
  for (let i = 1; i < totalJogadores; i++) {
    jogadores.push(new Jogador(nomesCPU[i - 1] || `CPU ${i}`, true));
  }

  // Cada jogador recebe o mesmo baralho-base escolhido (protótipo); CPU usa baralho aleatório variado
  jogadores.forEach((j, idx) => {
    if (idx === 0) {
      j.baralho = baralhoBase;
    } else {
      j.baralho = sortearBaralhoCPU();
    }
    const maoInicialBase = j.baralho.slice(0, Math.min(LIMITE_CAMPO, j.baralho.length));
    j.mao = maoInicialBase.map(clonarCartaBase);
  });

  jogoAtual = new EstadoJogo(embaralhar(jogadores));
  jogoAtual.logar('A partida começou! Boa sorte, mestres.');

  mostrarTela('mesa');
  renderizarMesa();
  iniciarTutorialSeNecessario();

  if (jogoAtual.jogadorAtual().ehCPU) {
    setTimeout(rodarTurnoCPU, 900);
  }
}

function sortearBaralhoCPU() {
  const disponiveis = CARTAS.slice();
  const iniciaisOuComuns = disponiveis.filter(c => c.raridade === RARIDADE.INICIAL || c.raridade === RARIDADE.COMUM);
  const baralho = [];
  // Garante ao menos 1 carta Inicial ou Comum para que a CPU nunca fique sem jogada possível.
  if (iniciaisOuComuns.length > 0) {
    baralho.push(iniciaisOuComuns[Math.floor(Math.random() * iniciaisOuComuns.length)]);
  }
  while (baralho.length < LIMITE_BARALHO) {
    baralho.push(disponiveis[Math.floor(Math.random() * disponiveis.length)]);
  }
  return baralho;
}

function embaralhar(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Renderização da mesa ----------
function renderizarMesa() {
  if (!jogoAtual) return;
  const area = document.getElementById('area-mesa-jogadores');
  area.innerHTML = '';

  const humano = obterJogadorLocal();

  const linhaOponentes = document.createElement('div');
  linhaOponentes.className = 'linha-oponentes';

  const zonaCentral = document.createElement('div');
  zonaCentral.className = 'zona-campo-central';

  const linhaHumano = document.createElement('div');
  linhaHumano.className = 'linha-jogador-humano';

  jogoAtual.jogadores.forEach(jogador => {
    const ehAtual = jogador === jogoAtual.jogadorAtual();
    const ehHumano = jogador === humano;
    const pctVida = Math.max(0, Math.round((jogador.vida / jogador.vidaMax) * 100));

    const chip = document.createElement('div');
    chip.className = `chip-jogador ${ehHumano ? 'chip-humano' : 'chip-cpu'} ${ehAtual ? 'atual' : ''} ${!jogador.vivo ? 'eliminado' : ''}`;
    chip.innerHTML = `
      <div class="avatar-jogador">${jogador.ehCPU ? '🤖' : '🎓'}</div>
      <div class="info-chip">
        <div class="nome-chip">
          ${jogador.nome}
          ${ehAtual ? '<span class="tag-vez">Na vez</span>' : ''}
          ${!jogador.vivo ? '<span class="tag-vez" style="background:#7a2222;color:#fff;">Eliminado</span>' : ''}
        </div>
        <div class="barra-vida-jogador-wrap"><div class="barra-vida-jogador" style="width:${pctVida}%"></div></div>
        <span class="texto-vida-jogador">${jogador.vida}/${jogador.vidaMax}</span>
      </div>
      <span class="contagem-campo-chip" title="Cartas em campo">${jogador.campo.length} 🂠</span>
    `;
    (ehHumano ? linhaHumano : linhaOponentes).appendChild(chip);

    const grupo = document.createElement('div');
    grupo.className = `grupo-campo-jogador ${ehHumano ? 'campo-humano' : 'campo-cpu'}`;
    if (jogador.campo.length > 0) {
      grupo.innerHTML = `<span class="rotulo-grupo-campo">${jogador.nome}</span>`;
    }
    const campoDiv = document.createElement('div');
    campoDiv.className = 'campo-cartas-jogador';
    campoDiv.dataset.jogadorUid = jogoAtual.jogadores.indexOf(jogador);
    jogador.campo.forEach(carta => campoDiv.appendChild(renderizarCartaEmCampo(carta, jogador)));
    grupo.appendChild(campoDiv);
    zonaCentral.appendChild(grupo);
  });

  area.appendChild(linhaOponentes);
  area.appendChild(zonaCentral);
  area.appendChild(linhaHumano);

  renderizarMaoHumano();
  renderizarLog();
  renderizarBonusAtivos();
  renderizarBotoesTurno();
  gerenciarTimerTurno();
}


function renderizarCartaEmCampo(carta, jogador) {
  const div = document.createElement('div');
  div.className = `carta tamanho-mesa ${carta.destruida ? 'destruida' : ''}`;
  div.dataset.raridade = carta.raridade;
  div.dataset.uid = carta.uid;

  const status = jogoAtual.statusEfetivos(carta, jogador);
  const podeAtacarVisual = carta.podeAtacar && !carta.jaAtacouNoTurno;
  const humano = obterJogadorLocal();
  const ehCPU = jogador !== humano;

  // Cartas de CPU são exibidas com o verso quando ainda não podem atacar
  if (ehCPU && !carta.podeAtacar) {
    div.innerHTML = `
      <img class="arte" src="assets/cartas/parte de tras da carta.jpeg" alt="Carta virada">
      <span class="selo-raridade" style="opacity:0.5">?</span>
    `;
    return div;
  }

  const pctVidaCarta = Math.max(0, Math.round((carta.vida / carta.vidaMax) * 100));
  const corVida = pctVidaCarta > 50 ? '#4caf50' : pctVidaCarta > 25 ? '#ff9800' : '#f44336';

  div.innerHTML = `
    <img class="arte" src="${carta.imagem}" alt="${carta.nome}">
    <span class="selo-raridade">${MOLDURAS[carta.raridade].nome}</span>
    <div class="barra-vida-carta-wrap" title="Vida: ${carta.vida}/${carta.vidaMax}">
      <div class="barra-vida-carta" style="width:${pctVidaCarta}%;background:${corVida};"></div>
      <span class="texto-vida-carta">❤ ${carta.vida}</span>
    </div>
    <div class="badge-status">
      <span class="badge-mana">✦${carta.mana}/${carta.manaMax}</span>
      <span class="badge-atq">⚔${status.atq}</span>
      <span class="badge-def">🛡${status.def}</span>
    </div>
    ${!podeAtacarVisual && !(carta.escudoAtivoTurnos > 0) ? '<span class="tag-efeito">aguardando</span>' : ''}
    ${carta.escudoAtivoTurnos > 0 ? `<span class="tag-efeito tag-escudo-ativo" title="Carta-escudo: prioriza absorver ataques diretos por mais ${carta.escudoAtivoTurnos} turno(s); não pode atacar enquanto isso.">🛡 escudo (${carta.escudoAtivoTurnos})</span>` : ''}
    ${carta.paralisadoPorTurnos > 0 ? '<span class="tag-efeito" style="top:auto;bottom:22px;">paralisado</span>' : ''}
    ${carta.inutilizavelPorTurnos > 0 ? '<span class="tag-efeito" style="top:auto;bottom:22px;">inutilizável</span>' : ''}
    ${carta.habilidadeCanceladaPorTurnos > 0 ? '<span class="tag-efeito" style="top:34px;">hab. cancelada</span>' : ''}
  `;

  if (jogador === humano) {
    div.title = carta.escudoAtivoTurnos > 0
      ? `${carta.nome} é seu escudo — prioriza absorver ataques diretos por mais ${carta.escudoAtivoTurnos} turno(s).`
      : `${carta.nome} — clique para escolher ação`;
  }
  return div;
}

function renderizarMaoHumano() {
  const humano = obterJogadorLocal();
  const cont = document.getElementById('mao-do-jogador');
  cont.innerHTML = '';
  if (!humano) return;

  const total = humano.mao.length;

  humano.mao.forEach((carta, i) => {
    const verificacao = jogoAtual.podeColocarCarta(humano, carta, carta);
    const div = document.createElement('div');
    div.className = 'carta-mao-wrap';

    // Efeito de leque: ângulo e altura variam conforme a posição na mão
    const centro = (total - 1) / 2;
    const offset = i - centro;
    const angulo = Math.max(-16, Math.min(16, offset * 7));
    const subida = Math.max(0, 10 - Math.abs(offset) * 4);
    div.style.transform = `rotate(${angulo}deg) translateY(${-subida}px)`;
    div.style.zIndex = i;

    div.innerHTML = `
      <div class="carta ${verificacao.ok ? '' : 'indisponivel'}" data-raridade="${carta.raridade}" data-uid="${carta.uid}" title="${verificacao.ok ? 'Colocar em campo' : verificacao.motivo}">
        <img class="arte" src="${carta.imagem}" alt="${carta.nome}">
        <span class="selo-raridade">${MOLDURAS[carta.raridade].nome}</span>
        <div class="badge-status">
          <span class="badge-atq">⚔${carta.atq}</span>
          <span class="badge-def">🛡${carta.def}</span>
        </div>
      </div>
      <div class="carta-mini-nome">${carta.nome}</div>
    `;
    div.querySelector('.carta').addEventListener('click', () => {
      if (verificacao.ok) colocarCartaHumano(carta);
      else avisar(verificacao.motivo);
    });
    cont.appendChild(div);
  });

  if (humano.mao.length === 0) {
    cont.innerHTML = '<p style="color:var(--texto-suave); font-size:13px; text-align:center; width:100%;">Sua mão está vazia. Use cartas em campo ou passe o turno.</p>';
  }
}

function colocarCartaHumano(carta) {
  const humano = obterJogadorLocal();
  jogoAtual.colocarCarta(humano, carta);
  jogoAtual.logar(`Você colocou ${carta.nome} em campo.`);
  if (jogoAtual.modoOnline && typeof publicarAcaoOnline === 'function') {
    publicarAcaoOnline('colocarCarta', { cartaId: carta.id, uid: carta.uid });
  }
  renderizarMesa();
  reiniciarTimerTurno();
}

function renderizarLog() {
  const logDiv = document.getElementById('log-jogo');
  logDiv.innerHTML = jogoAtual.log.slice(-60).map(m => `<div>${m}</div>`).reverse().join('');
}

function renderizarBonusAtivos() {
  const humano = obterJogadorLocal();
  const cont = document.getElementById('bonus-ativos-painel');
  if (!humano) { cont.innerHTML = ''; return; }
  const br = jogoAtual.calcularBonusRaridade(humano);
  const be = jogoAtual.calcularBonusEquipe(humano);
  cont.innerHTML = `
    <div class="linha-bonus"><span>Bônus de raridade</span><b>+${br.atq} ATQ</b></div>
    <div class="linha-bonus"><span>Bônus de equipe (ATQ)</span><b>+${be.atq}</b></div>
    <div class="linha-bonus"><span>Bônus de equipe (DEF)</span><b>+${be.def}</b></div>
  `;
}

function renderizarBotoesTurno() {
  const cont = document.getElementById('botoes-turno');
  const humano = obterJogadorLocal();
  const ehVezDoHumano = jogoAtual.jogadorAtual() === humano && humano.vivo && !jogoAtual.jogoEncerrado;

  cont.innerHTML = '';
  if (!ehVezDoHumano) {
    cont.innerHTML = `<p style="color:var(--texto-suave); font-size:13px;">${jogoAtual.jogoEncerrado ? '' : 'Aguardando outro jogador...'}</p>`;
    return;
  }

  const cartasAtacantes = jogoAtual.cartasDoJogador(humano).filter(c => c.podeAtacar && !c.jaAtacouNoTurno && !c.inutilizavelPorTurnos && !c.paralisadoPorTurnos);
  const cartasComHabilidade = jogoAtual.cartasDoJogador(humano).filter(c => (c.habilidade || c.habilidades) && cartaTemManaSuficiente(c));
  const cartasParaEscudo = jogoAtual.cartasDoJogador(humano).filter(c => c.escudoAtivoTurnos === 0);

  if (cartasAtacantes.length > 0) {
    const btn = document.createElement('button');
    btn.className = 'btn-atacar';
    btn.textContent = '⚔ Atacar';
    btn.addEventListener('click', () => abrirEscolhaAtaque(cartasAtacantes));
    cont.appendChild(btn);
  }

  if (cartasComHabilidade.length > 0) {
    const btn = document.createElement('button');
    btn.className = 'btn-habilidade';
    btn.textContent = '✦ Usar habilidade';
    btn.addEventListener('click', () => abrirEscolhaHabilidade(cartasComHabilidade));
    cont.appendChild(btn);
  }

  if (cartasParaEscudo.length > 0) {
    const btn = document.createElement('button');
    btn.className = 'btn-escudo';
    btn.textContent = humano.escudoPendente ? `🛡 Trocar escudo (atual: ${humano.escudoPendente.nome})` : '🛡 Definir escudo';
    btn.title = 'Escolha uma carta para priorizar a defesa: ela vai absorver os ataques que vierem direto contra você, mas fica 2 turnos sem poder atacar.';
    btn.addEventListener('click', () => abrirEscolhaEscudo(cartasParaEscudo));
    cont.appendChild(btn);
  }

  const btnPassar = document.createElement('button');
  btnPassar.className = 'btn-passar';
  btnPassar.textContent = 'Passar turno';
  btnPassar.addEventListener('click', passarTurnoHumano);
  cont.appendChild(btnPassar);
}

function cartaTemManaSuficiente(carta) {
  if (carta.habilidadeCanceladaPorTurnos > 0) return false;
  const habs = carta.habilidades || (carta.habilidade ? [carta.habilidade] : []);
  return habs.some(h => carta.mana >= (h.custoMana === 'todas' ? carta.manaMax : h.custoMana) && (h.usosMax === undefined || carta.habilidadeUsosRestantes > 0 || h.usosMax === Infinity));
}

// ---------- Modais de ação ----------
function abrirModal(titulo, opcoes) {
  const overlay = document.getElementById('overlay-modal');
  const conteudo = document.getElementById('modal-conteudo-interno');
  conteudo.innerHTML = `<h3>${titulo}</h3><div class="lista-opcoes-modal"></div><button class="btn-secundario" id="btn-cancelar-modal">Cancelar</button>`;
  const lista = conteudo.querySelector('.lista-opcoes-modal');
  opcoes.forEach(op => {
    const btn = document.createElement('button');
    btn.textContent = op.label;
    btn.addEventListener('click', () => { fecharModal(); op.onClick(); });
    lista.appendChild(btn);
  });
  conteudo.querySelector('#btn-cancelar-modal').addEventListener('click', fecharModal);
  overlay.style.display = 'flex';
}

function fecharModal() {
  document.getElementById('overlay-modal').style.display = 'none';
}

function abrirEscolhaAtaque(cartasAtacantes) {
  abrirModal('Escolha quem ataca', cartasAtacantes.map(c => ({
    label: `${c.nome} (⚔${c.atq})`,
    onClick: () => abrirEscolhaAlvoJogador(c)
  })));
}

function abrirEscolhaAlvoJogador(cartaAtacante) {
  const humano = obterJogadorLocal();
  const alvos = jogoAtual.jogadoresVivos().filter(j => j !== humano);

  if (alvos.length === 1) {
    const alvoJogador = alvos[0];
    const cartasInimigasAlvo = jogoAtual.cartasDoJogador(alvoJogador);
    if (cartasInimigasAlvo.length === 0) {
      // Sem cartas em campo: ataque direto
      executarAtaqueHumano(cartaAtacante, alvoJogador, null);
    } else if (cartasInimigasAlvo.length === 1) {
      executarAtaqueHumano(cartaAtacante, alvoJogador, cartasInimigasAlvo[0]);
    } else {
      // Escolhe qual carta inimiga atacar
      abrirModal('Escolha a carta alvo', cartasInimigasAlvo.map(c => ({
        label: rotuloCartaAlvo(c, alvoJogador),
        onClick: () => executarAtaqueHumano(cartaAtacante, alvoJogador, c)
      })));
    }
    return;
  }

  // Múltiplos jogadores: escolhe jogador primeiro, depois carta
  abrirModal('Escolha o jogador alvo', alvos.map(j => ({
    label: j.nome,
    onClick: () => {
      const cartasInimigasAlvo = jogoAtual.cartasDoJogador(j);
      if (cartasInimigasAlvo.length === 0) {
        executarAtaqueHumano(cartaAtacante, j, null);
      } else if (cartasInimigasAlvo.length === 1) {
        executarAtaqueHumano(cartaAtacante, j, cartasInimigasAlvo[0]);
      } else {
        abrirModal('Escolha a carta alvo', cartasInimigasAlvo.map(c => ({
          label: rotuloCartaAlvo(c, j),
          onClick: () => executarAtaqueHumano(cartaAtacante, j, c)
        })));
      }
    }
  })));
}

// Monta o texto de uma carta inimiga no modal de escolha de alvo, indicando
// quando ela está marcada como escudo (informação útil: atacar o escudo
// direto ignora a prioridade automática, mas a carta continua sendo um
// tanque válido — atacar outra carta deixa o escudo livre para continuar
// protegendo o jogador nos próximos turnos).
function rotuloCartaAlvo(carta, jogadorDono) {
  const ehEscudo = jogadorDono.escudoPendente === carta;
  return `${carta.nome} (❤ ${carta.vida}/${carta.vidaMax} | 🛡 ${carta.def})${ehEscudo ? ' — 🛡 ESCUDO' : ''}`;
}

function executarAtaqueHumano(carta, alvoJogador, cartaAlvo) {
  const humano = obterJogadorLocal();
  jogoAtual.executarAtaque(humano, carta, alvoJogador, cartaAlvo || null);
  if (jogoAtual.modoOnline && typeof publicarAcaoOnline === 'function') {
    publicarAcaoOnline('ataque', {
      cartaAtacanteUid: carta.uid,
      alvoJogadorId: alvoJogador.onlineId,
      cartaAlvoUid: cartaAlvo ? cartaAlvo.uid : null
    });
  }
  renderizarMesa();
  checarFimDeJogoUI();
  reiniciarTimerTurno();
}

function abrirEscolhaHabilidade(cartas) {
  abrirModal('Escolha a habilidade', cartas.map(c => {
    const habs = c.habilidades || [c.habilidade];
    const principal = habs[0];
    return {
      label: `${c.nome}: ${principal.nome}`,
      onClick: () => {
        if (habs.length > 1) {
          abrirModal(`${c.nome} — qual habilidade?`, habs.map(h => ({
            label: h.nome,
            onClick: () => prepararExecucaoHabilidade(c, h)
          })));
        } else {
          prepararExecucaoHabilidade(c, principal);
        }
      }
    };
  }));
}

function prepararExecucaoHabilidade(carta, hab) {
  const humano = obterJogadorLocal();
  const idHab = hab.id;
  const precisaAlvoInimigo = ['silence_please', 'e_joguinho', 'coordenador_em'].includes(idHab);
  const precisaAlvoJogador = ['sono'].includes(idHab);

  if (precisaAlvoInimigo) {
    const inimigos = jogoAtual.cartasInimigasVivas(humano);
    if (inimigos.length === 0) { avisar('Não há cartas inimigas em campo.'); return; }
    abrirModal('Escolha o alvo', inimigos.map(i => ({
      label: `${i.nome} (vida ${i.vida ?? '?'})`,
      onClick: () => finalizarHabilidade(carta, idHab, i)
    })));
    return;
  }

  if (precisaAlvoJogador) {
    const alvos = jogoAtual.jogadoresVivos().filter(j => j !== humano);
    abrirModal('Escolha o jogador alvo', alvos.map(j => ({
      label: j.nome,
      onClick: () => finalizarHabilidade(carta, idHab, j)
    })));
    return;
  }

  finalizarHabilidade(carta, idHab, null);
}

function finalizarHabilidade(carta, idHab, alvo) {
  const humano = obterJogadorLocal();
  const hab = (carta.habilidades || [carta.habilidade]).find(h => h.id === idHab);
  const custo = hab.custoMana === 'todas' ? carta.manaMax : hab.custoMana;
  if (carta.mana < custo) { avisar('Mana insuficiente.'); return; }
  if (carta.habilidadeCanceladaPorTurnos > 0) { avisar('A habilidade dessa carta está cancelada por agora.'); return; }

  const msgs = executarHabilidade(idHab, jogoAtual, humano, carta, alvo);
  if (hab.custoMana === 'todas') carta.mana = 0;
  else carta.mana -= custo;

  jogoAtual.logar(msgs);

  if (jogoAtual.modoOnline && typeof publicarAcaoOnline === 'function') {
    const ehAlvoJogador = alvo && typeof alvo === 'object' && alvo.onlineId !== undefined && alvo.campo !== undefined;
    publicarAcaoOnline('habilidade', {
      cartaUid: carta.uid,
      habId: idHab,
      alvoUid: alvo && !ehAlvoJogador ? alvo.uid : null,
      alvoJogadorId: alvo && ehAlvoJogador ? alvo.onlineId : null
    });
  }

  renderizarMesa();
  checarFimDeJogoUI();
  reiniciarTimerTurno();
}function abrirEscolhaEscudo(cartas) {
  const humano = obterJogadorLocal();
  const titulo = humano.escudoPendente
    ? 'Trocar carta-escudo'
    : 'Escolha a carta-escudo';
  abrirModal(titulo, cartas.map(c => ({
    label: `${c.nome} (🛡${c.def})${humano.escudoPendente === c ? ' — já é o escudo atual' : ''}`,
    onClick: () => {
      jogoAtual.definirEscudo(humano, c);
      avisar(`${c.nome} agora é seu escudo: vai priorizar absorver ataques diretos, mas fica 2 turnos sem atacar.`);
      if (jogoAtual.modoOnline && typeof publicarAcaoOnline === 'function') {
        publicarAcaoOnline('definirEscudo', { cartaUid: c.uid });
      }
      renderizarMesa();
      reiniciarTimerTurno();
    }
  })));
}

function passarTurnoHumano() {
  if (jogoAtual && jogoAtual.modoOnline && typeof publicarAcaoOnline === 'function') publicarAcaoOnline('passarTurno', {});
  jogoAtual.passarTurno();
  jogoAtual.logar('Você passou o turno.');
  renderizarMesa();
  if (!jogoAtual.jogoEncerrado && jogoAtual.jogadorAtual().ehCPU) {
    setTimeout(rodarTurnoCPU, 900);
  }
}

// ---------- IA / turno da CPU ----------
function rodarTurnoCPU() {
  if (jogoAtual.jogoEncerrado) return;
  const jogador = jogoAtual.jogadorAtual();
  if (!jogador.ehCPU) { renderizarMesa(); return; }

  // A CPU executa múltiplas ações até não ter mais o que fazer
  let acoesRealizadas = 0;
  const MAX_ACOES = 8; // proteção contra loop infinito

  while (acoesRealizadas < MAX_ACOES && !jogoAtual.jogoEncerrado) {
    const decisao = IA.decidirAcao(jogoAtual, jogador);

    if (decisao.tipo === 'atacar') {
      jogoAtual.executarAtaque(jogador, decisao.carta, decisao.alvo, decisao.cartaAlvo || null);
      acoesRealizadas++;
    } else if (decisao.tipo === 'colocar') {
      // A CPU precisa clonar a instância corretamente
      const instancia = jogador.mao.find(c => c.id === decisao.carta.id || c === decisao.carta);
      if (instancia) {
        jogoAtual.colocarCarta(jogador, instancia);
        jogoAtual.logar(`${jogador.nome} colocou ${instancia.nome} em campo.`);
        acoesRealizadas++;
      } else {
        break;
      }
    } else if (decisao.tipo === 'habilidade') {
      const carta = decisao.carta;
      const hab = decisao.hab;
      const custo = hab.custoMana === 'todas' ? carta.manaMax : hab.custoMana;
      if (carta.mana >= custo) {
        const msgs = executarHabilidade(hab.id, jogoAtual, jogador, carta, decisao.alvo);
        if (hab.custoMana === 'todas') carta.mana = 0;
        else carta.mana -= custo;
        jogoAtual.logar(msgs);
        acoesRealizadas++;
      } else {
        break;
      }
    } else {
      // passou
      jogoAtual.logar(`${jogador.nome} passou o turno.`);
      break;
    }
  }

  renderizarMesa();

  if (jogoAtual.jogoEncerrado) { checarFimDeJogoUI(); return; }

  jogoAtual.passarTurno();
  renderizarMesa();

  if (jogoAtual.jogadorAtual().ehCPU && !jogoAtual.jogoEncerrado) {
    setTimeout(rodarTurnoCPU, 900);
  }
}

function checarFimDeJogoUI() {
  if (!jogoAtual.jogoEncerrado) return;
  pararTimerTurno();
  const overlay = document.getElementById('overlay-fim');
  const titulo = document.getElementById('titulo-fim');
  const texto = document.getElementById('texto-fim');
  const humano = obterJogadorLocal();

  let venceu = false;
  let empate = false;

  if (jogoAtual.vencedor === humano) {
    titulo.textContent = 'Você venceu! 🎓';
    texto.textContent = 'Aprovado com louvor — sobreviveu até o fim da partida.';
    venceu = true;
  } else if (jogoAtual.vencedor) {
    titulo.textContent = `${jogoAtual.vencedor.nome} venceu`;
    texto.textContent = 'Mais sorte na próxima prova.';
  } else {
    titulo.textContent = 'Fim de jogo';
    texto.textContent = 'A partida terminou sem um vencedor claro.';
    empate = true;
  }

  // Recompensa de moedas
  if (typeof concederRecompensaPartida === 'function') {
    concederRecompensaPartida(venceu, empate);
  }

  overlay.style.display = 'flex';
}

// ---------- Inicialização geral do app ----------
window.iniciarJogoApp = function () {
  renderizarGaleria();
  renderizarSlotsBaralho();

  $all('.nav-telas button').forEach(btn => {
    btn.addEventListener('click', () => mostrarTela(btn.dataset.tela));
  });

  $all('.filtros-galeria button').forEach(btn => {
    btn.addEventListener('click', () => {
      filtroGaleriaAtivo = btn.dataset.raridade;
      $all('.filtros-galeria button').forEach(b => b.classList.remove('ativo'));
      btn.classList.add('ativo');
      renderizarGaleria();
    });
  });

  document.getElementById('btn-ir-para-partida').addEventListener('click', configurarPartida);
  document.getElementById('btn-limpar-baralho').addEventListener('click', () => {
    baralhoEmMontagem = [];
    renderizarGaleria();
    renderizarSlotsBaralho();
  });

  $all('.opcao-qtd-jogadores').forEach(btn => {
    btn.addEventListener('click', () => {
      qtdJogadoresSelecionada = parseInt(btn.dataset.qtd, 10);
      $all('.opcao-qtd-jogadores').forEach(b => b.classList.remove('ativo'));
      btn.classList.add('ativo');
    });
  });

  document.getElementById('btn-comecar-partida').addEventListener('click', iniciarPartida);
  document.getElementById('btn-voltar-galeria').addEventListener('click', () => mostrarTela('galeria'));

  document.getElementById('btn-jogar-novamente').addEventListener('click', () => {
    document.getElementById('overlay-fim').style.display = 'none';
    mostrarTela('menu');
  });

  document.getElementById('btn-repetir-tutorial').addEventListener('click', () => {
    document.getElementById('overlay-fim').style.display = 'none';
    mostrarTela('menu');
    // próxima partida vai mostrar tutorial de novo
    localStorage.removeItem(CHAVE_TUTORIAL_VISTO);
  });

  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'btn-tutorial-ingame') {
      repetirTutorial();
    }
  });

  document.getElementById('btn-comecar-menu').addEventListener('click', () => mostrarTela('modo'));

  const btnCoMenu = document.getElementById('btn-colecao-menu');
  if (btnCoMenu) btnCoMenu.addEventListener('click', () => mostrarTela('colecao'));

  const btnModoCPU = document.getElementById('btn-modo-cpu');
  if (btnModoCPU) btnModoCPU.addEventListener('click', () => { modoSelecionado = 'cpu'; mostrarTela('galeria'); });

  const btnModoOnline = document.getElementById('btn-modo-online');
  if (btnModoOnline) btnModoOnline.addEventListener('click', () => { modoSelecionado = 'online'; mostrarTela('online'); });

  // Partículas do menu
  const particlesEl = document.getElementById('menu-particles');
  if (particlesEl) {
    const cores = ['#e04a2f','#2980b9','#8e44ad','#f3d889','#27ae60','#e67e22','#e91e8c'];
    for (let i = 0; i < 40; i++) {
      const p = document.createElement('div');
      p.className = 'menu-particle';
      p.style.left = `${Math.random() * 100}%`;
      p.style.top  = `${20 + Math.random() * 70}%`;
      p.style.setProperty('--dur',   `${3 + Math.random() * 5}s`);
      p.style.setProperty('--delay', `${Math.random() * 5}s`);
      p.style.setProperty('--cor', cores[Math.floor(Math.random() * cores.length)]);
      p.style.width  = `${2 + Math.random() * 4}px`;
      p.style.height = p.style.width;
      particlesEl.appendChild(p);
    }
  }

  mostrarTela('menu');

  // Inicia UI online
  if (typeof iniciarUIOnline === 'function') iniciarUIOnline();
};

// ---------- Tutorial da primeira partida ----------
const CHAVE_TUTORIAL_VISTO = 'me_tutorial_visto_v1';

const PASSOS_TUTORIAL = [
  {
    selector: '#timer-turno-wrap',
    titulo: 'Tempo de ação',
    texto: 'Essa barra mostra quanto tempo falta para sua ação (20 segundos). Cada ação reinicia a contagem; se o tempo acabar sem nenhuma ação, seu turno passa automaticamente.'
  },
  {
    selector: '#mao-do-jogador',
    titulo: 'Sua mão',
    texto: 'Essas são suas cartas na mão. Clique numa carta pra colocá-la em campo — colocar uma carta não gasta o seu turno.'
  },
  {
    selector: '.campo-humano .campo-cartas-jogador',
    titulo: 'Seu campo de batalha',
    texto: 'Cartas em campo só podem atacar a partir do turno seguinte em que entraram. Cada uma tem mana, ATQ e DEF próprios, mostrados nos selos da carta.'
  },
  {
    selector: '#botoes-turno',
    titulo: 'Ações do turno',
    texto: 'Na sua vez, use estes botões: Atacar, Usar habilidade, Definir escudo ou Passar o turno. "Definir escudo" escolhe uma carta para priorizar a defesa — ela vai absorver os ataques que vierem direto contra você, mas fica 2 turnos sem poder atacar. Você pode atacar com mais de uma carta antes de passar.'
  },
  {
    selector: '.linha-jogador-humano .chip-jogador',
    titulo: 'Sua vida',
    texto: 'Acompanhe sua vida aqui. Ao chegar a 0, você é eliminado da partida.'
  },
  {
    selector: '#bonus-ativos-painel',
    titulo: 'Bônus ativos',
    texto: 'Aqui aparecem os bônus de raridade e de equipe que seu baralho atual está recebendo — eles mudam conforme as cartas que você coloca em campo.'
  },
  {
    selector: '#log-jogo',
    titulo: 'Histórico da partida',
    texto: 'Tudo que acontece — ataques, habilidades, dano — fica registrado aqui, em ordem.'
  }
];

function iniciarTutorialSeNecessario() {
  if (localStorage.getItem(CHAVE_TUTORIAL_VISTO) === '1') return;
  mostrarPassoTutorial(0);
}

function repetirTutorial() {
  localStorage.removeItem(CHAVE_TUTORIAL_VISTO);
  mostrarPassoTutorial(0);
}

function mostrarPassoTutorial(indice) {
  removerBalaoTutorial();

  if (indice >= PASSOS_TUTORIAL.length) {
    localStorage.setItem(CHAVE_TUTORIAL_VISTO, '1');
    return;
  }

  const passo = PASSOS_TUTORIAL[indice];
  const alvo = document.querySelector(passo.selector);
  if (!alvo) { mostrarPassoTutorial(indice + 1); return; } // se o elemento não existir, pula o passo

  alvo.classList.add('alvo-tutorial');

  const balao = document.createElement('div');
  balao.className = 'balao-tutorial';
  balao.innerHTML = `
    <div class="balao-tutorial-cabecalho">Como jogar — passo ${indice + 1}/${PASSOS_TUTORIAL.length}</div>
    <h4>${passo.titulo}</h4>
    <p>${passo.texto}</p>
    <div class="balao-tutorial-botoes">
      <button class="btn-secundario" id="btn-pular-tutorial">Pular tutorial</button>
      <button class="btn-acao-grande" id="btn-proximo-tutorial" style="margin-top:0;">${indice === PASSOS_TUTORIAL.length - 1 ? 'Entendi!' : 'Próximo →'}</button>
    </div>
  `;
  document.body.appendChild(balao);

  posicionarBalaoTutorial(balao, alvo);

  document.getElementById('btn-proximo-tutorial').addEventListener('click', () => mostrarPassoTutorial(indice + 1));
  document.getElementById('btn-pular-tutorial').addEventListener('click', () => {
    localStorage.setItem(CHAVE_TUTORIAL_VISTO, '1');
    removerBalaoTutorial();
  });
}

function posicionarBalaoTutorial(balao, alvo) {
  const rectAlvo = alvo.getBoundingClientRect();
  const rectBalao = balao.getBoundingClientRect();

  let topo = rectAlvo.bottom + 14;
  if (topo + rectBalao.height > window.innerHeight - 10) {
    topo = Math.max(10, rectAlvo.top - rectBalao.height - 14);
  }

  let esquerda = rectAlvo.left + rectAlvo.width / 2 - rectBalao.width / 2;
  esquerda = Math.max(10, Math.min(esquerda, window.innerWidth - rectBalao.width - 10));

  balao.style.top = `${topo + window.scrollY}px`;
  balao.style.left = `${esquerda + window.scrollX}px`;
}

function removerBalaoTutorial() {
  document.querySelectorAll('.alvo-tutorial').forEach(el => el.classList.remove('alvo-tutorial'));
  const existente = document.querySelector('.balao-tutorial');
  if (existente) existente.remove();
}
