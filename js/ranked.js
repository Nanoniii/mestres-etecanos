// =====================================================
// MESTRES ETECANOS - Ranqueada (matchmaking) + Leaderboard
// =====================================================
// Como funciona o matchmaking sem servidor próprio (só Firebase RTDB):
// 1. Cada jogador que clica em "Buscar partida" escreve um registro seu
//    em filaRanked/{meuId} com {nome, pontos, ts}.
// 2. Todo mundo na fila escuta a lista inteira. Quando o jogador MAIS
//    ANTIGO da fila vê que já tem outro jogador esperando, ele mesmo
//    (só ele) tenta "reservar" o adversário com pontuação mais próxima
//    usando uma transação atômica do Firebase — isso evita que dois
//    jogadores acabem sendo pareados duas vezes ao mesmo tempo.
// 3. Quem reservou cria a sala (mesma estrutura usada no Online comum)
//    e avisa o adversário por filaRankedConvite/{idDoAdversario}.
// 4. Dali em diante é o MESMO fluxo de sala online já existente
//    (escolher baralho, marcar pronto, iniciar) — só com a flag
//    ranked:true e os pontos "antes" salvos pra calcular o ELO no fim.

const FILA_RANKED_PATH    = 'filaRanked';
const CONVITE_RANKED_PATH = 'filaRankedConvite';

let rankedState = {
  naFila: false,
  pareando: false,
  meuId: null,
  meuNome: null,
  meusPontos: PONTOS_RANKED_INICIAIS,
  listenerFila: null,
  listenerConvite: null,
};

function iniciarUIRanked() {
  document.getElementById('btn-buscar-ranked')  ?.addEventListener('click', entrarFilaRanked);
  document.getElementById('btn-cancelar-fila')  ?.addEventListener('click', sairFilaRanked);
  document.getElementById('btn-leaderboard-modo')?.addEventListener('click', () => {
    mostrarTela('leaderboard');
    carregarLeaderboard();
  });
}

// ---------- Entrar na fila ----------
async function entrarFilaRanked() {
  if (typeof db === 'undefined' || !db) { avisar('Firebase não inicializado.'); return; }

  if (!temNomeDefinido()) {
    avisar('Defina seu nome no Perfil antes de jogar ranqueada.');
    mostrarTela('perfil');
    renderizarPerfilUI();
    return;
  }
  if (typeof baralhoEmMontagem === 'undefined' || baralhoEmMontagem.length === 0) {
    avisar('Monte um baralho antes de entrar na fila ranqueada!');
    // BUG CORRIGIDO: antes, isso só mandava pra Galeria com um toast que
    // desaparece em poucos segundos — e a Galeria é a MESMA tela usada pelo
    // modo "Jogar vs CPU", sem nenhum aviso nem botão de volta pra fila
    // ranqueada. Resultado: a pessoa montava o baralho normalmente e clicava
    // em "Ir para a partida →", caindo direto na tela de escolher CPUs em
    // vez de voltar pra fila e esperar um adversário real. Agora marcamos
    // que viemos do fluxo ranked e mostramos um banner fixo na Galeria com
    // um botão que volta direto pra fila, sem nunca passar pelo fluxo de CPU.
    irEscolherBaralhoRanked();
    return;
  }

  const perfil = obterPerfilCompleto();
  rankedState.meuId      = perfil.id;
  rankedState.meuNome    = perfil.nome;
  rankedState.meusPontos = perfil.pontosRanked;
  rankedState.naFila      = true;
  rankedState.pareando    = false;

  mostrarTelaBuscaRanked();

  try {
    await db.ref(`${FILA_RANKED_PATH}/${perfil.id}`).set({
      nome: perfil.nome,
      pontos: perfil.pontosRanked,
      ts: firebase.database.ServerValue.TIMESTAMP
    });
    db.ref(`${FILA_RANKED_PATH}/${perfil.id}`).onDisconnect().remove();
    escutarFilaRanked();
    escutarConviteRanked();
  } catch (e) {
    avisar('Erro ao entrar na fila: ' + e.message);
    rankedState.naFila = false;
  }
}

function mostrarTelaBuscaRanked() {
  mostrarTela('ranked-busca');
  const status = document.getElementById('ranked-busca-status');
  if (status) status.textContent = 'Procurando um adversário com pontuação parecida com a sua...';
}

// ---------- Ir escolher baralho a partir do fluxo ranked (sem cair no CPU) ----------
function irEscolherBaralhoRanked() {
  mostrarTela('galeria');
  // Recalcula a visibilidade do botão "Ir para a partida →" (fluxo CPU)
  // agora que modoSelecionado já está em 'ranked' — ele precisa ficar
  // escondido enquanto estivermos montando baralho pra fila ranqueada.
  if (typeof renderizarSlotsBaralho === 'function') renderizarSlotsBaralho();
  // Injeta aviso na tela de galeria, igual ao modo online comum, mas
  // levando de volta pra fila ranqueada (entrarFilaRanked) em vez do menu.
  setTimeout(() => {
    const painel = document.querySelector('.painel-baralho');
    if (painel && !document.getElementById('ranked-baralho-aviso')) {
      const aviso = document.createElement('div');
      aviso.id = 'ranked-baralho-aviso';
      aviso.style.cssText = 'background:rgba(255,179,0,0.15);border:1px solid rgba(255,179,0,0.4);color:#ffd56a;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:14px;';
      aviso.innerHTML = `🏆 Fila Ranqueada — Monte seu baralho e clique abaixo para voltar a procurar um adversário.
        <br><br><button class="btn-acao-grande" style="margin-top:8px;background:linear-gradient(135deg,#c9971f,#8a6510);" onclick="document.getElementById('ranked-baralho-aviso').remove(); entrarFilaRanked();">⚔ Voltar para a fila ranqueada</button>`;
      painel.insertBefore(aviso, painel.firstChild);
    }
  }, 100);
}

// Remove o banner de aviso da Galeria, se existir (ex: ao desistir e ir pro menu)
function removerAvisoBaralhoRanked() {
  document.getElementById('ranked-baralho-aviso')?.remove();
}

// ---------- Escuta a fila inteira pra tentar parear ----------
function escutarFilaRanked() {
  const ref = db.ref(FILA_RANKED_PATH);
  const listener = ref.on('value', snap => tentarParear(snap.val() || {}));
  rankedState.listenerFila = { ref, listener };
}

function escutarConviteRanked() {
  const ref = db.ref(`${CONVITE_RANKED_PATH}/${rankedState.meuId}`);
  const listener = ref.on('value', snap => {
    const convite = snap.val();
    if (convite && convite.sala) {
      ref.remove();
      entrarSalaComoConvidadoRanked(convite.sala);
    }
  });
  rankedState.listenerConvite = { ref, listener };
}

// ---------- Tenta formar uma partida ----------
async function tentarParear(filaAtual) {
  if (!rankedState.naFila || rankedState.pareando) return;
  if (!filaAtual[rankedState.meuId]) return; // já fui removido (alguém me pareou) ou ainda nem entrei

  const entradas = Object.entries(filaAtual).sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
  if (entradas.length < 2) return;

  // Só o jogador mais antigo da fila tenta iniciar o pareamento — evita
  // que vários clientes tentem montar partidas ao mesmo tempo.
  const souOMaisAntigo = entradas[0][0] === rankedState.meuId;
  if (!souOMaisAntigo) return;

  const candidatos = entradas
    .filter(([id]) => id !== rankedState.meuId)
    .sort((a, b) => Math.abs(a[1].pontos - rankedState.meusPontos) - Math.abs(b[1].pontos - rankedState.meusPontos));

  const [idAdversario, dadosAdversario] = candidatos[0];

  // Mesmo aviso educativo do modo online comum: se o "adversário" pareado
  // tem o mesmo ID que eu, é o mesmo navegador/perfil em outra aba — não
  // duas pessoas reais. Isso faz as estatísticas de vitória/derrota se
  // sobrescreverem no mesmo nó do Firebase.
  if (idAdversario === rankedState.meuId) {
    avisar('⚠ Você foi pareado com o mesmo perfil (mesmo navegador). Use uma aba anônima ou outro aparelho pra testar com 2 jogadores reais.');
  }

  rankedState.pareando = true;
  try {
    // Reserva atômica do adversário: só "ganha" quem conseguir apagar o nó
    // dele primeiro. Se outro cliente já apagou, a transação não comita.
    const resultado = await db.ref(`${FILA_RANKED_PATH}/${idAdversario}`).transaction(
      atual => (atual === null ? undefined : null)
    );
    if (!resultado.committed) { rankedState.pareando = false; return; }

    await db.ref(`${FILA_RANKED_PATH}/${rankedState.meuId}`).remove();
    pararListenersRanked();

    const codigo = gerarCodigoSala();
    const salaRef = db.ref('rooms/' + codigo);
    await salaRef.set({
      status: 'aguardando',
      dono: rankedState.meuId,
      qtdMaxima: 2,
      ranked: true,
      jogadores: {
        [rankedState.meuId]: { nome: rankedState.meuNome, indice: 0, pronto: false, pontosAntes: rankedState.meusPontos },
        [idAdversario]:      { nome: dadosAdversario.nome, indice: 1, pronto: false, pontosAntes: dadosAdversario.pontos }
      },
      acoes: {}
    });
    salaRef.child('jogadores/' + rankedState.meuId).onDisconnect().remove();

    Object.assign(onlineState, {
      salaId: codigo, meuId: rankedState.meuId, meuNome: rankedState.meuNome,
      salaRef, ehDono: true, qtdJogadores: 2, estouPronto: false, ehRanked: true
    });

    await db.ref(`${CONVITE_RANKED_PATH}/${idAdversario}`).set({ sala: codigo });

    entrarNaSalaDeEsperaRanked(codigo);
  } catch (e) {
    console.error('[Ranked] Erro ao parear:', e);
    rankedState.pareando = false;
  }
}

function entrarSalaComoConvidadoRanked(codigo) {
  pararListenersRanked();
  const salaRef = db.ref('rooms/' + codigo);
  Object.assign(onlineState, {
    salaId: codigo, meuId: rankedState.meuId, meuNome: rankedState.meuNome,
    salaRef, ehDono: false, qtdJogadores: 2, estouPronto: false, ehRanked: true
  });
  salaRef.child('jogadores/' + rankedState.meuId).onDisconnect().remove();
  entrarNaSalaDeEsperaRanked(codigo);
}

function entrarNaSalaDeEsperaRanked(codigo) {
  rankedState.naFila = false;
  removerAvisoBaralhoRanked();
  mostrarTela('online');
  mostrarEsperaSala(codigo);
  escutarSala();
  const banner = document.getElementById('online-ranked-banner');
  if (banner) banner.style.display = 'block';
}

// ---------- Cancelar busca ----------
function sairFilaRanked() {
  if (rankedState.meuId) db.ref(`${FILA_RANKED_PATH}/${rankedState.meuId}`).remove();
  pararListenersRanked();
  rankedState.naFila = false;
  removerAvisoBaralhoRanked();
  mostrarTela('modo');
}

function pararListenersRanked() {
  if (rankedState.listenerFila)    rankedState.listenerFila.ref.off('value', rankedState.listenerFila.listener);
  if (rankedState.listenerConvite) rankedState.listenerConvite.ref.off('value', rankedState.listenerConvite.listener);
  rankedState.listenerFila = null;
  rankedState.listenerConvite = null;
}

// =====================================================
// Leaderboard
// =====================================================
async function carregarLeaderboard() {
  const lista = document.getElementById('leaderboard-lista');
  if (!lista) return;
  lista.innerHTML = '<p style="text-align:center;color:var(--texto-suave);">Carregando...</p>';

  if (typeof db === 'undefined' || !db) {
    lista.innerHTML = '<p style="text-align:center;color:var(--texto-suave);">Firebase não inicializado.</p>';
    return;
  }

  try {
    // Exige o índice "pontosRanked" nas regras do Firebase (veja instruções).
    const snap = await db.ref('jogadores').orderByChild('pontosRanked').limitToLast(50).get();
    const jogadores = [];
    snap.forEach(filho => jogadores.push({ id: filho.key, ...filho.val() }));
    jogadores.sort((a, b) => (b.pontosRanked || 0) - (a.pontosRanked || 0));

    if (jogadores.length === 0) {
      lista.innerHTML = '<p style="text-align:center;color:var(--texto-suave);">Ninguém jogou ranqueada ainda. Seja o primeiro!</p>';
      return;
    }

    const meuId = obterJogadorId();
    lista.innerHTML = jogadores.map((j, i) => {
      const souEu = j.id === meuId;
      const faixa = faixaRanked(j.pontosRanked || 0);
      const posicao = i + 1;
      const medalha = posicao === 1 ? '🥇' : posicao === 2 ? '🥈' : posicao === 3 ? '🥉' : `#${posicao}`;
      return `
        <div class="leaderboard-linha${souEu ? ' leaderboard-linha-eu' : ''}">
          <span class="leaderboard-posicao">${medalha}</span>
          <span class="leaderboard-nome">${souEu ? '★ ' : ''}${escaparHtml(j.nome || 'Sem nome')}</span>
          <span class="leaderboard-faixa" style="color:${faixa.cor};">${faixa.nome}</span>
          <span class="leaderboard-pontos">${j.pontosRanked || 0} pts</span>
          <span class="leaderboard-record">${j.vitoriasRanked || 0}V / ${j.derrotasRanked || 0}D</span>
        </div>`;
    }).join('');
  } catch (e) {
    lista.innerHTML = `<p style="text-align:center;color:#ffb3a3;">Erro ao carregar: ${escaparHtml(e.message)}</p>`;
  }
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

window.iniciarUIRanked   = iniciarUIRanked;
window.carregarLeaderboard = carregarLeaderboard;
window.entrarFilaRanked  = entrarFilaRanked;
window.removerAvisoBaralhoRanked = removerAvisoBaralhoRanked;
