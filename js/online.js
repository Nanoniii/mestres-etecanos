const FIREBASE_CONFIG = {
  apiKey: "AIzaSyplaceholder",
  databaseURL: "https://multiplayer-test-ff8b2-default-rtdb.firebaseio.com/"
};

let db;

function inicializarFirebase() {
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
    console.log('[Online] Firebase OK');
  } catch (e) {
    console.error('[Online] Firebase erro:', e);
  }
}

// ---------- Estado global ----------
let onlineState = {
  ativo: false,
  salaId: null,
  meuId: null,
  meuNome: null,
  salaRef: null,
  ehDono: false,
  ehRanked: false,
  qtdJogadores: 2,
  listeners: [],
  jogadoresOnline: {},
  estouPronto: false,
};

function gerarCodigoSala() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Antes cada partida online gerava um ID aleatório novo (gerarUidJogador()),
// então mesmo o mesmo jogador "virava outra pessoa" a cada sala. Agora
// usamos o ID persistente do perfil (js/perfil.js) — assim o leaderboard e
// as estatísticas sempre apontam pro mesmo jogador, mesmo trocando de sala.
function gerarUidJogador() {
  return typeof obterJogadorId === 'function'
    ? obterJogadorId()
    : 'j_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ---------- Init UI ----------
function iniciarUIOnline() {
  inicializarFirebase();

  document.querySelectorAll('.opcao-qtd-online').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.opcao-qtd-online').forEach(b => b.classList.remove('ativo'));
      btn.classList.add('ativo');
      onlineState.qtdJogadores = parseInt(btn.dataset.qtd);
    });
  });

  // O nome digitado aqui é só o "rótulo" — o ID de verdade vem do perfil
  // (invisível) e já estava salvo desde a primeira vez que a pessoa jogou.
  const inputNome = document.getElementById('input-nome-jogador');
  if (inputNome && typeof obterNomeJogador === 'function' && obterNomeJogador()) {
    inputNome.value = obterNomeJogador();
  }
  inputNome?.addEventListener('change', () => {
    if (typeof definirNomeJogador === 'function') definirNomeJogador(inputNome.value);
  });

  const el = id => document.getElementById(id);
  el('btn-criar-sala')  ?.addEventListener('click', criarSala);
  el('btn-entrar-sala') ?.addEventListener('click', entrarSala);
  el('btn-iniciar-online')?.addEventListener('click', iniciarPartidaOnline);
  el('btn-sair-sala')   ?.addEventListener('click', sairDaSala);
  el('btn-online-pronto')?.addEventListener('click', marcarPronto);
  el('btn-online-baralho')?.addEventListener('click', irEscolherBaralho);
}

// ---------- Criar Sala ----------
async function criarSala() {
  if (!db) { avisar('Firebase não inicializado.'); return; }
  const nome = document.getElementById('input-nome-jogador').value.trim();
  if (!nome) { avisar('Digite seu nome.'); return; }

  const qtdBtn = document.querySelector('.opcao-qtd-online.ativo');
  onlineState.qtdJogadores = parseInt(qtdBtn?.dataset.qtd || 2);

  const codigo = gerarCodigoSala();
  const meuId  = gerarUidJogador();
  const salaRef = db.ref('rooms/' + codigo);

  Object.assign(onlineState, { salaId: codigo, meuId, meuNome: nome, salaRef, ehDono: true, ehRanked: false, estouPronto: false });

  try {
    await salaRef.set({
      status: 'aguardando',
      dono: meuId,
      qtdMaxima: onlineState.qtdJogadores,
      jogadores: { [meuId]: { nome, indice: 0, pronto: false } },
      acoes: {}
    });
    salaRef.child('jogadores/' + meuId).onDisconnect().remove();
    mostrarEsperaSala(codigo);
    escutarSala();
  } catch (e) {
    avisar('Erro ao criar sala: ' + e.message);
  }
}

// ---------- Entrar em Sala ----------
async function entrarSala() {
  if (!db) { avisar('Firebase não inicializado.'); return; }
  const nome   = document.getElementById('input-nome-jogador').value.trim();
  const codigo = document.getElementById('input-codigo-sala').value.trim().toUpperCase();
  if (!nome)          { avisar('Digite seu nome.');             return; }
  if (codigo.length < 4) { avisar('Digite o código da sala.'); return; }

  try {
    const salaRef = db.ref('rooms/' + codigo);
    const snap    = await salaRef.get();
    if (!snap.exists())           { avisar('Sala não encontrada.'); return; }
    const sala = snap.val();
    if (sala.status !== 'aguardando') { avisar('Sala já em partida ou encerrada.'); return; }
    const atual = Object.keys(sala.jogadores || {}).length;
    if (atual >= sala.qtdMaxima)  { avisar('Sala cheia!'); return; }

    const meuId = gerarUidJogador();
    // Aviso educativo: como o ID do jogador vem do localStorage (sem login
    // real), abrir a sala em duas abas do MESMO navegador faz as duas abas
    // serem "a mesma pessoa" pro jogo — elas vão disputar o mesmo perfil e
    // sobrescrever as estatísticas uma da outra. Pra testar com 2 jogadores
    // de verdade, use uma aba anônima/outro navegador/outro aparelho.
    if (sala.jogadores && sala.jogadores[meuId]) {
      avisar('⚠ Esse navegador já está nessa sala (mesmo perfil do dono). Use uma aba anônima ou outro aparelho pra testar com 2 jogadores reais.');
    }
    await salaRef.child('jogadores/' + meuId).set({ nome, indice: atual, pronto: false });

    Object.assign(onlineState, {
      salaId: codigo, meuId, meuNome: nome, salaRef,
      ehDono: false, ehRanked: false, qtdJogadores: sala.qtdMaxima, estouPronto: false
    });
    salaRef.child('jogadores/' + meuId).onDisconnect().remove();
    mostrarEsperaSala(codigo);
    escutarSala();
  } catch (e) {
    avisar('Erro ao entrar na sala: ' + e.message);
  }
}

// ---------- Tela de espera ----------
function mostrarEsperaSala(codigo) {
  document.getElementById('sala-codigo-display').textContent = codigo;
  document.getElementById('online-sala-espera').style.display = 'block';
  document.querySelector('.online-form').style.display = 'none';
  const banner = document.getElementById('online-ranked-banner');
  const blocoCodigo = document.getElementById('sala-codigo-bloco');
  if (banner) banner.style.display = onlineState.ehRanked ? 'block' : 'none';
  // Numa sala ranqueada o código não importa (foi o matchmaking que parou,
  // não a digitação de um código), então escondemos pra não confundir.
  if (blocoCodigo) blocoCodigo.style.display = onlineState.ehRanked ? 'none' : 'block';
}

function atualizarListaJogadores(jogadores, qtdMaxima) {
  const lista      = document.getElementById('sala-jogadores-lista');
  const statusMsg  = document.getElementById('online-status-msg');
  const btnIniciar = document.getElementById('btn-iniciar-online');
  const btnPronto  = document.getElementById('btn-online-pronto');
  if (!lista) return;

  lista.innerHTML = '';
  const entries = Object.entries(jogadores || {}).sort((a,b) => a[1].indice - b[1].indice);

  entries.forEach(([id, j]) => {
    const sou = id === onlineState.meuId;
    const item = document.createElement('div');
    item.className = 'sala-jogador-item';
    item.innerHTML = `
      <span class="sala-jogador-nome">${sou ? '★ ' : ''}${j.nome}</span>
      <span class="sala-jogador-status">${j.pronto ? '✅ Pronto' : '⏳ Escolhendo baralho'}</span>`;
    lista.appendChild(item);
  });

  for (let i = entries.length; i < qtdMaxima; i++) {
    const item = document.createElement('div');
    item.className = 'sala-jogador-item vazio';
    item.innerHTML = `<span class="sala-jogador-nome" style="opacity:.4">Slot ${i+1} — Aguardando...</span>`;
    lista.appendChild(item);
  }

  const total  = entries.length;
  const prontos = entries.filter(([,j]) => j.pronto).length;
  const meuStatus = (jogadores || {})[onlineState.meuId];
  const jaPronto  = meuStatus?.pronto || false;

  if (statusMsg) statusMsg.textContent = `${total}/${qtdMaxima} conectado(s) · ${prontos}/${total} pronto(s)`;

  // Botão "Pronto" — visível pra todos, muda texto conforme estado
  if (btnPronto) {
    btnPronto.style.display = '';
    if (jaPronto) {
      btnPronto.textContent = '✅ Pronto! (clique pra desfazer)';
      btnPronto.style.opacity = '0.7';
    } else {
      btnPronto.textContent = '✔ Estou pronto';
      btnPronto.style.opacity = '1';
    }
  }

  // Botão iniciar — só pro dono, só quando todos prontos
  if (btnIniciar) {
    if (onlineState.ehDono) {
      const todosConectados = total >= qtdMaxima;
      const todosProntos    = prontos >= total && total > 0;
      btnIniciar.style.display = '';
      btnIniciar.disabled = !(todosConectados && todosProntos);
      btnIniciar.textContent = !todosConectados
        ? `Aguardando jogadores (${total}/${qtdMaxima})`
        : !todosProntos
          ? `Aguardando prontos (${prontos}/${total})`
          : 'Iniciar Partida ⚔';
    } else {
      btnIniciar.style.display = 'none';
    }
  }
}

// ---------- Ir escolher baralho (sem sair da sala) ----------
function irEscolherBaralho() {
  // Vai pra galeria mas mantém o estado online ativo
  // Um banner vai aparecer na galeria lembrando de voltar
  mostrarTela('galeria');
  // Mesma correção do modo ranked: recalcula a visibilidade do botão
  // "Ir para a partida →" (fluxo CPU), que precisa ficar escondido aqui.
  if (typeof renderizarSlotsBaralho === 'function') renderizarSlotsBaralho();
  // Injeta aviso na tela de galeria
  setTimeout(() => {
    const painel = document.querySelector('.painel-baralho');
    if (painel && !document.getElementById('online-baralho-aviso')) {
      const aviso = document.createElement('div');
      aviso.id = 'online-baralho-aviso';
      aviso.style.cssText = 'background:rgba(41,128,185,0.15);border:1px solid rgba(41,128,185,0.4);color:#7ec8e3;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:14px;';
      aviso.innerHTML = `🌐 Modo Online — Monte seu baralho e clique <strong>"Estou pronto"</strong> no botão abaixo para confirmar.
        <br><br><button class="btn-acao-grande" style="margin-top:8px;background:linear-gradient(135deg,#1565c0,#0d47a1);" onclick="marcarPronto(); mostrarTela('online');">✔ Estou pronto — confirmar baralho</button>`;
      painel.insertBefore(aviso, painel.firstChild);
    }
  }, 100);
}

// ---------- Marcar pronto ----------
async function marcarPronto() {
  if (!onlineState.salaRef || !onlineState.meuId) return;

  // Verifica se tem baralho montado
  if (typeof baralhoEmMontagem === 'undefined' || baralhoEmMontagem.length === 0) {
    avisar('Monte um baralho antes de marcar pronto!');
    irEscolherBaralho();
    return;
  }

  onlineState.estouPronto = !onlineState.estouPronto;

  // Salva o baralho escolhido no Firebase para o dono montar o jogo
  const baralhoIds = onlineState.estouPronto ? baralhoEmMontagem : [];
  await onlineState.salaRef.child('jogadores/' + onlineState.meuId).update({
    pronto: onlineState.estouPronto,
    baralho: baralhoIds
  });

  // Volta pra tela de espera caso esteja na galeria
  mostrarTela('online');
}

// ---------- Escutar sala ----------
function escutarSala() {
  const salaRef = onlineState.salaRef;

  const refJog = salaRef.child('jogadores');
  const lJog = refJog.on('value', snap => {
    onlineState.jogadoresOnline = snap.val() || {};
    salaRef.child('qtdMaxima').get().then(s => {
      atualizarListaJogadores(onlineState.jogadoresOnline, s.val() || onlineState.qtdJogadores);
    });
  });

  // BUG CORRIGIDO (leaderboard): antes escutávamos apenas o nó filho 'status'.
  // Quando o dono faz salaRef.update({ status:'emjogo', estadoJogo:... }), o
  // Firebase pode disparar o evento de 'status' no convidado ANTES do campo
  // 'estadoJogo' (com os pontosAntes de cada jogador) ter chegado. O
  // salaRef.get() subsequente então lia um snapshot sem estadoJogo, fazendo
  // pontosAntesRanked ficar null — o ELO era calculado com 1000 pontos de base
  // e o resultado podia não ser salvo corretamente no leaderboard.
  // FIX: escutamos a sala INTEIRA com on('value'). Quando o status for 'emjogo',
  // só entramos na partida se estadoJogo já estiver presente no snapshot —
  // garantindo que os dados de ambos os jogadores (incluindo pontosAntes) estão
  // completos antes de iniciar a partida e calcular o ELO ao final.
  const lStatus = salaRef.on('value', snap => {
    const sala = snap.val();
    if (sala && sala.status === 'emjogo' && sala.estadoJogo) {
      entrarNaPartidaOnline(sala);
    }
  });

  onlineState.listeners.push(
    { ref: refJog,  listener: lJog,    tipo: 'value' },
    { ref: salaRef, listener: lStatus, tipo: 'value' }
  );
}

// ---------- Iniciar partida (só dono) ----------
async function iniciarPartidaOnline() {
  if (!onlineState.ehDono || !onlineState.salaRef) return;

  const entries = Object.entries(onlineState.jogadoresOnline)
    .sort((a,b) => a[1].indice - b[1].indice);

  const estadoInicial = {
    turnoIndex: Math.floor(Math.random() * entries.length),
    jogadores: {}
  };
  entries.forEach(([id, j]) => {
    estadoInicial.jogadores[id] = {
      nome:    j.nome,
      indice:  j.indice,
      baralho: j.baralho || [],   // baralho que cada um escolheu
      pontosAntes: j.pontosAntes ?? null // só existe em partidas ranqueadas
    };
  });

  await onlineState.salaRef.update({ status: 'emjogo', ranked: onlineState.ehRanked, estadoJogo: estadoInicial });
}

// ---------- Entrar na partida ----------
function entrarNaPartidaOnline(dadosSala) {
  desligarListeners();
  onlineState.ativo = true;

  const estadoJogadores = dadosSala.estadoJogo?.jogadores || {};
  const entries = Object.entries(estadoJogadores).sort((a,b) => a[1].indice - b[1].indice);

  const jogadores = entries.map(([id, j]) => {
    const ehEu = id === onlineState.meuId;
    const jog  = new Jogador(j.nome, !ehEu);
    jog.onlineId = id;
    jog.pontosAntesRanked = j.pontosAntes ?? null;

    if (ehEu) {
      // USA o baralho que o jogador montou localmente (já está em baralhoEmMontagem)
      if (typeof baralhoEmMontagem !== 'undefined' && baralhoEmMontagem.length > 0) {
        jog.baralho = baralhoEmMontagem.map(cid => buscarCartaPorId(cid));
      } else if (j.baralho && j.baralho.length > 0) {
        // Fallback: usa o que veio do Firebase
        jog.baralho = j.baralho.map(cid => buscarCartaPorId(cid)).filter(Boolean);
      } else {
        jog.baralho = sortearBaralhoCPU();
      }
    } else {
      // Oponente: usa o baralho dele salvo no Firebase
      if (j.baralho && j.baralho.length > 0) {
        jog.baralho = j.baralho.map(cid => buscarCartaPorId(cid)).filter(Boolean);
      } else {
        jog.baralho = sortearBaralhoCPU();
      }
    }

    const maoInicial = jog.baralho.slice(0, Math.min(LIMITE_CAMPO, jog.baralho.length));
    jog.mao = maoInicial.map(clonarCartaBase);
    // Oponentes online NÃO são CPU — desliga IA
    jog.ehCPU = false;
    return jog;
  });

  jogoAtual = new EstadoJogo(jogadores);
  jogoAtual.turnoIndice = dadosSala.estadoJogo?.turnoIndex ?? 0;
  jogoAtual.modoOnline  = true;
  jogoAtual.modoRanked  = dadosSala.ranked === true;
  jogoAtual.salaRef     = onlineState.salaRef;
  jogoAtual.meuOnlineId = onlineState.meuId;

  jogoAtual.logar(jogoAtual.modoRanked ? 'Partida ranqueada iniciada! Boa sorte, mestres.' : 'Partida online iniciada! Boa sorte, mestres.');

  document.getElementById('painel-online-status').style.display = 'block';
  const tituloPainel = document.getElementById('painel-online-titulo');
  if (tituloPainel) tituloPainel.textContent = jogoAtual.modoRanked ? '🏆 Partida Ranqueada' : '🌐 Sala Online';
  mostrarTela('mesa');
  renderizarMesa();
  atualizarStatusOnlineLateral();
  escutarAcoesOnline();
  iniciarTutorialSeNecessario();
  // Sem CPU — não chama rodarTurnoCPU
}

// ---------- Escutar ações ----------
function escutarAcoesOnline() {
  if (!onlineState.salaRef) return;
  const refAcoes = onlineState.salaRef.child('acoes');
  const listener = refAcoes.on('child_added', snap => {
    const acao = snap.val();
    if (!acao || acao.autorId === onlineState.meuId) return;
    aplicarAcaoOnline(acao);
  });
  onlineState.listeners.push({ ref: refAcoes, listener, tipo: 'child_added' });
}

function aplicarAcaoOnline(acao) {
  if (!jogoAtual) return;
  const { tipo, dadosTurno } = acao;

  if (tipo === 'passarTurno') {
    jogoAtual.passarTurno();
    jogoAtual.logar(`${acao.nomeJogador} passou o turno.`);
  } else if (tipo === 'colocarCarta') {
    const jog = jogoAtual.jogadores.find(j => j.onlineId === acao.autorId);
    if (jog) {
      const carta = clonarCartaBase(buscarCartaPorId(dadosTurno.cartaId));
      carta.uid = dadosTurno.uid;
      jog.campo.push(carta);
      jog.mao = jog.mao.filter(c => c.uid !== dadosTurno.uid);
      jogoAtual.logar(`${acao.nomeJogador} colocou ${carta.nome} em campo.`);
    }
  } else if (tipo === 'ataque') {
    const atacante = jogoAtual.jogadores.find(j => j.onlineId === acao.autorId);
    const alvoJog  = jogoAtual.jogadores.find(j => j.onlineId === dadosTurno.alvoJogadorId);
    if (atacante && alvoJog) {
      const cartaAtk  = atacante.campo.find(c => c.uid === dadosTurno.cartaAtacanteUid);
      const cartaAlvo = dadosTurno.cartaAlvoUid
        ? alvoJog.campo.find(c => c.uid === dadosTurno.cartaAlvoUid) : null;
      if (cartaAtk) jogoAtual.executarAtaque(atacante, cartaAtk, alvoJog, cartaAlvo);
    }
  } else if (tipo === 'habilidade') {
    const jog = jogoAtual.jogadores.find(j => j.onlineId === acao.autorId);
    if (jog) {
      const carta = jog.campo.find(c => c.uid === dadosTurno.cartaUid);
      let alvo = null;
      if (dadosTurno.alvoUid) {
        alvo = jogoAtual.jogadores.flatMap(j => j.campo).find(c => c.uid === dadosTurno.alvoUid);
      } else if (dadosTurno.alvoJogadorId) {
        alvo = jogoAtual.jogadores.find(j => j.onlineId === dadosTurno.alvoJogadorId);
      }
      if (carta && typeof executarHabilidade === 'function') {
        const msgs = executarHabilidade(dadosTurno.habId, jogoAtual, jog, carta, alvo);
        jogoAtual.logar(msgs);
      }
    }
  } else if (tipo === 'definirEscudo') {
    const jog = jogoAtual.jogadores.find(j => j.onlineId === acao.autorId);
    if (jog) {
      const carta = jog.campo.find(c => c.uid === dadosTurno.cartaUid);
      if (carta) jogoAtual.definirEscudo(jog, carta);
    }
  }

  renderizarMesa();
  atualizarStatusOnlineLateral();
  checarFimDeJogoUI();
}

function publicarAcaoOnline(tipo, dadosTurno) {
  if (!onlineState.salaRef) return;
  onlineState.salaRef.child('acoes').push({
    autorId: onlineState.meuId,
    nomeJogador: onlineState.meuNome,
    tipo,
    dadosTurno: dadosTurno || {},
    ts: Date.now()
  });
}

function atualizarStatusOnlineLateral() {
  const painel = document.getElementById('online-jogadores-status');
  if (!painel || !jogoAtual) return;
  const atual = jogoAtual.jogadorAtual();
  painel.innerHTML = jogoAtual.jogadores.map(j =>
    `<div style="margin:4px 0;${j===atual?'color:var(--giz-dourado-forte);font-weight:700;':''}">
      ${j.onlineId === onlineState.meuId ? '★ ' : ''}${j.nome}: ❤ ${j.vida}
      ${j===atual?' ← vez':''}${!j.vivo?' 💀':''}
    </div>`
  ).join('');
}

// ---------- Sair da sala ----------
function sairDaSala() {
  if (onlineState.salaRef && onlineState.meuId)
    onlineState.salaRef.child('jogadores/' + onlineState.meuId).remove();
  desligarListeners();
  document.getElementById('online-sala-espera').style.display = 'none';
  document.querySelector('.online-form').style.display = '';
  onlineState = {
    ativo:false, salaId:null, meuId:null, meuNome:null,
    salaRef:null, ehDono:false, ehRanked:false, qtdJogadores:2,
    listeners:[], jogadoresOnline:{}, estouPronto:false
  };
}

function desligarListeners() {
  onlineState.listeners.forEach(({ref,listener,tipo}) => ref.off(tipo,listener));
  onlineState.listeners = [];
}

window.publicarAcaoOnline           = publicarAcaoOnline;
window.atualizarStatusOnlineLateral = atualizarStatusOnlineLateral;
window.iniciarUIOnline              = iniciarUIOnline;
window.marcarPronto                 = marcarPronto;
window.irEscolherBaralho            = irEscolherBaralho;
window.onlineState                  = onlineState;