// =====================================================
// MESTRES ETECANOS - Sistema de Loot e Moedas
// =====================================================

const CHAVE_MOEDAS   = 'me_moedas_v1';
const CHAVE_COLECAO  = 'me_colecao_v1';
const CHAVE_RECOMPENSA = 'me_recompensa_v1';
const MOEDAS_INICIAIS = 150;

// Recompensas diárias (7 dias)
const RECOMPENSAS_DIARIAS = [
  { tipo: 'moedas', valor: 50,  label: '50 moedas',    icone: '🪙' },
  { tipo: 'moedas', valor: 100, label: '100 moedas',   icone: '🪙' },
  { tipo: 'caixa',  valor: 'basica',   label: 'Caixa Básica',    icone: '📦' },
  { tipo: 'moedas', valor: 200, label: '200 moedas',   icone: '🪙' },
  { tipo: 'caixa',  valor: 'rara',     label: 'Caixa Especial',  icone: '🎁' },
  { tipo: 'caixa',  valor: 'rara',     label: 'Caixa Especial',  icone: '🎁' },
  { tipo: 'caixa',  valor: 'lendaria', label: 'Caixa Lendária',  icone: '✨' },
];

// Caixas disponíveis
const CAIXAS = {
  basica: {
    custo: 50,
    qtd: 2,
    tabela: [
      { raridade: RARIDADE.INICIAL,  peso: 50 },
      { raridade: RARIDADE.COMUM,    peso: 20 },
      { raridade: RARIDADE.RARO,     peso: 28 },
      { raridade: RARIDADE.LENDARIO, peso: 2  },
      { raridade: RARIDADE.MITICO,   peso: 0  },
    ]
  },
  rara: {
    custo: 150,
    qtd: 3,
    tabela: [
      { raridade: RARIDADE.INICIAL,  peso: 10 },
      { raridade: RARIDADE.COMUM,    peso: 10 },
      { raridade: RARIDADE.RARO,     peso: 55 },
      { raridade: RARIDADE.LENDARIO, peso: 22 },
      { raridade: RARIDADE.MITICO,   peso: 3  },
    ]
  },
  lendaria: {
    custo: 400,
    qtd: 3,
    tabela: [
      { raridade: RARIDADE.INICIAL,  peso: 0  },
      { raridade: RARIDADE.COMUM,    peso: 0  },
      { raridade: RARIDADE.RARO,     peso: 15 },
      { raridade: RARIDADE.LENDARIO, peso: 60 },
      { raridade: RARIDADE.MITICO,   peso: 25 },
    ]
  }
};

// Moedas ganhas por resultado de partida
const RECOMPENSA_VITORIA  = 80;
const RECOMPENSA_DERROTA  = 30;
const RECOMPENSA_EMPATE   = 50;

// Valor de venda de cartas repetidas, por raridade
// (reduzido: vender carta repetida agora rende bem menos moedas que antes,
// pra incentivar guardar cartas/usar o mercado em vez de vender rápido)
const VALOR_VENDA = {
  [RARIDADE.INICIAL]:  8,
  [RARIDADE.COMUM]:    8,
  [RARIDADE.RARO]:      20,
  [RARIDADE.LENDARIO]:  50,
  [RARIDADE.MITICO]:   120,
};

// ---------- Storage helpers ----------
function getMoedas() {
  const raw = localStorage.getItem(CHAVE_MOEDAS);
  if (raw === null) {
    // Primeira vez: começa com 150
    localStorage.setItem(CHAVE_MOEDAS, MOEDAS_INICIAIS);
    return MOEDAS_INICIAIS;
  }
  return parseInt(raw, 10);
}
function setMoedas(v) {
  localStorage.setItem(CHAVE_MOEDAS, Math.max(0, v));
  atualizarDisplayMoedas();
}
function adicionarMoedas(v) {
  setMoedas(getMoedas() + v);
}

function getColecao() {
  let col;
  try { col = JSON.parse(localStorage.getItem(CHAVE_COLECAO) || '{}'); }
  catch { col = {}; }
  return migrarColecaoSeNecessario(col);
}

// BUG CORRIGIDO: contas criadas antes da reescrita do sistema de loot
// guardavam a coleção em formatos antigos — ex: `{ idCarta: quantidade }`
// (um número simples) em vez de `{ idCarta: [bonus1, bonus2, ...] }` (um
// array com uma entrada por cópia, que é o formato que todo o resto do
// código espera hoje). Como nada migrava esse dado, duas coisas quebravam
// pra essas contas: as cartas pareciam "sumidas" na Galeria/Coleção
// (`colecao[id].length` é `undefined` quando o valor é um número), e abrir
// caixa lançava um erro não tratado assim que sorteava uma carta repetida
// (`col[idCarta].push(...)` falha porque `.push` não existe em número) —
// erro esse que acontecia DEPOIS das moedas já descontadas e ANTES da
// animação/coleção serem atualizadas, dando a impressão de que a caixa
// "não abria". Essa função converte qualquer formato antigo pro novo na
// hora da leitura, de forma transparente e permanente (grava de volta no
// localStorage assim que migra, então só precisa rodar uma vez por conta).
function migrarColecaoSeNecessario(col) {
  if (!col || typeof col !== 'object') return {};
  let mudou = false;
  const novaCol = {};
  for (const idCarta of Object.keys(col)) {
    const valor = col[idCarta];
    if (Array.isArray(valor)) {
      novaCol[idCarta] = valor;
      continue;
    }
    mudou = true;
    if (typeof valor === 'number' && valor > 0) {
      // Formato bem antigo: apenas a quantidade de cópias, sem bônus.
      novaCol[idCarta] = Array.from({ length: valor }, () => ({ atq: 0, def: 0 }));
    } else if (valor && typeof valor === 'object') {
      // Formato intermediário: um único bônus solto (não array).
      novaCol[idCarta] = [normalizarBonusLoot(valor)];
    } else {
      novaCol[idCarta] = [];
    }
  }
  if (mudou) {
    localStorage.setItem(CHAVE_COLECAO, JSON.stringify(novaCol));
  }
  return novaCol;
}
function setColecao(c) {
  localStorage.setItem(CHAVE_COLECAO, JSON.stringify(c));
}

// Quantidade de cópias que o jogador tem de uma carta (cada elemento do
// array é uma cópia, com seu próprio bônus/debuff de loot).
function quantidadeNaColecao(idCarta) {
  const col = getColecao();
  return (col[idCarta] || []).length;
}

// Sorteia o bônus/debuff de loot de uma cópia: cada atributo (ATQ e DEF)
// tem 40% de chance, de forma INDEPENDENTE, de vir com um bônus/debuff de
// até ±10%. Ou seja, uma cópia pode sair sem bônus, com bônus só em ATQ, só
// em DEF, ou — agora corrigido — com bônus simultâneo em ATQ e DEF (antes
// só era possível em um atributo por vez, nunca os dois ao mesmo tempo).
function gerarBonusLoot() {
  const bonus = { atq: 0, def: 0 };
  if (Math.random() <= 0.4) {
    let valor = Math.round((Math.random() * 2 - 1) * BONUS_LOOT_PERCENTUAL_MAX);
    if (valor === 0) valor = Math.random() < 0.5 ? 1 : -1;
    bonus.atq = valor;
  }
  if (Math.random() <= 0.4) {
    let valor = Math.round((Math.random() * 2 - 1) * BONUS_LOOT_PERCENTUAL_MAX);
    if (valor === 0) valor = Math.random() < 0.5 ? 1 : -1;
    bonus.def = valor;
  }
  return bonus;
}

// Normaliza um bônus de loot pro formato novo { atq, def }, aceitando ainda
// o formato antigo { atributo, valor } (cartas que já existiam na coleção
// de jogadores antes dessa correção continuam funcionando normalmente).
function normalizarBonusLoot(bonus) {
  if (!bonus) return { atq: 0, def: 0 };
  if (typeof bonus.atq === 'number' || typeof bonus.def === 'number') {
    return { atq: bonus.atq || 0, def: bonus.def || 0 };
  }
  if (bonus.atributo === 'atq') return { atq: bonus.valor || 0, def: 0 };
  if (bonus.atributo === 'def') return { atq: 0, def: bonus.valor || 0 };
  return { atq: 0, def: 0 };
}

// Monta o HTML de uma ou duas tags de bônus (ATQ e/ou DEF) a partir de um
// bônus já normalizado. Usado em todas as telas que exibem bônus de cópia.
function montarTagsBonusLoot(bonus, classe) {
  const n = normalizarBonusLoot(bonus);
  let html = '';
  [['atq', n.atq], ['def', n.def]].forEach(([atributo, valor]) => {
    if (!valor) return;
    const sinal = valor > 0 ? '+' : '';
    const cor = valor > 0 ? '#4caf50' : '#f44336';
    html += `<span class="${classe}" style="color:${cor};border-color:${cor};">${sinal}${valor}% ${atributo.toUpperCase()}</span>`;
  });
  return html;
}

// Pega um bônus de loot aleatório dentre as cópias que o jogador possui
// dessa carta (usado ao colocar a carta no baralho/mão). Retorna null se
// não houver nenhuma cópia (ex: carta Inicial concedida de graça).
function obterBonusAleatorioColecao(idCarta) {
  const lista = getColecao()[idCarta];
  if (!lista || lista.length === 0) return null;
  return lista[Math.floor(Math.random() * lista.length)];
}

function adicionarCartaColecao(idCarta) {
  const col = getColecao();
  const eraNova = !col[idCarta] || col[idCarta].length === 0;
  if (!col[idCarta]) col[idCarta] = [];
  const bonus = gerarBonusLoot();
  col[idCarta].push(bonus);
  setColecao(col);
  if (eraNova && typeof registrarPrimeiraCartaSeNecessario === 'function') {
    registrarPrimeiraCartaSeNecessario(idCarta);
  }
  return bonus;
}

// Vende 1 cópia repetida da carta (mantém sempre ao menos 1 na coleção,
// pra não trancar a carta de novo na galeria). Retorna o valor recebido,
// ou 0 se não havia cópia extra pra vender.
function venderCarta(idCarta) {
  const col = getColecao();
  const lista = col[idCarta] || [];
  if (lista.length <= 1) return 0; // precisa ter pelo menos 1 cópia "extra"

  const cartaBase = buscarCartaPorId(idCarta);
  if (!cartaBase) return 0;

  const valor = VALOR_VENDA[cartaBase.raridade] || 0;
  lista.pop();
  col[idCarta] = lista;
  setColecao(col);
  adicionarMoedas(valor);
  return valor;
}

// ---------- Display ----------
function atualizarDisplayMoedas() {
  const m = getMoedas();
  const el1 = document.getElementById('menu-moedas-qtd');
  const el2 = document.getElementById('colecao-moedas-qtd');
  const el3 = document.getElementById('mercado-moedas-qtd');
  if (el1) el1.textContent = m;
  if (el2) el2.textContent = m;
  if (el3) el3.textContent = m;
}

// ---------- Sorteio de carta ----------
function sortearRaridade(tabela) {
  const total = tabela.reduce((s, e) => s + e.peso, 0);
  let r = Math.random() * total;
  for (const entrada of tabela) {
    r -= entrada.peso;
    if (r <= 0) return entrada.raridade;
  }
  return tabela[tabela.length - 1].raridade;
}

function sortearCarta(raridade) {
  const pool = CARTAS.filter(c => c.raridade === raridade);
  if (pool.length === 0) {
    // fallback: qualquer carta
    return CARTAS[Math.floor(Math.random() * CARTAS.length)];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

let _lootAnimEmAndamento = false;
let _lootTimeoutId = null;

// ---------- Abertura de caixa ----------
function abrirCaixa(tipo) {
  if (_lootAnimEmAndamento) return; // evita clique duplo abrindo 2 caixas ao mesmo tempo

  const cfg = CAIXAS[tipo];
  if (!cfg) return;

  const moedas = getMoedas();
  if (moedas < cfg.custo) {
    avisar(`Moedas insuficientes! Você precisa de 🪙 ${cfg.custo}.`);
    return;
  }

  setMoedas(moedas - cfg.custo);

  // Sorteia as cartas. Protegido por try/catch: se algo der errado aqui
  // (ex: dado antigo/corrompido de alguma conta), devolvemos as moedas
  // em vez de deixar o jogador pagar por uma caixa que não deu nada.
  let cartasObtidas;
  try {
    cartasObtidas = [];
    for (let i = 0; i < cfg.qtd; i++) {
      const raridade = sortearRaridade(cfg.tabela);
      const carta = sortearCarta(raridade);
      const bonus = adicionarCartaColecao(carta.id);
      cartasObtidas.push({ ...carta, _bonusObtido: bonus });
    }
  } catch (e) {
    console.error('[Loot] Erro ao abrir caixa, devolvendo moedas:', e);
    adicionarMoedas(cfg.custo);
    avisar('⚠ Algo deu errado ao abrir a caixa. Suas moedas foram devolvidas — tente de novo.');
    return;
  }

  mostrarAnimacaoLoot(tipo, cartasObtidas);
  renderizarColecao();
}

function mostrarAnimacaoLoot(tipo, cartas) {
  const overlay = document.getElementById('overlay-loot');
  const icone   = document.getElementById('loot-box-icone');
  const splash  = document.getElementById('loot-box-splash');
  const resultado = document.getElementById('loot-resultado');
  const cartasEl  = document.getElementById('loot-cartas-obtidas');

  // Se algum elemento essencial não existir no DOM, não trava o jogo: as
  // cartas já foram creditadas na coleção acima, só não dá pra mostrar a
  // animação. Avisa o jogador de outra forma pra não parecer que "sumiu".
  if (!overlay || !icone || !splash || !resultado || !cartasEl) {
    if (typeof avisar === 'function') {
      avisar(`Caixa aberta! Você recebeu: ${cartas.map(c => c.nome).join(', ')}.`);
    }
    return;
  }

  // Cancela qualquer animação/timeout de uma abertura anterior que ainda
  // não tinha terminado, pra evitar dois resultados se sobrescrevendo.
  if (_lootTimeoutId) {
    clearTimeout(_lootTimeoutId);
    _lootTimeoutId = null;
  }
  _lootAnimEmAndamento = true;

  const icones = { basica: '📦', rara: '🎁', lendaria: '✨' };
  icone.textContent = icones[tipo] || '📦';
  icone.style.display = 'block'; // garante que não ficou "none" de uma abertura anterior
  icone.style.animation = 'none';
  splash.innerHTML = '';
  resultado.style.display = 'none';
  cartasEl.innerHTML = '';
  overlay.style.display = 'flex';

  // Animação: caixa treme e abre
  void icone.offsetWidth;
  icone.style.animation = 'lootShake 0.5s ease, lootPop 0.4s 0.5s ease forwards';

  // Após animação, mostra cartas
  _lootTimeoutId = setTimeout(() => {
    icone.style.display = 'none';

    cartasEl.innerHTML = '';
    cartas.forEach((carta, i) => {
      const el = document.createElement('div');
      el.className = 'loot-carta-obtida';
      el.style.animationDelay = `${i * 0.15}s`;
      el.dataset.raridade = carta.raridade;
      const bonus = carta._bonusObtido;
      const tagsBonus = montarTagsBonusLoot(bonus, 'loot-carta-bonus-tag');
      const bonusHtml = tagsBonus ? `<div class="loot-carta-bonus">${tagsBonus}</div>` : '';
      el.innerHTML = `
        <img src="${carta.imagem}" alt="${carta.nome}">
        <div class="loot-carta-nome">${carta.nome}</div>
        <div class="loot-carta-raridade" style="color:var(--cor-${carta.raridade})">${MOLDURAS[carta.raridade].nome}</div>
        ${bonusHtml}
      `;
      cartasEl.appendChild(el);
    });

    resultado.style.display = 'block';
    _lootTimeoutId = null;
    _lootAnimEmAndamento = false;
  }, 950);

  document.getElementById('btn-fechar-loot').onclick = () => {
    overlay.style.display = 'none';
    icone.style.display = 'block';
    if (_lootTimeoutId) {
      clearTimeout(_lootTimeoutId);
      _lootTimeoutId = null;
    }
    _lootAnimEmAndamento = false;
  };
}

// ---------- Recompensa pós-partida ----------
function concederRecompensaPartida(venceu, empate = false) {
  const ganho = empate ? RECOMPENSA_EMPATE : venceu ? RECOMPENSA_VITORIA : RECOMPENSA_DERROTA;
  adicionarMoedas(ganho);

  const el = document.getElementById('moedas-ganhas-num');
  const total = document.getElementById('fim-total-moedas-num');
  if (el) {
    el.textContent = `+${ganho}`;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'moedasPopIn 0.6s ease forwards';
  }
  if (total) total.textContent = getMoedas();

  const recompensaEl = document.getElementById('fim-recompensa');
  if (recompensaEl) recompensaEl.style.display = 'block';
}

// ---------- Renderizar coleção ----------
function renderizarColecao() {
  const grade = document.getElementById('colecao-grade');
  if (!grade) return;

  const colecao = getColecao();
  grade.innerHTML = '';

  if (Object.keys(colecao).length === 0) {
    grade.innerHTML = '<p class="colecao-vazia">Você ainda não tem cartas. Abra uma caixa!</p>';
    return;
  }

  // Agrupa por raridade
  const ordem = [RARIDADE.MITICO, RARIDADE.LENDARIO, RARIDADE.RARO, RARIDADE.COMUM, RARIDADE.INICIAL];
  const cartasOrdenadas = ordem.flatMap(r =>
    CARTAS.filter(c => c.raridade === r && colecao[c.id])
  );

  cartasOrdenadas.forEach(carta => {
    const copias = colecao[carta.id] || [];
    const qtd = copias.length;
    const podeVender = qtd > 1;
    const valor = VALOR_VENDA[carta.raridade] || 0;
    // Mostra os bônus/debuffs de % de cada cópia que o jogador tem dessa carta,
    // pra ficar claro que cada cópia pode ter um bônus de até ±10% em ATQ ou DEF.
    const bonusTags = copias
      .map(b => montarTagsBonusLoot(b, 'colecao-carta-bonus'))
      .join('');
    const el = document.createElement('div');
    el.className = 'colecao-carta';
    el.dataset.raridade = carta.raridade;
    el.innerHTML = `
      <img src="${carta.imagem}" alt="${carta.nome}">
      <div class="colecao-carta-info">
        <span class="colecao-carta-nome">${carta.nome}</span>
        <span class="colecao-carta-rar" style="color:var(--cor-${carta.raridade})">${MOLDURAS[carta.raridade].nome}</span>
        ${bonusTags ? `<div class="colecao-carta-bonus-wrap" title="Bônus de sorte de cada cópia (sorteado ao obter a carta na caixa)">${bonusTags}</div>` : ''}
      </div>
      ${qtd > 1 ? `<div class="colecao-qtd">×${qtd}</div>` : ''}
      ${podeVender ? `<button class="btn-vender-carta" data-id="${carta.id}" title="Vender 1 cópia repetida">🪙 Vender (+${valor})</button>` : ''}
    `;
    if (podeVender) {
      el.querySelector('.btn-vender-carta').addEventListener('click', (ev) => {
        ev.stopPropagation();
        const ganho = venderCarta(carta.id);
        if (ganho > 0) {
          mostrarToastVenda(carta.nome, ganho);
          renderizarColecao();
          if (typeof renderizarGaleria === 'function') renderizarGaleria();
        }
      });
    }
    grade.appendChild(el);
  });

  atualizarDisplayMoedas();
}

function mostrarToastVenda(nomeCarta, valor) {
  if (typeof avisar === 'function') {
    avisar(`Vendeu 1x ${nomeCarta} por 🪙 ${valor}!`);
  }
}

// ---------- Recompensa Diária ----------
function getEstadoRecompensa() {
  try { return JSON.parse(localStorage.getItem(CHAVE_RECOMPENSA) || 'null'); }
  catch { return null; }
}
function setEstadoRecompensa(e) {
  localStorage.setItem(CHAVE_RECOMPENSA, JSON.stringify(e));
}

function verificarRecompensaDiaria() {
  const agora = new Date();
  const hoje = agora.toDateString();
  let estado = getEstadoRecompensa();

  if (!estado) {
    estado = { semana: agora.toLocaleDateString('pt-BR', { year:'numeric', week:'numeric' }), diaAtual: 0, ultimoLogin: null };
  }

  // Nova semana: reinicia
  const semanaAtual = `${agora.getFullYear()}-${Math.ceil((agora - new Date(agora.getFullYear(),0,1)) / 6.048e8)}`;
  if (estado.semana !== semanaAtual && estado.diaAtual >= 7) {
    estado.semana = semanaAtual;
    estado.diaAtual = 0;
    estado.ultimoLogin = null;
  }

  // Já coletou hoje
  if (estado.ultimoLogin === hoje) return;

  // Tem recompensa pra coletar
  if (estado.diaAtual < 7) {
    mostrarModalRecompensa(estado, hoje);
  }
}

function mostrarModalRecompensa(estado, hoje) {
  const overlay = document.getElementById('overlay-recompensa');
  const diasEl = document.getElementById('recompensa-dias');
  if (!overlay || !diasEl) return;

  diasEl.innerHTML = '';
  RECOMPENSAS_DIARIAS.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'recompensa-dia' + (i < estado.diaAtual ? ' coletado' : '') + (i === estado.diaAtual ? ' hoje' : '');
    div.innerHTML = `<div class="recompensa-dia-num">Dia ${i+1}</div><div class="recompensa-dia-premio">${r.icone}</div><div>${r.label}</div>`;
    diasEl.appendChild(div);
  });

  overlay.style.display = 'flex';

  const btnColetar = document.getElementById('btn-coletar-recompensa');
  const jaColetouHoje = estado.ultimoLogin === hoje;
  btnColetar.disabled = jaColetouHoje;
  btnColetar.textContent = jaColetouHoje ? 'Já coletado hoje!' : 'Coletar!';

  btnColetar.onclick = () => {
    if (jaColetouHoje) return;
    const r = RECOMPENSAS_DIARIAS[estado.diaAtual];
    if (r.tipo === 'moedas') {
      adicionarMoedas(r.valor);
      avisar(`+${r.valor} moedas! 🪙`);
    } else if (r.tipo === 'caixa') {
      overlay.style.display = 'none';
      abrirCaixa(r.valor);
    }
    estado.diaAtual++;
    estado.ultimoLogin = hoje;
    setEstadoRecompensa(estado);
    if (r.tipo !== 'caixa') overlay.style.display = 'none';
  };

  // Botão fechar se já coletou
  const btnFechar = document.createElement('button');
  btnFechar.className = 'btn-secundario';
  btnFechar.textContent = 'Fechar';
  btnFechar.style.marginTop = '8px';
  btnFechar.onclick = () => { overlay.style.display = 'none'; };
  // Remove btn fechar anterior se existir
  const old = document.getElementById('btn-fechar-recompensa');
  if (old) old.remove();
  btnFechar.id = 'btn-fechar-recompensa';
  btnColetar.parentNode.appendChild(btnFechar);
}

// Função global para abrir o modal de recompensa manualmente
window.abrirRecompensa = function() {
  const agora = new Date();
  const hoje = agora.toDateString();
  let estado = getEstadoRecompensa();
  if (!estado) {
    estado = { semana: '', diaAtual: 0, ultimoLogin: null };
  }
  mostrarModalRecompensa(estado, hoje);
};

// ---------- Efeito de fogo/explosão no hover ----------
(function() {
  const canvas = document.getElementById('explosion-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const particles = [];
  let animId = null;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function burst(x, y) {
    // Onda de choque
    particles.push({ type: 'shockwave', x, y, r: 5, maxR: 90, alpha: 0.8, life: 1 });

    // Partículas de fogo
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 9;
      const size = 4 + Math.random() * 14;
      particles.push({
        type: 'fire',
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        size,
        life: 1,
        decay: 0.018 + Math.random() * 0.025,
        hue: 20 + Math.random() * 30, // laranja-vermelho
      });
    }
    // Faíscas
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 5 + Math.random() * 12;
      particles.push({
        type: 'spark',
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 5,
        life: 1,
        decay: 0.03 + Math.random() * 0.04,
        trail: [],
      });
    }
    // Fumaça
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
      const speed = 1 + Math.random() * 3;
      particles.push({
        type: 'smoke',
        x: x + (Math.random() - 0.5) * 30,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 20 + Math.random() * 30,
        life: 1,
        decay: 0.008 + Math.random() * 0.01,
      });
    }

    if (!animId) loop();
  }

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      if (p.type === 'shockwave') {
        p.r += (p.maxR - p.r) * 0.18;
        p.alpha -= 0.04;
        if (p.alpha <= 0) { particles.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.strokeStyle = `rgba(255,180,50,${p.alpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

      } else if (p.type === 'fire') {
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.92; p.vy += 0.12;
        p.life -= p.decay;
        p.size *= 0.97;
        if (p.life <= 0 || p.size < 1) { particles.splice(i, 1); continue; }
        const alpha = p.life;
        // fogo: amarelo → laranja → vermelho → transparente
        const r = 255;
        const g = Math.floor(p.hue * p.life * 5);
        const b = 0;
        ctx.save();
        ctx.globalAlpha = alpha * 0.85;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        grad.addColorStop(0, `rgba(255,240,120,${alpha})`);
        grad.addColorStop(0.4, `rgba(${r},${Math.max(0,g)},0,${alpha * 0.8})`);
        grad.addColorStop(1, `rgba(180,20,0,0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

      } else if (p.type === 'spark') {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 6) p.trail.shift();
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.95; p.vy += 0.35;
        p.life -= p.decay;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.strokeStyle = `rgba(255,220,80,${p.life})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        p.trail.forEach((pt, j) => j === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.restore();

      } else if (p.type === 'smoke') {
        p.x += p.vx; p.y += p.vy;
        p.vy -= 0.05;
        p.size += 0.8;
        p.life -= p.decay;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = p.life * 0.18;
        ctx.fillStyle = `rgb(120,120,120)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    if (particles.length > 0) {
      animId = requestAnimationFrame(loop);
    } else {
      animId = null;
    }
  }

  // Attach to menu buttons on hover
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.menu-btn').forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        const r = btn.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2);
      });
    });
  });

  window.explosaoBurst = burst;
})();

// ---------- Init ----------
function iniciarSistemaLoot() {
  atualizarDisplayMoedas();
  renderizarColecao();

  // Verificar recompensa diária após 800ms (para o app carregar)
  setTimeout(verificarRecompensaDiaria, 800);

  // Botões das caixas
  document.querySelectorAll('.btn-abrir-caixa').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_lootAnimEmAndamento) return;
      const tipo = btn.closest('.caixa-loot').dataset.tipo;
      abrirCaixa(tipo);
    });
  });

  // Botão menu -> coleção
  const btnColecao = document.getElementById('btn-colecao-menu');
  if (btnColecao) btnColecao.addEventListener('click', () => {
    renderizarColecao();
    mostrarTela('colecao');
  });

  // Botão fim -> coleção
  const btnIrColecao = document.getElementById('btn-ir-colecao-fim');
  if (btnIrColecao) btnIrColecao.addEventListener('click', () => {
    document.getElementById('overlay-fim').style.display = 'none';
    renderizarColecao();
    mostrarTela('colecao');
  });
}

window.addEventListener('DOMContentLoaded', () => {
  // Aguarda o app principal inicializar
  const tentarInit = setInterval(() => {
    if (typeof mostrarTela === 'function' && typeof CARTAS !== 'undefined') {
      clearInterval(tentarInit);
      iniciarSistemaLoot();
    }
  }, 100);
});
