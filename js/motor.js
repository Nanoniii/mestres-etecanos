// =====================================================
// MESTRES ETECANOS - Motor do jogo
// =====================================================

function clonarCartaBase(cartaBase) {
  const instancia = JSON.parse(JSON.stringify(cartaBase));
  instancia.uid = `${cartaBase.id}_${Math.random().toString(36).slice(2, 8)}`;
  // Cada carta em campo tem sua própria vida (50 por padrão)
  instancia.vida = cartaBase.vidaMax || VIDA_CARTA;
  instancia.vidaMax = cartaBase.vidaMax || VIDA_CARTA;
  instancia.mana = 0;
  instancia.colocadaNoTurno = null;
  instancia.podeAtacar = false;
  instancia.escudoAtivoTurnos = 0;
  instancia.destruida = false;
  instancia.habilidadeUsosRestantes = (cartaBase.habilidade && cartaBase.habilidade.usosMax) || Infinity;
  return instancia;
}

class Jogador {
  constructor(nome, ehCPU) {
    this.nome = nome;
    this.ehCPU = ehCPU;
    this.vida = VIDA_INICIAL;
    this.vidaMax = VIDA_INICIAL;
    this.baralho = []; // cartas-base escolhidas (até 4, repetição permitida)
    this.mao = []; // instâncias de carta disponíveis pra jogar
    this.campo = []; // instâncias de carta em jogo
    this.cartasIniciaisJogadasGratis = 0;
    this.turnosPulados = 0;
    this.acoesExtraNoTurno = 0;
    this.vivo = true;
    this.escudoPendente = null; // carta escolhida como escudo no momento de ser atacado
  }
}

class EstadoJogo {
  constructor(jogadores) {
    this.jogadores = jogadores; // ordem anti-horária já aplicada
    this.turnoIndice = Math.floor(Math.random() * jogadores.length);
    this.log = [];
    this.numeroTurno = 1;
    this.jogoEncerrado = false;
    this.vencedor = null;
  }

  jogadorAtual() {
    return this.jogadores[this.turnoIndice];
  }

  jogadoresVivos() {
    return this.jogadores.filter(j => j.vivo);
  }

  proximoJogadorVivo(referencia) {
    const vivos = this.jogadoresVivos();
    const idxRef = this.jogadores.indexOf(referencia);
    for (let passo = 1; passo <= this.jogadores.length; passo++) {
      const cand = this.jogadores[(idxRef + passo) % this.jogadores.length];
      if (cand.vivo) return cand;
    }
    return referencia;
  }

  cartasDoJogador(jogador) {
    return jogador.campo.filter(c => !c.destruida);
  }

  cartasInimigasVivas(jogadorAtual) {
    return this.jogadores
      .filter(j => j !== jogadorAtual && j.vivo)
      .flatMap(j => j.campo.filter(c => !c.destruida));
  }

  piorCartaDoJogador(jogador) {
    const cartas = this.cartasDoJogador(jogador);
    if (cartas.length === 0) return null;
    return cartas.reduce((pior, c) => (c.atq + c.def < pior.atq + pior.def ? c : pior));
  }

  logar(mensagens) {
    if (!mensagens) return;
    const lista = Array.isArray(mensagens) ? mensagens : [mensagens];
    lista.forEach(m => this.log.push(m));
  }

  // ---------- Compra / baralho ----------
  // Regra: "o número máximo de cartas é 4. Caso use uma habilidade tipo a de
  // comprar 2 cartas, o limite é burlado apenas UMA VEZ" — ou seja, uma única
  // ativação de habilidade de compra pode deixar a mão acima de 4 cartas,
  // mas isso não se acumula em compras futuras.
  comprarCartas(jogador, quantidade) {
    let comprou = 0;
    for (let i = 0; i < quantidade; i++) {
      const baseAleatoria = jogador.baralho[Math.floor(Math.random() * jogador.baralho.length)];
      if (!baseAleatoria) break;
      jogador.mao.push(clonarCartaBase(baseAleatoria));
      comprou++;
    }
    return comprou;
  }

  transferirCarta(carta, deJogador, paraJogador) {
    deJogador.campo = deJogador.campo.filter(c => c !== carta);
    deJogador.mao = deJogador.mao.filter(c => c !== carta);
    paraJogador.mao.push(carta);
  }

  // ---------- Bônus de raridade e equipe ----------
  calcularBonusRaridade(jogador) {
    const cartas = this.cartasDoJogador(jogador);
    const porRaridade = {};
    cartas.forEach(c => {
      porRaridade[c.raridade] = (porRaridade[c.raridade] || 0) + 1;
    });
    const bonus = { atq: 0, def: 0 };
    if ((porRaridade[RARIDADE.INICIAL] || 0) >= 3) {
      bonus.atq += 10; // simplificação: aplica em ambos status de preferência -> aqui ATQ
    }
    if ((porRaridade[RARIDADE.RARO] || 0) >= 2) {
      bonus.atq += 10;
    }
    return bonus;
  }

  calcularBonusEquipe(jogador) {
    const cartas = this.cartasDoJogador(jogador);
    const porEquipe = {};
    cartas.forEach(c => {
      if (c.equipe && c.equipe !== EQUIPE.NENHUMA) {
        porEquipe[c.equipe] = (porEquipe[c.equipe] || 0) + 1;
      }
    });
    const bonus = { atq: 0, def: 0 };

    const qtdHumanas = porEquipe[EQUIPE.HUMANAS] || 0;
    if (qtdHumanas >= 2) {
      const extra = qtdHumanas - 2; // "aumenta com base nas cartas"
      bonus.atq += 2 + extra;
      bonus.def += 2 + extra;
    }

    const qtdExatas = porEquipe[EQUIPE.EXATAS] || 0;
    if (qtdExatas >= 2) {
      const extra = qtdExatas - 2;
      bonus.atq += 2 + extra;
      bonus.def += 2 + extra;
    }

    const qtdTecnico = porEquipe[EQUIPE.TECNICO] || 0;
    if (qtdTecnico >= 2) {
      bonus.atq += qtdTecnico >= 4 ? 2 : 1;
      bonus.def += qtdTecnico >= 4 ? 2 : 1;
    }

    const qtdLinguagens = porEquipe[EQUIPE.LINGUAGENS] || 0;
    if (qtdLinguagens >= 2) {
      bonus.atq += 3;
      bonus.def += 3;
    }

    return bonus;
  }

  statusEfetivos(carta, jogador) {
    const bonusRaridade = this.calcularBonusRaridade(jogador);
    const bonusEquipe = this.calcularBonusEquipe(jogador);
    const atq =
      carta.atq +
      (carta.bonusAtqTemporario || 0) +
      bonusRaridade.atq +
      bonusEquipe.atq;
    const def =
      carta.def +
      (carta.bonusDefTemporario || 0) +
      bonusRaridade.def +
      bonusEquipe.def;
    return { atq, def };
  }

  // ---------- Combate ----------
  aplicarDano(jogadorAlvo, dano) {
    jogadorAlvo.vida = Math.max(0, jogadorAlvo.vida - dano);
    if (jogadorAlvo.vida <= 0) {
      jogadorAlvo.vivo = false;
      this.logar(`${jogadorAlvo.nome} foi eliminado!`);
      this.checarFimDeJogo();
    }
  }

  checarFimDeJogo() {
    const vivos = this.jogadoresVivos();
    if (vivos.length <= 1) {
      this.jogoEncerrado = true;
      this.vencedor = vivos[0] || null;
    }
  }

  // Ataque: cartaAtacante (do atacante) contra uma carta inimiga alvo (cartaAlvo).
  // O dano penetra a DEF da carta alvo e reduz a vida dela.
  // Se a carta alvo morrer, o excesso de dano vai para a vida do jogador dono.
  // Se o defensor não tiver cartas em campo, o dano vai direto ao jogador.
  executarAtaque(jogadorAtacante, cartaAtacante, jogadorDefensor, cartaAlvo = null) {
    if (cartaAtacante.inutilizavelPorTurnos > 0) {
      this.logar(`${cartaAtacante.nome} está inutilizável e não pôde atacar.`);
      return;
    }
    if (cartaAtacante.paralisadoPorTurnos > 0) {
      this.logar(`${cartaAtacante.nome} está paralisada e não pôde atacar.`);
      return;
    }

    const statusAtacante = this.statusEfetivos(cartaAtacante, jogadorAtacante);
    let ignorarDefesaPercentual = cartaAtacante.proximoAtaqueIgnoraDefesa || 0;
    let boostPercentual = cartaAtacante.proximoAtaqueBoostPercentual || 0;
    let danoBase = Math.round(statusAtacante.atq * (1 + boostPercentual));

    const cartasDefensoras = this.cartasDoJogador(jogadorDefensor);

    // Se não há cartas em campo, dano vai direto ao jogador
    if (cartasDefensoras.length === 0) {
      this.logar(`${cartaAtacante.nome} atacou ${jogadorDefensor.nome} diretamente! Dano: ${danoBase}.`);
      this.aplicarDano(jogadorDefensor, danoBase);
    } else {
      // Escolhe a carta alvo: a escolhida explicitamente, ou a de maior DEF (tanque natural)
      const alvo = (cartaAlvo && !cartaAlvo.destruida && cartasDefensoras.includes(cartaAlvo))
        ? cartaAlvo
        : cartasDefensoras.reduce((a, b) => {
            const sA = this.statusEfetivos(a, jogadorDefensor);
            const sB = this.statusEfetivos(b, jogadorDefensor);
            return sB.def > sA.def ? b : a;
          });

      const statusAlvo = this.statusEfetivos(alvo, jogadorDefensor);
      let defEfetiva = statusAlvo.def;
      if (ignorarDefesaPercentual > 0) {
        defEfetiva = Math.round(defEfetiva * (1 - ignorarDefesaPercentual));
      }

      const danoNaCarta = Math.max(0, danoBase - defEfetiva);
      const vidaAntes = alvo.vida;
      alvo.vida = Math.max(0, alvo.vida - danoNaCarta);

      if (alvo.vida <= 0 && vidaAntes > 0) {
        // Carta destruída — excesso vai ao jogador
        const excesso = danoNaCarta - vidaAntes;
        alvo.destruida = true;
        jogadorDefensor.campo = jogadorDefensor.campo.filter(c => c !== alvo);
        this.logar(`${cartaAtacante.nome} destruiu ${alvo.nome}! (DEF efetiva ${defEfetiva}, dano ${danoNaCarta})`);
        if (excesso > 0) {
          this.logar(`Dano excedente de ${excesso} foi para ${jogadorDefensor.nome}.`);
          this.aplicarDano(jogadorDefensor, excesso);
        }
      } else {
        this.logar(`${cartaAtacante.nome} atacou ${alvo.nome}! DEF efetiva: ${defEfetiva}. Dano na carta: ${danoNaCarta}. Vida restante: ${alvo.vida}/${alvo.vidaMax}.`);
      }
    }

    cartaAtacante.proximoAtaqueIgnoraDefesa = 0;
    cartaAtacante.proximoAtaqueBoostPercentual = 0;
    cartaAtacante.jaAtacouNoTurno = true;

    // Ação extra (ex: Atestado Cancelado) libera a carta pra atacar de novo
    if (jogadorAtacante.acoesExtraNoTurno > 0) {
      jogadorAtacante.acoesExtraNoTurno -= 1;
      cartaAtacante.jaAtacouNoTurno = false;
      this.logar(`${jogadorAtacante.nome} usou uma ação extra: ${cartaAtacante.nome} pode atacar de novo.`);
    }
  }

  definirEscudo(jogador, carta) {
    jogador.escudoPendente = carta;
    carta.escudoAtivoTurnos = 2; // "não ataca por 2 turnos"
    this.logar(`${jogador.nome} escolheu ${carta.nome} como escudo.`);
  }

  // ---------- Colocação de cartas e custos ----------
  // Observação de regras: "sacrificar 1 carta do seu baralho" significa descartar
  // outra carta como custo de entrada — não exige que já exista algo em campo.
  // Raro é o único caso que exige uma carta Inicial JÁ em campo (pré-requisito de
  // campo, não de sacrifício).
  podeColocarCarta(jogador, cartaBase, cartaSendoJogada = null) {
    const cartasNoCampo = this.cartasDoJogador(jogador).length;
    if (cartasNoCampo >= LIMITE_BARALHO) return { ok: false, motivo: 'Limite de cartas em campo atingido.' };

    const maoDisponivelParaSacrificio = (excluir) =>
      jogador.mao.filter(c => c !== excluir);

    switch (cartaBase.raridade) {
      case RARIDADE.INICIAL:
        return { ok: true };

      case RARIDADE.RARO: {
        const temInicial = this.cartasDoJogador(jogador).some(c => c.raridade === RARIDADE.INICIAL);
        if (!temInicial) return { ok: false, motivo: 'Precisa ter 1 carta Inicial em campo.' };
        return { ok: true, atrasoTurno: true };
      }

      case RARIDADE.LENDARIO: {
        const candidatos = maoDisponivelParaSacrificio(cartaSendoJogada);
        if (candidatos.length === 0) {
          return { ok: false, motivo: 'Precisa sacrificar 1 outra carta da mão.' };
        }
        return { ok: true, exigeSacrificioMao: 1 };
      }

      case RARIDADE.MITICO: {
        const candidatos = maoDisponivelParaSacrificio(cartaSendoJogada);
        const temLendariaDisponivel =
          candidatos.some(c => c.raridade === RARIDADE.LENDARIO) ||
          this.cartasDoJogador(jogador).some(c => c.raridade === RARIDADE.LENDARIO);
        if (!temLendariaDisponivel) {
          return { ok: false, motivo: 'Precisa ter ou sacrificar ao menos 1 carta Lendária.' };
        }
        if (candidatos.length < 1) {
          return { ok: false, motivo: 'Precisa sacrificar mais 1 carta além da Lendária.' };
        }
        return { ok: true, exigeSacrificioMao: 1, exigeLendariaDisponivel: true };
      }

      default:
        return { ok: false, motivo: 'Raridade desconhecida.' };
    }
  }

  // Sacrifica até `quantidade` cartas da mão do jogador (excluindo a que está sendo jogada)
  // e devolve quantas foram sacrificadas.
  sacrificarCartasDaMao(jogador, cartaSendoJogada, quantidade) {
    let sacrificadas = 0;
    for (let i = 0; i < quantidade; i++) {
      const candidato = jogador.mao.find(c => c !== cartaSendoJogada);
      if (!candidato) break;
      jogador.mao = jogador.mao.filter(c => c !== candidato);
      this.logar(`${candidato.nome} foi sacrificada como custo de invocação.`);
      sacrificadas++;
    }
    return sacrificadas;
  }

  colocarCarta(jogador, instanciaCarta, virarParaBaixo = false) {
    if (!jogador.mao.includes(instanciaCarta)) {
      this.logar(`Tentativa inválida de colocar ${instanciaCarta.nome}: a carta não está mais na mão.`);
      return;
    }
    const cartaBase = buscarCartaPorId(instanciaCarta.id);
    const verificacao = this.podeColocarCarta(jogador, cartaBase, instanciaCarta);

    if (verificacao.exigeSacrificioMao) {
      this.sacrificarCartasDaMao(jogador, instanciaCarta, verificacao.exigeSacrificioMao);
    }

    instanciaCarta.colocadaNoTurno = this.numeroTurno;
    instanciaCarta.podeAtacar = false; // só ataca 1 turno depois
    instanciaCarta.viradaParaBaixo = virarParaBaixo;
    jogador.campo.push(instanciaCarta);
    jogador.mao = jogador.mao.filter(c => c !== instanciaCarta);
  }

  // ---------- Passagem de turno ----------
  passarTurno() {
    const jogador = this.jogadorAtual();

    // Recarrega mana e libera cartas que já cumpriram o "1 turno de espera"
    this.cartasDoJogador(jogador).forEach(c => {
      if (c.mana < c.manaMax) c.mana = Math.min(c.manaMax, c.mana + 1);
      if (!c.podeAtacar && c.colocadaNoTurno !== null && c.colocadaNoTurno < this.numeroTurno) {
        c.podeAtacar = true;
      }
      c.jaAtacouNoTurno = false;
      if (c.inutilizavelPorTurnos > 0) c.inutilizavelPorTurnos--;
      if (c.paralisadoPorTurnos > 0) c.paralisadoPorTurnos--;
      if (c.habilidadeCanceladaPorTurnos > 0) c.habilidadeCanceladaPorTurnos--;
      if (c.escudoAtivoTurnos > 0) {
        c.escudoAtivoTurnos--;
        if (c.escudoAtivoTurnos === 0 && jogador.escudoPendente === c) jogador.escudoPendente = null;
      }
      if (c.bonusAtqTemporarioTurnos > 0) {
        c.bonusAtqTemporarioTurnos--;
        if (c.bonusAtqTemporarioTurnos === 0) c.bonusAtqTemporario = 0;
      }
      if (c.bonusDefTemporarioTurnos > 0) {
        c.bonusDefTemporarioTurnos--;
        if (c.bonusDefTemporarioTurnos === 0) c.bonusDefTemporario = 0;
      }
    });

    jogador.acoesExtraNoTurno = 0;
    jogador.escudoPendente = jogador.escudoPendente; // mantém até expirar

    let proximo = this.proximoJogadorVivo(jogador);
    while (proximo.turnosPulados > 0 && proximo !== jogador) {
      this.logar(`${proximo.nome} perdeu o turno (efeito ativo).`);
      proximo.turnosPulados--;
      proximo = this.proximoJogadorVivo(proximo);
    }

    this.turnoIndice = this.jogadores.indexOf(proximo);
    this.numeroTurno++;
  }
}

// ---------- IA aprimorada para CPU ----------
const IA = {
  // Retorna uma lista de ações para executar neste turno (pode ser múltiplas)
  decidirAcao(jogo, jogador) {
    // 0. Garante carta-escudo escolhida quando possível
    if (!jogador.escudoPendente) {
      const candidatosEscudo = jogo.cartasDoJogador(jogador).filter(c => c.escudoAtivoTurnos === 0);
      if (candidatosEscudo.length > 1) {
        const melhorDefensora = candidatosEscudo.reduce((a, b) => (b.def > a.def ? b : a));
        jogo.definirEscudo(jogador, melhorDefensora);
      }
    }

    // 1. Tenta colocar carta da mão se o campo estiver vazio ou tiver espaço
    const colocavel = jogador.mao.find(c => {
      const v = jogo.podeColocarCarta(jogador, c, c);
      return v.ok;
    });
    if (colocavel && jogo.cartasDoJogador(jogador).length < 2) {
      return { tipo: 'colocar', carta: colocavel };
    }

    // 2. Usa habilidade se tiver mana e houver alvo inimigo
    const cartasComHabilidade = jogo.cartasDoJogador(jogador).filter(c => {
      if (c.habilidadeCanceladaPorTurnos > 0 || c.inutilizavelPorTurnos > 0 || c.paralisadoPorTurnos > 0) return false;
      const habs = c.habilidades || (c.habilidade ? [c.habilidade] : []);
      return habs.some(h => c.mana >= (h.custoMana === 'todas' ? c.manaMax : h.custoMana) &&
        (h.usosMax === undefined || c.habilidadeUsosRestantes > 0));
    });

    if (cartasComHabilidade.length > 0) {
      const cartaHab = cartasComHabilidade[0];
      const habs = cartaHab.habilidades || (cartaHab.habilidade ? [cartaHab.habilidade] : []);
      const hab = habs.find(h => cartaHab.mana >= (h.custoMana === 'todas' ? cartaHab.manaMax : h.custoMana));
      if (hab) {
        const idHab = hab.id;
        const inimigos = jogo.cartasInimigasVivas(jogador);
        const alvosJogadores = jogo.jogadoresVivos().filter(j => j !== jogador);

        let alvo = null;
        // Habilidades com alvo em carta inimiga
        if (['silence_please', 'e_joguinho', 'coordenador_em', 'tinkercad'].includes(idHab)) {
          if (inimigos.length === 0) {
            // sem alvo, pula habilidade
          } else {
            // alvo: carta inimiga com mais ATQ (ameaça maior)
            alvo = inimigos.reduce((a, b) => ((b.atq || 0) > (a.atq || 0) ? b : a));
            return { tipo: 'habilidade', carta: cartaHab, hab, alvo };
          }
        } else if (['sono', 'sem_professor'].includes(idHab)) {
          // alvo é jogador com mais vida (mais ameaçador a longo prazo)
          alvo = alvosJogadores.reduce((a, b) => (b.vida > a.vida ? b : a));
          return { tipo: 'habilidade', carta: cartaHab, hab, alvo };
        } else {
          // habilidades sem alvo (visita_tecnica, queda_livre, birosca, etc.)
          return { tipo: 'habilidade', carta: cartaHab, hab, alvo: null };
        }
      }
    }

    // 3. Ataca com a carta de maior ATQ disponível — alvo: jogador com menos vida
    const cartas = jogo.cartasDoJogador(jogador).filter(
      c => c.podeAtacar && !c.jaAtacouNoTurno && !c.inutilizavelPorTurnos && !c.paralisadoPorTurnos && c !== jogador.escudoPendente
    );

    if (cartas.length > 0) {
      // Ordena por ATQ decrescente para usar a mais forte
      cartas.sort((a, b) => {
        const sA = jogo.statusEfetivos(a, jogador);
        const sB = jogo.statusEfetivos(b, jogador);
        return sB.atq - sA.atq;
      });
      const melhorAtacante = cartas[0];
      const alvos = jogo.jogadoresVivos().filter(j => j !== jogador);
      // Prioriza jogador com menos vida para eliminar mais rápido
      const alvoJogador = alvos.reduce((a, b) => (b.vida < a.vida ? b : a));

      // Escolhe carta alvo: prefere a com menos vida (mais perto de morrer)
      const cartasInimigas = jogo.cartasDoJogador(alvoJogador);
      const cartaAlvo = cartasInimigas.length > 0
        ? cartasInimigas.reduce((a, b) => (b.vida < a.vida ? b : a))
        : null;

      return { tipo: 'atacar', carta: melhorAtacante, alvo: alvoJogador, cartaAlvo };
    }

    // 4. Tenta colocar carta mesmo com campo ocupado
    if (colocavel) {
      return { tipo: 'colocar', carta: colocavel };
    }

    return { tipo: 'passar' };
  }
};
