// =====================================================
// MESTRES ETECANOS - Banco de dados das cartas
// =====================================================
// Apenas matérias com arte finalizada entram no protótipo.
// Português, Inglês, Geografia, Artes, Física, P.A., Matemática,
// História, Química, P.W., S.E., B.D., PTIC e Biologia existem
// no documento de design, mas Inglês / Geografia / P.A. / Matemática
// ainda não têm carta-arte pronta — ficam de fora por ora.

const RARIDADE = {
  INICIAL: 'inicial',
  // COMUM tem exatamente a mesma regra de jogo que INICIAL (custo de colocação livre,
  // serve de pré-requisito de campo pra cartas Raras, mesmo bônus de raridade).
  // A ÚNICA diferença é que INICIAL é a única carta que o jogador já começa
  // desbloqueada; COMUM precisa ser obtida (caixa, loot etc.) como qualquer outra.
  COMUM: 'comum',
  RARO: 'raro',
  LENDARIO: 'lendario',
  MITICO: 'mitico'
};

const EQUIPE = {
  HUMANAS: 'humanas',
  TECNICO: 'tecnico',
  EXATAS: 'exatas',
  LINGUAGENS: 'linguagens',
  NENHUMA: 'nenhuma'
};

// Identificador único da habilidade -> lógica fica em habilidades.js
const VIDA_CARTA = 50; // vida inicial de cada carta em campo

// Balanceamento de defesa: a DEF reduz o dano em % (não em valor fixo),
// pra uma defesa alta nunca conseguir absorver 100% do ataque.
// mitigação = DEF / (DEF + K_DEFESA), limitada a MITIGACAO_MAXIMA_DEFESA.
const K_DEFESA = 25;
const MITIGACAO_MAXIMA_DEFESA = 0.75; // teto: defesa nunca reduz mais que 75% do dano

const CARTAS = [
  {
    id: 'portugues',
    nome: 'Português',
    pessoa: 'Ana Paula',
    raridade: RARIDADE.INICIAL,
    equipe: EQUIPE.LINGUAGENS,
    atq: 5,
    def: 20,
    vidaMax: VIDA_CARTA,
    manaMax: 3,
    imagem: 'assets/cartas/ana.jpg',
    habilidade: {
      id: 'atestado_cancelado',
      nome: 'Atestado Cancelado',
      custoMana: 3,
      usosMax: Infinity,
      descricao: 'Perde 10 de vida mas ganha mais uma ação no turno. Veio dar aula doente.'
    }
  },
  {
    id: 'ingles',
    nome: 'Inglês',
    pessoa: 'Karla',
    raridade: RARIDADE.COMUM,
    equipe: EQUIPE.LINGUAGENS,
    atq: 10,
    def: 10,
    vidaMax: VIDA_CARTA,
    manaMax: 6,
    imagem: 'assets/cartas/karla.jpg',
    habilidade: {
      id: 'silence_please',
      nome: 'Silence, please',
      custoMana: 6,
      usosMax: Infinity,
      descricao: 'Escolhe uma carta aleatória do oponente e deixa inutilizável por 1 turno.'
    }
  },
  {
    id: 'edfisica',
    nome: 'Educação Física',
    pessoa: 'Ana Paula',
    raridade: RARIDADE.COMUM,
    equipe: EQUIPE.NENHUMA,
    atq: 10,
    def: 20,
    vidaMax: VIDA_CARTA,
    manaMax: 6,
    imagem: 'assets/cartas/anap_edfisica.jpg',
    habilidade: {
      id: 'lesao_joelho',
      nome: 'Lesão no Joelho',
      custoMana: 6,
      usosMax: Infinity,
      descricao: 'Recupera 100% da vida de uma carta aliada, mas se sacrifica.'
    }
  },
  {
    id: 'artes',
    nome: 'Artes',
    pessoa: 'Michel',
    raridade: RARIDADE.RARO,
    equipe: EQUIPE.HUMANAS,
    atq: 15,
    def: 10,
    vidaMax: VIDA_CARTA,
    manaMax: 3,
    imagem: 'assets/cartas/michel.jpg',
    habilidade: {
      id: 'visita_tecnica',
      nome: 'Visita Técnica',
      custoMana: 3,
      usosMax: Infinity,
      descricao: 'Compre 2 cartas.'
    }
  },
  {
    id: 'fisica',
    nome: 'Física',
    pessoa: 'Maria Eduarda',
    raridade: RARIDADE.RARO,
    equipe: EQUIPE.EXATAS,
    atq: 13,
    def: 15,
    vidaMax: VIDA_CARTA,
    manaMax: 2,
    imagem: 'assets/cartas/maria.jpg',
    habilidade: {
      id: 'queda_livre',
      nome: 'Queda Livre',
      custoMana: 2,
      usosMax: Infinity,
      descricao: 'Seu próximo ataque ignora 50% da defesa do inimigo e dá boost de porcentagem no Ataque.'
    }
  },
  {
    id: 'pa',
    nome: 'P.A.',
    pessoa: 'Gilberto',
    raridade: RARIDADE.RARO,
    equipe: EQUIPE.TECNICO,
    atq: 15,
    def: 10,
    vidaMax: VIDA_CARTA,
    manaMax: 2,
    imagem: 'assets/cartas/gilberto.jpg',
    habilidade: {
      id: 'aplicativo_pt',
      nome: 'Aplicativo Vermelho',
      custoMana: 2,
      usosMax: Infinity,
      descricao: 'Compre 1 carta boa e dê sua pior carta para o oponente.'
    }
  },
  {
    id: 'historia',
    nome: 'História',
    pessoa: 'Brunão',
    raridade: RARIDADE.LENDARIO,
    equipe: EQUIPE.HUMANAS,
    atq: 20,
    def: 10,
    vidaMax: VIDA_CARTA,
    manaMax: 4,
    imagem: 'assets/cartas/bruno.jpg',
    habilidade: {
      id: 'birosca',
      nome: 'Birosca',
      custoMana: 'todas',
      usosMax: 1,
      descricao: 'Usa toda mana e utilizável só uma vez, ganha +10 de ATQ nesse turno.'
    }
  },
  {
    id: 'quimica',
    nome: 'Química',
    pessoa: 'Tiago',
    raridade: RARIDADE.LENDARIO,
    equipe: EQUIPE.EXATAS,
    atq: 20,
    def: 15,
    vidaMax: VIDA_CARTA,
    manaMax: 2,
    imagem: 'assets/cartas/tiago.jpg',
    habilidade: {
      id: 'se_relar_dedo',
      nome: 'Se Relar Um Dedo em Mim',
      custoMana: 'todas',
      usosMax: 1,
      descricao: 'Receba +10 de ATQ e +10 de DEF nesse turno. Usa toda mana e utilizável uma vez.'
    }
  },
  {
    id: 'pw',
    nome: 'P.W.',
    pessoa: 'Tia Gui',
    raridade: RARIDADE.LENDARIO,
    equipe: EQUIPE.TECNICO,
    atq: 20,
    def: 10,
    vidaMax: VIDA_CARTA,
    manaMax: 4,
    imagem: 'assets/cartas/tia.jpg',
    habilidade: {
      id: 'pao_mortadela',
      nome: 'Pão com Mortadela',
      custoMana: 2,
      usosMax: Infinity,
      descricao: 'Come um pãozão e recupera 20 de vida e dá 5 de bônus de defesa por 2 turnos.'
    }
  },
  {
    id: 'se',
    nome: 'S.E',
    pessoa: 'Reginaldo',
    raridade: RARIDADE.LENDARIO,
    equipe: EQUIPE.TECNICO,
    atq: 15,
    def: 15,
    vidaMax: VIDA_CARTA,
    manaMax: 5,
    imagem: 'assets/cartas/reginaldo.jpg',
    habilidade: {
      id: 'tinkercad',
      nome: 'Tinkercad',
      custoMana: 4,
      usosMax: Infinity,
      descricao: 'Cria uma bomba de arduino que dá dano no inimigo e paralisa ele pelo próximo turno, soma com o seu dano.'
    }
  },
  {
    id: 'bd',
    nome: 'B.D.',
    pessoa: 'Samproni',
    raridade: RARIDADE.MITICO,
    equipe: EQUIPE.TECNICO,
    atq: 18,
    def: 20,
    vidaMax: VIDA_CARTA,
    manaMax: 4,
    imagem: 'assets/cartas/Samproni2.jpg',
    habilidade: {
      id: 'banco_de_dados',
      nome: 'Agora é Banco de Dados!',
      custoMana: 4,
      usosMax: Infinity,
      descricao: 'Recupere 25% da vida de todas as suas cartas.'
    }
  },
  {
    id: 'ptic',
    nome: 'PTIC',
    pessoa: 'Samproni',
    raridade: RARIDADE.MITICO,
    equipe: EQUIPE.TECNICO,
    atq: 15,
    def: 20,
    vidaMax: VIDA_CARTA,
    manaMax: 5,
    imagem: 'assets/cartas/Samproni.jpg',
    habilidade: {
      id: 'e_joguinho',
      nome: 'É joguinho?',
      custoMana: 5,
      usosMax: 1,
      descricao: 'Destrua uma carta inimiga com menos de 50% da vida. Apenas uma carta, utilizável uma vez.'
    }
  },
  {
    id: 'biologia',
    nome: 'Biologia',
    pessoa: 'Ronaldo',
    raridade: RARIDADE.MITICO,
    equipe: EQUIPE.NENHUMA,
    atq: 18,
    def: 25,
    vidaMax: VIDA_CARTA,
    manaMax: 4,
    imagem: 'assets/cartas/Ronaldo.jpg',
    habilidades: [
      {
        id: 'coordenador_em',
        nome: 'Coordenador do Ensino Médio',
        custoMana: 4,
        usosMax: 2,
        descricao: 'Cancela a habilidade do inimigo por 2 turnos. Utilizável apenas 2 vezes.'
      }
    ]
  }
];

const MOLDURAS = {
  [RARIDADE.INICIAL]: { cor: '#2f9e1f', nome: 'Inicial' },
  // Mesma cor de moldura da Inicial — Comum tem a mesma regra de jogo,
  // só muda o texto do selo no canto da carta.
  [RARIDADE.COMUM]: { cor: '#2f9e1f', nome: 'Comum' },
  [RARIDADE.RARO]: { cor: '#0096fa', nome: 'Raro' },
  [RARIDADE.LENDARIO]: { cor: '#ffd300', nome: 'Lendário' },
  [RARIDADE.MITICO]: { cor: '#7a0d24', nome: 'Mítico' }
};

const VIDA_INICIAL = 100;
// LIMITE_BARALHO: quantas cartas podem ser escolhidas na montagem do baralho (repetição permitida).
// LIMITE_CAMPO: quantas cartas, no máximo, podem estar em campo ao mesmo tempo durante a partida.
// São limites diferentes de propósito: o baralho pode ter mais cartas-reserva na mão,
// mas o campo de batalha continua restrito a 4 para manter o balanceamento.
const LIMITE_BARALHO = 6;
const LIMITE_CAMPO = 4;
const LIMITE_CARTAS_INICIAIS_GRATIS = 5;

function buscarCartaPorId(id) {
  return CARTAS.find(c => c.id === id);
}
