// =====================================================
// MESTRES ETECANOS - Mercado e Troca online de cartas
// =====================================================
// Usa o mesmo Firebase Realtime Database já configurado em js/online.js
// (variável global `db`). Cada anúncio fica em /mercado/{id}; pendências
// de moedas/cartas (pra quando o vendedor está offline na hora da venda)
// ficam em /creditosPendentes/{jogadorId} e /cartasPendentes/{jogadorId}.

let mercadoListagens = {}; // cache local { id: anuncio }
let mercadoListenerRef = null;
let mercadoAbaAtiva = 'comprar';

function refMercado() { return db ? db.ref('mercado') : null; }
function refCreditosPendentes(id) { return db ? db.ref('creditosPendentes/' + id) : null; }
function refCartasPendentes(id) { return db ? db.ref('cartasPendentes/' + id) : null; }

// ---------- Reivindicar pendências ----------
// BUG CORRIGIDO: antes isso só rodava 1x ao carregar o app (`.once('value')`),
// então se o vendedor estivesse online no momento da venda, as moedas dele
// ficavam presas em /creditosPendentes até ele recarregar a página — ou
// seja, o comprador pagava na hora, mas o vendedor só recebia depois de dar
// F5. Agora usamos `.on('value')`, um listener em tempo real: assim que o
// nó de créditos/cartas pendentes mudar no Firebase (porque alguém comprou
// algo do jogador), ele já credita na hora, mesmo com o vendedor online e
// sem precisar recarregar a página.
let _listenerCreditosPendentesRef = null;
let _listenerCartasPendentesRef = null;

function reivindicarPendenciasMercado() {
  if (!db || typeof obterJogadorId !== 'function') return;
  const meuId = obterJogadorId();

  // Remove listeners antigos (evita duplicar caso a função seja chamada de novo)
  if (_listenerCreditosPendentesRef) _listenerCreditosPendentesRef.off('value');
  if (_listenerCartasPendentesRef) _listenerCartasPendentesRef.off('value');

  _listenerCreditosPendentesRef = refCreditosPendentes(meuId);
  _listenerCreditosPendentesRef.on('value', snap => {
    const total = snap.val();
    if (total && total > 0) {
      adicionarMoedas(total);
      refCreditosPendentes(meuId).remove();
      avisar(`💰 Você recebeu ${total} moedas de vendas no Mercado!`);
      if (typeof atualizarDisplayMoedas === 'function') atualizarDisplayMoedas();
    }
  });

  _listenerCartasPendentesRef = refCartasPendentes(meuId);
  _listenerCartasPendentesRef.on('value', snap => {
    const val = snap.val();
    if (!val) return;
    const col = getColecao();
    let qtdRecebida = 0;
    Object.values(val).forEach(item => {
      if (!item || !item.idCarta) return;
      if (!col[item.idCarta]) col[item.idCarta] = [];
      col[item.idCarta].push(item.bonus || { atributo: null, valor: 0 });
      qtdRecebida++;
    });
    if (qtdRecebida > 0) {
      setColecao(col);
      refCartasPendentes(meuId).remove();
      avisar(`🔁 Você recebeu ${qtdRecebida} carta(s) de trocas no Mercado!`);
      if (typeof renderizarColecao === 'function') renderizarColecao();
      if (typeof renderizarGaleria === 'function') renderizarGaleria();
    }
  });
}

// ---------- Criar anúncio ----------
function criarAnuncioMercado({ idCarta, tipo, preco, cartaDesejadaId }) {
  if (!db) { avisar('Mercado indisponível: sem conexão online.'); return; }
  const col = getColecao();
  const lista = col[idCarta] || [];
  if (lista.length <= 1) {
    avisar('Você precisa de uma cópia repetida dessa carta para anunciar.');
    return;
  }
  const bonus = lista[lista.length - 1];

  const anuncio = {
    vendedorId: obterJogadorId(),
    vendedorNome: obterNomeJogador() || 'Mestre sem nome',
    idCarta,
    bonus: bonus || { atributo: null, valor: 0 },
    tipo, // 'venda' ou 'troca'
    criadoEm: Date.now()
  };
  if (tipo === 'venda') anuncio.preco = Math.max(1, Math.round(preco));
  else anuncio.cartaDesejadaId = cartaDesejadaId;

  // BUG CORRIGIDO: antes a cópia já era removida da coleção local (linha
  // acima, com lista.pop()) antes mesmo de saber se o anúncio ia ser salvo
  // no Firebase. Como as regras do Firebase não cobriam o nó "mercado",
  // todo push() aqui falhava com PERMISSION_DENIED — e como push() não
  // tinha tratamento de erro, a carta sumia da coleção do jogador pra
  // sempre, sem nunca virar um anúncio de verdade. Agora só removemos a
  // cópia da coleção DEPOIS que o Firebase confirma que salvou o anúncio.
  refMercado().push(anuncio)
    .then(() => {
      const colAtual = getColecao();
      const listaAtual = colAtual[idCarta] || [];
      if (listaAtual.length <= 1) return; // segurança: não deixa a coleção zerar
      listaAtual.pop();
      colAtual[idCarta] = listaAtual;
      setColecao(colAtual);

      avisar('Anúncio publicado no Mercado!');
      if (typeof renderizarColecao === 'function') renderizarColecao();
      if (typeof renderizarGaleria === 'function') renderizarGaleria();
      renderizarMinhasVendas();
    })
    .catch(e => {
      console.error('[Mercado] Falha ao publicar anúncio:', e);
      avisar('⚠ Não foi possível publicar o anúncio (erro de conexão/permissão). Sua carta continua na sua coleção.');
    });
}

// ---------- Cancelar anúncio (devolve a carta) ----------
function cancelarAnuncioMercado(id) {
  if (!db) return;
  const ref = db.ref('mercado/' + id);
  let dados = null;
  ref.transaction(atual => {
    if (atual === null) return;
    dados = atual;
    return null;
  }, (erro, commited) => {
    if (erro || !commited || !dados) return;
    const meuId = obterJogadorId();
    if (dados.vendedorId !== meuId) return; // só o dono pode cancelar
    const col = getColecao();
    if (!col[dados.idCarta]) col[dados.idCarta] = [];
    col[dados.idCarta].push(dados.bonus || { atributo: null, valor: 0 });
    setColecao(col);
    avisar('Anúncio cancelado, carta de volta à sua coleção.');
    if (typeof renderizarColecao === 'function') renderizarColecao();
    if (typeof renderizarGaleria === 'function') renderizarGaleria();
    renderizarMinhasVendas();
  });
}

// ---------- Comprar anúncio (tipo 'venda') ----------
function comprarAnuncioMercado(id) {
  if (!db) return;
  const anuncioCache = mercadoListagens[id];
  if (!anuncioCache) return;
  const meuId = obterJogadorId();
  if (anuncioCache.vendedorId === meuId) { avisar('Você não pode comprar seu próprio anúncio.'); return; }
  if (getMoedas() < anuncioCache.preco) { avisar('Moedas insuficientes para comprar essa carta.'); return; }

  const ref = db.ref('mercado/' + id);
  let dados = null;
  ref.transaction(atual => {
    if (atual === null) return;
    dados = atual;
    return null; // remove o anúncio (claim atômico)
  }, (erro, commited) => {
    if (erro || !commited || !dados) { avisar('Esse anúncio já não está mais disponível.'); return; }
    if (getMoedas() < dados.preco) {
      // raríssimo: moedas mudaram entre o clique e a transação. Devolve o anúncio.
      refMercado().child(id).set(dados);
      avisar('Moedas insuficientes para comprar essa carta.');
      return;
    }
    setMoedas(getMoedas() - dados.preco);
    const col = getColecao();
    if (!col[dados.idCarta]) col[dados.idCarta] = [];
    col[dados.idCarta].push(dados.bonus || { atributo: null, valor: 0 });
    setColecao(col);

    // Credita o vendedor (mesmo se ele estiver offline)
    refCreditosPendentes(dados.vendedorId).transaction(v => (v || 0) + dados.preco);

    const nomeCarta = buscarCartaPorId(dados.idCarta)?.nome || 'carta';
    avisar(`Você comprou ${nomeCarta} por ${dados.preco} moedas!`);
    if (typeof atualizarDisplayMoedas === 'function') atualizarDisplayMoedas();
    if (typeof renderizarColecao === 'function') renderizarColecao();
    if (typeof renderizarGaleria === 'function') renderizarGaleria();
  });
}

// ---------- Trocar anúncio (tipo 'troca') ----------
function trocarAnuncioMercado(id) {
  if (!db) return;
  const anuncioCache = mercadoListagens[id];
  if (!anuncioCache) return;
  const meuId = obterJogadorId();
  if (anuncioCache.vendedorId === meuId) { avisar('Você não pode trocar com seu próprio anúncio.'); return; }

  const minhaCol = getColecao();
  const minhasCopias = minhaCol[anuncioCache.cartaDesejadaId] || [];
  if (minhasCopias.length === 0) {
    const nomeDesejada = buscarCartaPorId(anuncioCache.cartaDesejadaId)?.nome || 'a carta pedida';
    avisar(`Você não tem ${nomeDesejada} para oferecer nessa troca.`);
    return;
  }

  const ref = db.ref('mercado/' + id);
  let dados = null;
  ref.transaction(atual => {
    if (atual === null) return;
    dados = atual;
    return null;
  }, (erro, commited) => {
    if (erro || !commited || !dados) { avisar('Esse anúncio já não está mais disponível.'); return; }

    const col = getColecao();
    const lista = col[dados.cartaDesejadaId] || [];
    if (lista.length === 0) {
      // Não tinha mais a carta pedida (mudou nesse meio tempo): devolve o anúncio.
      refMercado().child(id).set(dados);
      avisar('Você não tem mais a carta pedida nessa troca.');
      return;
    }
    const minhaOferta = lista.pop();
    col[dados.cartaDesejadaId] = lista;
    if (!col[dados.idCarta]) col[dados.idCarta] = [];
    col[dados.idCarta].push(dados.bonus || { atributo: null, valor: 0 });
    setColecao(col);

    // Manda a carta oferecida pro vendedor (mesmo se ele estiver offline)
    refCartasPendentes(dados.vendedorId).push({
      idCarta: dados.cartaDesejadaId,
      bonus: minhaOferta || { atributo: null, valor: 0 }
    });

    const nomeRecebida = buscarCartaPorId(dados.idCarta)?.nome || 'carta';
    avisar(`Troca concluída! Você recebeu ${nomeRecebida}.`);
    if (typeof renderizarColecao === 'function') renderizarColecao();
    if (typeof renderizarGaleria === 'function') renderizarGaleria();
  });
}

// ---------- Renderização ----------
function formatarBonusTexto(bonus) {
  if (typeof montarTagsBonusLoot === 'function') return montarTagsBonusLoot(bonus, 'mercado-item-bonus');
  // fallback caso loot.js não tenha carregado ainda
  if (!bonus) return '';
  return '';
}

function renderizarMercado() {
  const lista = document.getElementById('mercado-lista');
  if (!lista) return;
  if (!db) {
    lista.innerHTML = '<p class="colecao-vazia">Mercado indisponível offline. Conecte-se à internet pra negociar com outros jogadores.</p>';
    return;
  }
  const meuId = typeof obterJogadorId === 'function' ? obterJogadorId() : null;
  const itens = Object.entries(mercadoListagens)
    .filter(([, a]) => a.vendedorId !== meuId)
    .sort((a, b) => b[1].criadoEm - a[1].criadoEm);

  if (itens.length === 0) {
    lista.innerHTML = '<p class="colecao-vazia">Nenhum anúncio disponível no momento. Volte mais tarde!</p>';
    return;
  }

  const minhaCol = getColecao();

  lista.innerHTML = '';
  itens.forEach(([id, a]) => {
    const carta = buscarCartaPorId(a.idCarta);
    if (!carta) return;
    const el = document.createElement('div');
    el.className = 'mercado-item';
    const podeTrocar = a.tipo === 'troca' && (minhaCol[a.cartaDesejadaId] || []).length > 0;
    const podeComprar = a.tipo === 'venda' && getMoedas() >= a.preco;
    el.innerHTML = `
      <img src="${carta.imagem}" alt="${carta.nome}">
      <div class="mercado-item-info">
        <span class="mercado-item-nome">${carta.nome} ${formatarBonusTexto(a.bonus)}</span>
        <span class="mercado-item-rar" style="color:var(--cor-${carta.raridade})">${MOLDURAS[carta.raridade].nome}</span>
        <span class="mercado-item-vendedor">de ${a.vendedorNome}</span>
        ${a.tipo === 'venda'
          ? `<span class="mercado-item-preco">🪙 ${a.preco}</span>`
          : `<span class="mercado-item-preco">🔁 pede: ${buscarCartaPorId(a.cartaDesejadaId)?.nome || '?'}</span>`}
      </div>
      <button class="btn-secundario mercado-item-acao" ${a.tipo === 'venda' ? (podeComprar ? '' : 'disabled') : (podeTrocar ? '' : 'disabled')}>
        ${a.tipo === 'venda' ? 'Comprar' : 'Trocar'}
      </button>
    `;
    el.querySelector('.mercado-item-acao').addEventListener('click', () => {
      if (a.tipo === 'venda') comprarAnuncioMercado(id);
      else trocarAnuncioMercado(id);
    });
    lista.appendChild(el);
  });
}

function renderizarMinhasVendas() {
  const lista = document.getElementById('mercado-minhas-vendas');
  if (!lista) return;
  const meuId = typeof obterJogadorId === 'function' ? obterJogadorId() : null;
  const meus = Object.entries(mercadoListagens).filter(([, a]) => a.vendedorId === meuId);

  if (meus.length === 0) {
    lista.innerHTML = '<p class="colecao-vazia">Você não tem anúncios ativos.</p>';
    return;
  }
  lista.innerHTML = '';
  meus.forEach(([id, a]) => {
    const carta = buscarCartaPorId(a.idCarta);
    if (!carta) return;
    const el = document.createElement('div');
    el.className = 'mercado-item';
    el.innerHTML = `
      <img src="${carta.imagem}" alt="${carta.nome}">
      <div class="mercado-item-info">
        <span class="mercado-item-nome">${carta.nome} ${formatarBonusTexto(a.bonus)}</span>
        <span class="mercado-item-rar" style="color:var(--cor-${carta.raridade})">${MOLDURAS[carta.raridade].nome}</span>
        ${a.tipo === 'venda'
          ? `<span class="mercado-item-preco">🪙 ${a.preco}</span>`
          : `<span class="mercado-item-preco">🔁 pede: ${buscarCartaPorId(a.cartaDesejadaId)?.nome || '?'}</span>`}
      </div>
      <button class="btn-secundario mercado-item-acao">Cancelar</button>
    `;
    el.querySelector('.mercado-item-acao').addEventListener('click', () => cancelarAnuncioMercado(id));
    lista.appendChild(el);
  });
}

function renderizarFormVenderMercado() {
  const select = document.getElementById('mercado-select-carta');
  const selectDesejada = document.getElementById('mercado-select-desejada');
  if (!select) return;
  const col = getColecao();
  const cartasComSpare = CARTAS.filter(c => (col[c.id] || []).length > 1);

  select.innerHTML = cartasComSpare.length === 0
    ? '<option value="">Nenhuma carta repetida disponível</option>'
    : cartasComSpare.map(c => `<option value="${c.id}">${c.nome} (×${col[c.id].length})</option>`).join('');

  if (selectDesejada) {
    selectDesejada.innerHTML = CARTAS.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
  }

  const btnPublicar = document.getElementById('btn-mercado-publicar');
  if (btnPublicar) btnPublicar.disabled = cartasComSpare.length === 0;
}

function alternarTipoAnuncioMercado(tipo) {
  document.querySelectorAll('.mercado-tipo-btn').forEach(b => b.classList.toggle('ativo', b.dataset.tipo === tipo));
  const campoPreco = document.getElementById('mercado-campo-preco');
  const campoTroca = document.getElementById('mercado-campo-troca');
  if (campoPreco) campoPreco.style.display = tipo === 'venda' ? '' : 'none';
  if (campoTroca) campoTroca.style.display = tipo === 'troca' ? '' : 'none';
}

function mostrarAbaMercado(aba) {
  mercadoAbaAtiva = aba;
  document.querySelectorAll('.mercado-aba-btn').forEach(b => b.classList.toggle('ativo', b.dataset.aba === aba));
  document.querySelectorAll('.mercado-aba-conteudo').forEach(c => c.style.display = c.dataset.aba === aba ? '' : 'none');
  if (aba === 'comprar') renderizarMercado();
  if (aba === 'vender') { renderizarFormVenderMercado(); renderizarMinhasVendas(); }
}

// ---------- Listener em tempo real ----------
function iniciarListenerMercado() {
  if (!db) return;
  mercadoListenerRef = refMercado();
  mercadoListenerRef.on('value', snap => {
    mercadoListagens = snap.val() || {};
    if (mercadoAbaAtiva === 'comprar') renderizarMercado();
    else renderizarMinhasVendas();
  });
}

// ---------- Init UI ----------
function iniciarUIMercado() {
  document.querySelectorAll('.mercado-aba-btn').forEach(btn => {
    btn.addEventListener('click', () => mostrarAbaMercado(btn.dataset.aba));
  });
  document.querySelectorAll('.mercado-tipo-btn').forEach(btn => {
    btn.addEventListener('click', () => alternarTipoAnuncioMercado(btn.dataset.tipo));
  });

  const btnPublicar = document.getElementById('btn-mercado-publicar');
  if (btnPublicar) {
    btnPublicar.addEventListener('click', () => {
      const idCarta = document.getElementById('mercado-select-carta').value;
      if (!idCarta) { avisar('Escolha uma carta para anunciar.'); return; }
      const tipoBtn = document.querySelector('.mercado-tipo-btn.ativo');
      const tipo = tipoBtn ? tipoBtn.dataset.tipo : 'venda';
      if (tipo === 'venda') {
        const preco = parseInt(document.getElementById('mercado-input-preco').value, 10);
        if (!preco || preco <= 0) { avisar('Digite um preço válido.'); return; }
        criarAnuncioMercado({ idCarta, tipo: 'venda', preco });
      } else {
        const cartaDesejadaId = document.getElementById('mercado-select-desejada').value;
        if (!cartaDesejadaId) { avisar('Escolha a carta que você quer em troca.'); return; }
        criarAnuncioMercado({ idCarta, tipo: 'troca', cartaDesejadaId });
      }
    });
  }

  mostrarAbaMercado('comprar');
  alternarTipoAnuncioMercado('venda');
  iniciarListenerMercado();
}

window.iniciarUIMercado = iniciarUIMercado;
window.reivindicarPendenciasMercado = reivindicarPendenciasMercado;
