// =====================================================
// MESTRES ETECANOS - Perfil do Jogador (identidade + stats)
// =====================================================
// MÉTODO DE IDENTIDADE (sem login, sem senha):
// Na primeira vez que a pessoa abre o jogo, geramos um ID aleatório
// (tipo "p_8f3a...") e guardamos ele no localStorage do navegador.
// Esse ID nunca aparece pra ninguém — é só o "RG" interno do jogador.
// O que aparece no jogo, no leaderboard e pros amigos é só o NICK,
// que a pessoa digita normalmente (e pode trocar quando quiser).
// Duas pessoas podem ter o mesmo nick sem problema: o ranking e as
// estatísticas são sempre amarradas ao ID, não ao texto do nome.
//
// Furo conhecido (e assumido): se a pessoa limpar os dados do navegador
// ou jogar de outro aparelho, o jogo não tem como saber que é "a mesma
// pessoa" — ela vira um perfil novo. Pra esse jogo (grupo fechado, sem
// dinheiro real envolvido) isso é um ônibus perdido, não uma catástrofe.

const CHAVE_PERFIL_ID    = 'me_perfil_id_v1';
const CHAVE_PERFIL_NOME  = 'me_perfil_nome_v1';
const CHAVE_PERFIL_STATS = 'me_perfil_stats_v1';

const PONTOS_RANKED_INICIAIS = 1000;
const ELO_K = 32;

function statsPerfilPadrao() {
  return {
    partidas: 0,
    vitorias: 0,
    derrotas: 0,
    partidasRanked: 0,
    vitoriasRanked: 0,
    derrotasRanked: 0,
    pontosRanked: PONTOS_RANKED_INICIAIS,
    sequenciaAtual: 0,
    maiorSequencia: 0,
    usoCartas: {},          // { idCarta: quantasVezesFoiColocadaEmCampo }
    primeiraCarta: null,    // { id, nome, dataISO }
  };
}

// ---------- ID anônimo persistente ----------
function gerarIdAleatorio() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return 'p_' + window.crypto.randomUUID();
  }
  return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function obterJogadorId() {
  let id = localStorage.getItem(CHAVE_PERFIL_ID);
  if (!id) {
    id = gerarIdAleatorio();
    localStorage.setItem(CHAVE_PERFIL_ID, id);
  }
  return id;
}

// ---------- Nick (visível, editável, não-exclusivo) ----------
function obterNomeJogador() {
  return (localStorage.getItem(CHAVE_PERFIL_NOME) || '').trim();
}

function temNomeDefinido() {
  return obterNomeJogador().length > 0;
}

function definirNomeJogador(nomeBruto) {
  const nome = (nomeBruto || '').trim().slice(0, 20);
  if (!nome) return false;
  localStorage.setItem(CHAVE_PERFIL_NOME, nome);
  sincronizarPerfilFirebase(); // mantém o leaderboard com o nick atualizado
  return true;
}

// ---------- Estatísticas ----------
function obterStatsPerfil() {
  try {
    const raw = JSON.parse(localStorage.getItem(CHAVE_PERFIL_STATS) || 'null');
    if (!raw) return statsPerfilPadrao();
    // mescla com o padrão pra nunca faltar campo em perfis antigos
    return Object.assign(statsPerfilPadrao(), raw, { usoCartas: raw.usoCartas || {} });
  } catch {
    return statsPerfilPadrao();
  }
}

function salvarStatsPerfil(stats) {
  localStorage.setItem(CHAVE_PERFIL_STATS, JSON.stringify(stats));
}

function obterPerfilCompleto() {
  return Object.assign({ id: obterJogadorId(), nome: obterNomeJogador() }, obterStatsPerfil());
}

// Faixas de "patente" pelo tanto de pontos ranqueados (cosmético, tema escola)
// As 8 primeiras são alcançadas só com pontos. A última, "Mestre Etecano",
// é exclusiva: só quem está em 1º lugar no leaderboard geral a possui,
// não importa quantos pontos os outros tenham (ver faixaExibida()).
const FAIXAS_RANKED = [
  { min: 0,    nome: 'Estudante',              cor: '#9e9e9e' },
  { min: 1040,  nome: 'Representante',          cor: '#2f9e1f' },
  { min: 1100,  nome: 'Presidente do Conselho',  cor: '#1fa67a' },
  { min: 1140, nome: 'Zelador',                 cor: '#0096fa' },
  { min: 1200, nome: 'Monitor(a)',              cor: '#5566ff' },
  { min: 1240, nome: 'Professor(a)',            cor: '#a259ff' },
  { min: 1300, nome: 'Coordenador(a)',          cor: '#ff8a00' },
  { min: 1450, nome: 'Diretor(a)',              cor: '#ffd300' },
];

// Patente exclusiva: apenas o jogador em 1º lugar no leaderboard a possui.
const FAIXA_MESTRE_ETECANO = { nome: 'Mestre Etecano', cor: '#e63946' };

function faixaRanked(pontos) {
  let atual = FAIXAS_RANKED[0];
  for (const f of FAIXAS_RANKED) if (pontos >= f.min) atual = f;
  return atual;
}

// ---------- Quem é o "Mestre Etecano" (líder único do leaderboard) ----------
// Como a patente máxima é exclusiva de 1 pessoa só, guardamos em cache (com
// curta validade) o ID de quem está em 1º lugar no Firebase, pra não ter
// que consultar o servidor toda vez que renderizamos uma faixa na tela.
let liderRankedCache = { id: null, atualizadoEm: 0 };
const LIDER_RANKED_CACHE_MS = 30000;

// Permite que outras telas (ex: leaderboard, que já busca todo mundo
// ordenado) avisem diretamente quem é o líder atual, sem nova consulta.
function definirLiderRankedCache(id) {
  liderRankedCache = { id: id || null, atualizadoEm: Date.now() };
}

async function obterLiderRankedId(forcar = false) {
  if (typeof db === 'undefined' || !db) return liderRankedCache.id;
  const agora = Date.now();
  if (!forcar && liderRankedCache.id && (agora - liderRankedCache.atualizadoEm) < LIDER_RANKED_CACHE_MS) {
    return liderRankedCache.id;
  }
  try {
    const snap = await db.ref('jogadores').orderByChild('pontosRanked').limitToLast(1).get();
    let idLider = null;
    snap.forEach(filho => { idLider = filho.key; });
    liderRankedCache = { id: idLider, atualizadoEm: agora };
    return idLider;
  } catch (e) {
    console.error('[Perfil] Erro ao checar líder ranked:', e);
    return liderRankedCache.id; // mantém o último valor conhecido em caso de erro
  }
}

// Faixa a ser exibida pra um jogador específico: igual a faixaRanked(),
// exceto quando esse jogador é o atual líder do leaderboard — aí ele
// exibe "Mestre Etecano" independente da pontuação exata.
function faixaExibida(pontos, jogadorId) {
  if (jogadorId && liderRankedCache.id && jogadorId === liderRankedCache.id) {
    return FAIXA_MESTRE_ETECANO;
  }
  return faixaRanked(pontos);
}

// ---------- Registrar uso de carta (qualquer modo) ----------
function registrarUsoCarta(idCarta) {
  if (!idCarta) return;
  const stats = obterStatsPerfil();
  stats.usoCartas[idCarta] = (stats.usoCartas[idCarta] || 0) + 1;
  salvarStatsPerfil(stats);
}

function cartaMaisUsadaDoPerfil() {
  const stats = obterStatsPerfil();
  const entradas = Object.entries(stats.usoCartas || {});
  if (entradas.length === 0) return null;
  entradas.sort((a, b) => b[1] - a[1]);
  const [idCarta, vezes] = entradas[0];
  const carta = typeof buscarCartaPorId === 'function' ? buscarCartaPorId(idCarta) : null;
  return { id: idCarta, nome: carta ? carta.nome : idCarta, vezes };
}

// ---------- "Primeira carta conquistada" (loot) ----------
function registrarPrimeiraCartaSeNecessario(idCarta) {
  const stats = obterStatsPerfil();
  if (stats.primeiraCarta) return; // já tem uma registrada, não sobrescreve
  const carta = typeof buscarCartaPorId === 'function' ? buscarCartaPorId(idCarta) : null;
  stats.primeiraCarta = {
    id: idCarta,
    nome: carta ? carta.nome : idCarta,
    dataISO: new Date().toISOString()
  };
  salvarStatsPerfil(stats);
}

// ---------- Registrar resultado de partida (qualquer modo) ----------
function registrarResultadoPartida({ venceu, empate, modoRanked }) {
  const stats = obterStatsPerfil();
  stats.partidas++;
  if (empate) {
    stats.sequenciaAtual = 0;
  } else if (venceu) {
    stats.vitorias++;
    stats.sequenciaAtual++;
    stats.maiorSequencia = Math.max(stats.maiorSequencia, stats.sequenciaAtual);
  } else {
    stats.derrotas++;
    stats.sequenciaAtual = 0;
  }
  salvarStatsPerfil(stats);
  // BUG CORRIGIDO (leaderboard): em partidas ranqueadas, NÃO sincronizamos aqui.
  // registrarResultadoRanked() será chamado logo em seguida e fará a única
  // escrita com todos os dados atualizados (incluindo pontosRanked já calculado).
  // Antes, duas escritas sequenciais eram disparadas: a primeira com pontosRanked
  // ANTIGO (desta função) e a segunda com o novo. Se a primeira chegasse ao
  // Firebase depois da segunda (ex: retry ou reordenação de rede), o pontosRanked
  // era sobrescrito pelo valor pré-partida, fazendo o vencedor sumir do ranking.
  if (modoRanked) return Promise.resolve();
  return sincronizarPerfilFirebase();
}

// ---------- ELO simplificado (ranqueada) ----------
function calcularNovosPontosElo(meusPontos, pontosAdversario, resultado /* 1, 0.5 ou 0 */) {
  const esperado = 1 / (1 + Math.pow(10, (pontosAdversario - meusPontos) / 400));
  const novos = meusPontos + ELO_K * (resultado - esperado);
  return Math.max(0, Math.round(novos));
}

// resultado: { venceu, empate, pontosAdversario }
function registrarResultadoRanked({ venceu, empate, pontosAdversario }) {
  const stats = obterStatsPerfil();
  const resultadoNumerico = empate ? 0.5 : (venceu ? 1 : 0);
  const pontosAntes = stats.pontosRanked;
  const pontosDepois = calcularNovosPontosElo(pontosAntes, pontosAdversario, resultadoNumerico);

  stats.partidasRanked++;
  if (!empate) { if (venceu) stats.vitoriasRanked++; else stats.derrotasRanked++; }
  stats.pontosRanked = pontosDepois;
  salvarStatsPerfil(stats);
  const promessaSync = sincronizarPerfilFirebase();

  return { pontosAntes, pontosDepois, delta: pontosDepois - pontosAntes, promessaSync };
}

// ---------- Sincroniza com o Firebase (pro leaderboard funcionar) ----------
// BUG CORRIGIDO (leaderboard): a versão anterior falhava silenciosamente —
// se a escrita no Firebase era rejeitada (race condition com o encerramento
// da sala, queda de rede, etc.), o erro ia pro console mas o resultado
// nunca chegava ao leaderboard. Agora a função tenta até 3 vezes com
// backoff exponencial antes de desistir e avisar o jogador.
function sincronizarPerfilFirebase() {
  if (typeof db === 'undefined' || !db) return Promise.resolve();

  // Captura os dados AGORA (snapshot dos stats atuais do localStorage).
  // Importante: não pode recapturar dentro do retry, pois os dados podem
  // mudar enquanto a retentativa está aguardando.
  const p = obterPerfilCompleto();
  const payload = {
    nome: p.nome || 'Sem nome',
    pontosRanked: p.pontosRanked,
    partidas: p.partidas,
    vitorias: p.vitorias,
    derrotas: p.derrotas,
    partidasRanked: p.partidasRanked,
    vitoriasRanked: p.vitoriasRanked,
    derrotasRanked: p.derrotasRanked,
    maiorSequencia: p.maiorSequencia,
    atualizadoEm: (typeof firebase !== 'undefined') ? firebase.database.ServerValue.TIMESTAMP : Date.now()
  };

  const tentarEscrever = (tentativa) => {
    return db.ref('jogadores/' + p.id).update(payload)
      .catch(e => {
        console.error(`[Perfil] Tentativa ${tentativa}/3 falhou:`, e.code, e.message);
        if (tentativa >= 3) {
          avisarSincronizacaoFalhou();
          return Promise.reject(e);
        }
        // Espera 800ms * 2^(tentativa-1): 800ms, 1600ms
        const espera = 800 * Math.pow(2, tentativa - 1);
        return new Promise(res => setTimeout(res, espera)).then(() => tentarEscrever(tentativa + 1));
      });
  };

  return tentarEscrever(1);
}

// Avisa visivelmente na tela se a sincronização com o leaderboard falhar,
// em vez de a pessoa só descobrir depois que checou o leaderboard e não
// se viu lá.
function avisarSincronizacaoFalhou() {
  if (typeof avisar === 'function') {
    avisar('⚠ Não consegui salvar seu resultado no leaderboard (erro de conexão/permissão). Seus pontos locais estão salvos, mas talvez não apareçam no ranking online.');
  }
}

// =====================================================
// UI da tela de Perfil
// =====================================================
function renderizarPerfilUI() {
  const p = obterPerfilCompleto();

  const elNome = document.getElementById('perfil-input-nome');
  if (elNome && document.activeElement !== elNome) elNome.value = p.nome;

  const setText = (id, texto) => { const el = document.getElementById(id); if (el) el.textContent = texto; };
  const elFaixaCor = document.getElementById('perfil-faixa-badge');

  const pintarFaixa = (faixa) => {
    setText('perfil-faixa-nome', faixa.nome);
    if (elFaixaCor) elFaixaCor.style.background = faixa.cor;
  };

  // Mostra de cara a faixa com o cache que já temos (pode estar um pouco
  // desatualizado) e, em paralelo, confirma com o servidor quem é o líder
  // atual — se a resposta mudar a faixa exibida, repintamos o badge.
  pintarFaixa(faixaExibida(p.pontosRanked, p.id));
  obterLiderRankedId().then(() => pintarFaixa(faixaExibida(p.pontosRanked, p.id)));

  if (typeof renderizarBaralhosFavoritosPerfil === 'function') renderizarBaralhosFavoritosPerfil();

  setText('perfil-pontos-ranked', p.pontosRanked);
  setText('perfil-partidas', p.partidas);
  setText('perfil-vitorias', p.vitorias);
  setText('perfil-derrotas', p.derrotas);
  const taxa = p.partidas > 0 ? Math.round((p.vitorias / p.partidas) * 100) : 0;
  setText('perfil-taxa-vitoria', taxa + '%');
  setText('perfil-sequencia-atual', p.sequenciaAtual);
  setText('perfil-maior-sequencia', p.maiorSequencia);
  setText('perfil-ranked-resumo', `${p.vitoriasRanked}V / ${p.derrotasRanked}D em ${p.partidasRanked} partida(s) ranqueada(s)`);

  const maisUsada = cartaMaisUsadaDoPerfil();
  setText('perfil-carta-favorita', maisUsada ? `${maisUsada.nome} (${maisUsada.vezes}x em campo)` : 'Jogue uma partida pra descobrir!');

  if (p.primeiraCarta) {
    setText('perfil-primeira-carta', `${p.primeiraCarta.nome} — conquistada em ${new Date(p.primeiraCarta.dataISO).toLocaleDateString('pt-BR')}`);
  } else {
    setText('perfil-primeira-carta', 'Você ainda não desbloqueou nenhuma carta em caixas.');
  }
}

// =====================================================
// Baralhos favoritos (atalho no Perfil pros 3 slots de preset)
// =====================================================
// Os 3 slots em si (cartas + nome) são os mesmos presets usados na tela
// de Galeria (getPresetsBaralho/salvarPresetBaralho/etc, em app.js) —
// aqui só damos um jeito rápido de ver e gerenciar eles direto do Perfil,
// sem precisar entrar na Galeria pra renomear/excluir/carregar.
function renderizarBaralhosFavoritosPerfil() {
  const lista = document.getElementById('perfil-baralhos-favoritos');
  if (!lista || typeof getPresetsBaralho !== 'function') return;

  const slots = getPresetsBaralho();
  lista.innerHTML = '';

  slots.forEach((slot, i) => {
    const card = document.createElement('div');
    card.className = 'perfil-baralho-card';

    if (slot) {
      const miniaturas = slot.cartas.map(idCarta => {
        const c = typeof buscarCartaPorId === 'function' ? buscarCartaPorId(idCarta) : null;
        return c ? `<img src="${c.imagem}" alt="${c.nome}" title="${c.nome}" class="preset-baralho-mini">` : '';
      }).join('');
      card.innerHTML = `
        <div class="perfil-baralho-card-cabecalho">
          <span class="perfil-baralho-card-titulo">Slot ${i + 1} — ${escaparHtml(slot.nome)}</span>
          <small style="opacity:.7">${slot.cartas.length} carta(s)</small>
        </div>
        <div class="preset-baralho-slot-cartas">${miniaturas}</div>
        <div class="perfil-baralho-card-acoes">
          <button class="btn-secundario btn-perfil-baralho-renomear">✏ Renomear</button>
          <button class="btn-secundario btn-perfil-baralho-jogar">▶ Carregar e ir montar</button>
          <button class="btn-secundario btn-perfil-baralho-excluir">🗑 Excluir</button>
        </div>`;
      card.querySelector('.btn-perfil-baralho-jogar').addEventListener('click', () => {
        if (typeof carregarPresetBaralho === 'function') carregarPresetBaralho(i);
        mostrarTela('galeria');
      });
      card.querySelector('.btn-perfil-baralho-renomear').addEventListener('click', () => {
        const novoNome = (prompt('Novo nome do baralho:', slot.nome) || '').trim();
        if (!novoNome) return;
        const slotsAtuais = getPresetsBaralho();
        slotsAtuais[i].nome = novoNome;
        setPresetsBaralho(slotsAtuais);
        renderizarBaralhosFavoritosPerfil();
      });
      card.querySelector('.btn-perfil-baralho-excluir').addEventListener('click', () => {
        if (!confirm(`Excluir o baralho "${slot.nome}" do Slot ${i + 1}?`)) return;
        if (typeof excluirPresetBaralho === 'function') excluirPresetBaralho(i);
        renderizarBaralhosFavoritosPerfil();
      });
    } else {
      card.classList.add('perfil-baralho-card-vazio');
      card.innerHTML = `
        <div class="perfil-baralho-card-cabecalho">
          <span class="perfil-baralho-card-titulo">Slot ${i + 1} — vazio</span>
        </div>
        <p style="color:var(--texto-suave); font-size:12px; margin:6px 0 12px;">Vá até a Galeria, monte um baralho e salve aqui pra ter ele sempre à mão.</p>
        <div class="perfil-baralho-card-acoes">
          <button class="btn-secundario btn-perfil-baralho-montar">🃏 Ir montar um baralho</button>
        </div>`;
      card.querySelector('.btn-perfil-baralho-montar').addEventListener('click', () => mostrarTela('galeria'));
    }

    lista.appendChild(card);
  });
}

window.renderizarBaralhosFavoritosPerfil = renderizarBaralhosFavoritosPerfil;

function iniciarUIPerfil() {
  const btnSalvar = document.getElementById('perfil-btn-salvar-nome');
  const inputNome = document.getElementById('perfil-input-nome');
  const aviso = document.getElementById('perfil-aviso-nome');

  if (btnSalvar && inputNome) {
    btnSalvar.addEventListener('click', () => {
      const ok = definirNomeJogador(inputNome.value);
      if (ok) {
        if (aviso) { aviso.textContent = 'Nome salvo!'; aviso.style.color = '#7ec88a'; }
        // mantém o campo de nome da tela online em sincronia
        const inputOnline = document.getElementById('input-nome-jogador');
        if (inputOnline) inputOnline.value = obterNomeJogador();
      } else if (aviso) {
        aviso.textContent = 'Digite um nome válido.';
        aviso.style.color = '#ffb3a3';
      }
      renderizarPerfilUI();
    });
    inputNome.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnSalvar.click(); });
  }

  const btnLeaderboard = document.getElementById('perfil-btn-leaderboard');
  if (btnLeaderboard) btnLeaderboard.addEventListener('click', () => {
    mostrarTela('leaderboard');
    if (typeof carregarLeaderboard === 'function') carregarLeaderboard();
  });

  const btnSincronizar = document.getElementById('perfil-btn-sincronizar');
  if (btnSincronizar) {
    btnSincronizar.addEventListener('click', async () => {
      btnSincronizar.disabled = true;
      btnSincronizar.textContent = '⏳ Sincronizando...';
      try {
        await sincronizarPerfilFirebase();
        btnSincronizar.textContent = '✅ Sincronizado!';
        setTimeout(() => {
          btnSincronizar.textContent = '☁ Sincronizar perfil';
          btnSincronizar.disabled = false;
        }, 2500);
      } catch (e) {
        btnSincronizar.textContent = '⚠ Erro — tente novamente';
        setTimeout(() => {
          btnSincronizar.textContent = '☁ Sincronizar perfil';
          btnSincronizar.disabled = false;
        }, 2500);
      }
    });
  }

  const irParaPerfil = () => {
    mostrarTela('perfil');
    renderizarPerfilUI();
    // Sincroniza automaticamente ao abrir o perfil — garante que jogadores
    // com dados no localStorage (mas sem registro no Firebase) apareçam no leaderboard.
    sincronizarPerfilFirebase().catch(() => {});
  };
  document.getElementById('btn-perfil-menu')  ?.addEventListener('click', irParaPerfil);
  document.getElementById('btn-perfil-menu-2')?.addEventListener('click', irParaPerfil);
}

window.obterJogadorId               = obterJogadorId;
window.obterNomeJogador             = obterNomeJogador;
window.temNomeDefinido              = temNomeDefinido;
window.definirNomeJogador           = definirNomeJogador;
window.obterPerfilCompleto          = obterPerfilCompleto;
window.faixaRanked                  = faixaRanked;
window.faixaExibida                 = faixaExibida;
window.obterLiderRankedId           = obterLiderRankedId;
window.definirLiderRankedCache      = definirLiderRankedCache;
window.registrarUsoCarta            = registrarUsoCarta;
window.registrarPrimeiraCartaSeNecessario = registrarPrimeiraCartaSeNecessario;
window.registrarResultadoPartida    = registrarResultadoPartida;
window.registrarResultadoRanked     = registrarResultadoRanked;
window.sincronizarPerfilFirebase    = sincronizarPerfilFirebase;
window.renderizarPerfilUI           = renderizarPerfilUI;
window.iniciarUIPerfil              = iniciarUIPerfil;
