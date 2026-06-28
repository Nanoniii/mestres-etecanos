// =====================================================
// MESTRES ETECANOS - Habilidades
// =====================================================
// Cada função recebe (jogo, jogadorAtual, cartaAtivada, alvoOpcional)
// e devolve um array de strings de log descrevendo o que aconteceu.
// `jogo` é a instância de EstadoJogo (ver motor.js).

const Habilidades = {
  atestado_cancelado(jogo, jogador, carta) {
    // Vida é atributo do JOGADOR (não da carta) — ver motor.js
    jogo.aplicarDano(jogador, 10);
    jogador.acoesExtraNoTurno += 1;
    return [`${carta.nome} usou Atestado Cancelado: ${jogador.nome} perdeu 10 de vida, mas ganhou uma ação extra no turno.`];
  },

  silence_please(jogo, jogador, carta, alvo) {
    const inimigos = jogo.cartasInimigasVivas(jogador);
    const escolhida = alvo || inimigos[Math.floor(Math.random() * inimigos.length)];
    if (!escolhida) return [`${carta.nome} tentou usar Silence, please, mas não havia alvo.`];
    escolhida.inutilizavelPorTurnos = (escolhida.inutilizavelPorTurnos || 0) + 1;
    return [`${carta.nome} usou Silence, please em ${escolhida.nome}: ela fica inutilizável no próximo turno.`];
  },

  visita_tecnica(jogo, jogador) {
    const compradas = jogo.comprarCartas(jogador, 2);
    return [`${jogador.nome} usou Visita Técnica e comprou ${compradas} carta(s).`];
  },

  queda_livre(jogo, jogador, carta) {
    carta.proximoAtaqueIgnoraDefesa = 0.5;
    carta.proximoAtaqueBoostPercentual = (carta.proximoAtaqueBoostPercentual || 0) + 0.15;
    return [`${carta.nome} usou Queda Livre: próximo ataque ignora 50% da defesa inimiga e ganha bônus de ataque.`];
  },

  sono(jogo, jogador, carta, alvoJogador) {
    if (carta.habilidadeUsosRestantes <= 0) {
      return [`${carta.nome} já usou Sono nesta partida.`];
    }
    const alvo = alvoJogador || jogo.proximoJogadorVivo(jogador);
    alvo.turnosPulados = (alvo.turnosPulados || 0) + 2;
    carta.habilidadeUsosRestantes -= 1;
    return [`${carta.nome} usou Sono: ${alvo.nome} perde os próximos 2 turnos.`];
  },

  tinkercad(jogo, jogador, carta, alvo) {
    const dano = carta.atq;
    if (alvo) {
      // alvo é uma carta inimiga — aplica dano ao JOGADOR dono dela
      const donoAlvo = jogo.jogadores.find(j => j.campo.includes(alvo));
      if (donoAlvo) jogo.aplicarDano(donoAlvo, dano);
      alvo.paralisadoPorTurnos = (alvo.paralisadoPorTurnos || 0) + 1;
    }
    return [`${carta.nome} usou Tinkercad: bomba de arduino causa ${dano} de dano extra e paralisa a carta alvo por 1 turno.`];
  },

  birosca(jogo, jogador, carta) {
    if (carta.habilidadeUsosRestantes <= 0) {
      return [`${carta.nome} já usou Birosca nesta partida.`];
    }
    carta.mana = 0;
    carta.bonusAtqTemporario = (carta.bonusAtqTemporario || 0) + 10;
    carta.bonusAtqTemporarioTurnos = 1;
    carta.habilidadeUsosRestantes -= 1;
    return [`${carta.nome} usou Birosca: gastou toda a mana e ganhou +10 de ATQ neste turno.`];
  },

  se_relar_dedo(jogo, jogador, carta) {
    if (carta.habilidadeUsosRestantes <= 0) {
      return [`${carta.nome} já usou essa habilidade nesta partida.`];
    }
    carta.mana = 0;
    carta.bonusAtqTemporario = (carta.bonusAtqTemporario || 0) + 10;
    carta.bonusDefTemporario = (carta.bonusDefTemporario || 0) + 10;
    carta.bonusAtqTemporarioTurnos = 1;
    carta.bonusDefTemporarioTurnos = 1;
    carta.habilidadeUsosRestantes -= 1;
    return [`${carta.nome} usou "Se Relar Um Dedo em Mim": +10 ATQ e +10 DEF neste turno.`];
  },

  pao_mortadela(jogo, jogador, carta) {
    // Vida é um atributo do JOGADOR (não da carta) — ver motor.js. Por isso a
    // cura recai sobre a vida do jogador que controla a carta.
    jogador.vida = Math.min(jogador.vidaMax, jogador.vida + 20);
    carta.bonusDefTemporario = (carta.bonusDefTemporario || 0) + 5;
    carta.bonusDefTemporarioTurnos = 2;
    return [`${carta.nome} usou Pão com Mortadela: ${jogador.nome} recupera 20 de vida e a carta ganha +5 de DEF por 2 turnos.`];
  },

  e_joguinho(jogo, jogador, carta, alvo) {
    if (carta.habilidadeUsosRestantes <= 0) {
      return [`${carta.nome} já usou É joguinho? nesta partida.`];
    }
    if (!alvo) {
      return [`${carta.nome} tentou usar É joguinho?, mas não havia alvo.`];
    }
    // Vida é um atributo do JOGADOR (não da carta) — ver motor.js. Por isso o
    // requisito "menos de 50% de vida" é checado no jogador que controla o alvo.
    const donoDoAlvo = jogo.jogadores.find(j => j.campo.includes(alvo));
    if (!donoDoAlvo || alvo.vida > alvo.vidaMax * 0.5) {
      return [`${carta.nome} tentou usar É joguinho?, mas a carta alvo não está com menos de 50% de vida.`];
    }
    alvo.destruida = true;
    donoDoAlvo.campo = donoDoAlvo.campo.filter(c => c !== alvo);
    carta.habilidadeUsosRestantes -= 1;
    return [`${carta.nome} usou É joguinho? e destruiu ${alvo.nome}!`];
  },

  banco_de_dados(jogo, jogador, carta) {
    // Cura 25% da vida de CADA carta em campo do jogador
    let totalCurado = 0;
    jogo.cartasDoJogador(jogador).forEach(c => {
      const cura = Math.floor(c.vidaMax * 0.25);
      const antes = c.vida;
      c.vida = Math.min(c.vidaMax, c.vida + cura);
      totalCurado += c.vida - antes;
    });
    return [`${carta.nome} usou "Agora é Banco de Dados!": restaurou vida de todas as cartas em campo (total +${totalCurado}).`];
  },

  coordenador_em(jogo, jogador, carta, alvo) {
    if (carta.usosCoordenador === undefined) carta.usosCoordenador = 2;
    if (carta.usosCoordenador <= 0) {
      return [`${carta.nome} já usou Coordenador do Ensino Médio o máximo de vezes.`];
    }
    const inimigos = jogo.cartasInimigasVivas(jogador);
    const escolhida = alvo || inimigos[Math.floor(Math.random() * inimigos.length)];
    if (!escolhida) return [`${carta.nome} tentou usar a habilidade, mas não havia alvo.`];
    escolhida.habilidadeCanceladaPorTurnos = 2;
    carta.usosCoordenador -= 1;
    return [`${carta.nome} usou Coordenador do Ensino Médio: cancela a habilidade de ${escolhida.nome} por 2 turnos.`];
  },

  aplicativo_pt(jogo, jogador, carta) {
    jogo.comprarCartas(jogador, 1);
    const piorCarta = jogo.piorCartaDoJogador(jogador);
    const inimigos = jogo.jogadoresVivos().filter(j => j !== jogador);
    const alvo = inimigos[Math.floor(Math.random() * inimigos.length)];
    let msg = `${carta.nome} comprou 1 carta.`;
    if (piorCarta && alvo) {
      jogo.transferirCarta(piorCarta, jogador, alvo);
      msg += ` Sua pior carta (${piorCarta.nome}) foi para ${alvo.nome}.`;
    }
    return [msg];
  },

  sem_professor(jogo, jogador, carta) {
    const proximo = jogo.proximoJogadorVivo(jogador);
    proximo.turnosPulados = (proximo.turnosPulados || 0) + 1;
    return [`${carta.nome} usou Sem Professor: bloqueia o turno de ${proximo.nome}.`];
  },

  // Cura 100% da vida de uma carta aliada (a própria carta, se não houver outra
  // aliada disponível, "se sacrifica" entrando direto na pilha de destruídas).
  lesao_joelho(jogo, jogador, carta, alvo) {
    const aliadas = jogo.cartasDoJogador(jogador).filter(c => c !== carta);
    const alvoFinal = (alvo && alvo !== carta && aliadas.includes(alvo))
      ? alvo
      : aliadas.reduce((pior, c) => (!pior || c.vida < pior.vida ? c : pior), null);

    carta.destruida = true;
    jogador.campo = jogador.campo.filter(c => c !== carta);
    if (jogador.escudoPendente === carta) jogador.escudoPendente = null;

    if (!alvoFinal) {
      return [`${carta.nome} usou Lesão no Joelho, mas não havia outra carta aliada em campo para curar — ela se sacrificou em vão.`];
    }

    alvoFinal.vida = alvoFinal.vidaMax;
    return [`${carta.nome} usou Lesão no Joelho: ${alvoFinal.nome} recuperou 100% da vida e ${carta.nome} se sacrificou.`];
  }
};

function executarHabilidade(idHabilidade, jogo, jogador, carta, alvo) {
  if (carta.habilidadeCanceladaPorTurnos > 0) {
    return [`A habilidade de ${carta.nome} está cancelada por mais ${carta.habilidadeCanceladaPorTurnos} turno(s) (Coordenador do Ensino Médio).`];
  }
  const fn = Habilidades[idHabilidade];
  if (!fn) {
    return [`Habilidade "${idHabilidade}" ainda não foi implementada.`];
  }
  return fn(jogo, jogador, carta, alvo);
}
