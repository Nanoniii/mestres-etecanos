// =====================================================
// MESTRES ETECANOS - Acesso por Passkey
// =====================================================
// Jogo particular: só abre com uma das 50 passkeys distribuídas.
// As chaves nunca aparecem em texto puro aqui — guardamos apenas o
// hash SHA-256 de cada uma e comparamos o hash do que a pessoa digita.
// (Lembrete honesto: isso roda no navegador da pessoa, então é uma
// trava "de cadeado de armário", não um cofre de banco — mas cumpre
// o pedido de não deixar as chaves legíveis no código-fonte.)

const CHAVE_STORAGE = 'me_acesso_liberado_v1';

const HASHES_VALIDOS = [
  "a88639a4d504a55f45d09f1350ba3170faecada2358f4fa0db3fc50126291030",
  "a4271df3026792619377582d17e35479fd2491b1b9d7f680573b485e88e57aea",
  "fdaf97695f29777102e9e2983425263042105d1ec2d89f8400ac7a65688e257a",
  "47ceeab5b40735a43d7b80d716d1ad9570ef721c84e6d636e7a1aba3ab2fcaaf",
  "50f91fc3d4d7bc6a8c73c7dc07bee2afcd3a4536e7a19936d1a66808f869ea43",
  "e177867bcbb1333996088598e6696678d2ad1fc2eb2d27261121d99f9258e50c",
  "fca422404ee41fc69f3bcf32731b4c692b10ecbc7b748b98d08ffcc6b366fefe",
  "f4819c6f30b149d3bd734bbc359111b658eb5e6142a143d488d172de81dae6dd",
  "24e4e55eaba6b15401297947e490c85b588e9467942c70c8c71ee3055f56a4f8",
  "45622c40c04c85b699480fa150e82e32c5088f9196f46a68c46d4c0b3bbba9a9",
  "1dd16f98fa6d13c4060598e1947d99f4a3dd5687ff12df45162d472326662bcb",
  "8358cff6a1a3f04943193d3ea5dde1c7b00a45d9d7198b58c6936f860af07373",
  "5382c6172ad95a8ee506e77ba529d4c3b60d51d57067214bc72b4eba3fe32b65",
  "6b5e80364a44943b00dd6a2ac509e1a6b5e2cfe09daecbe14280c8a561388d25",
  "e2c6bfed727532d7ee32b482d5627ef8bde3c82a1e97e3e48daa1b076d787b90",
  "84322e787fa3136138291ec41a0b0eec43a4b2026f73d8cd88cba43b78f1febf",
  "11815b36392adf7610bbd5a2e185325803f19d368ae8753c4ec031afc5eabe22",
  "2118c51a4915f319d6883c7621aaf4883b43a0a435ce0564b996e06981e25a9e",
  "06fff1b7d9c09607aa92bffa114797485a675b34c94404cf7d8300ccffd52181",
  "7069f6dda9daa7bc664f7162c665f3f8eaf4ea535dfb1f1836819afcd31b8e27",
  "392af772ee6c6e48aa26b98875ec0bdc08ed19956dd1b6f0352d37d25dec5e01",
  "efb30c84991e63bff647e03f9d468936794a25cbea9a80be943f7aaa329e3c52",
  "b4909929037b9bd50510d7fc0ff52c703491feca6b2199b91f827f2af5a3538f",
  "0fa58ce2c629b0abd0e8dced785f25ff2e4055706462e233a8143f82a48d4e8d",
  "f893aad94bd9dc260655cb79c97ff5ad5a3c046baedf59543a52aab73bdd9f21",
  "bae5e36a8f2fd45a4f8239bd1eb6f8185df91c79c15362f4afe540b35e48feb1",
  "7d75c88c9065f9ed06af1b4379587a937bab85ef0fa518228dc8a9a297bc703b",
  "7af6904ce463a7cb5b38d2c8a4cb2aebd357c34ac5bf26d0cc26066cf6b8d3da",
  "123983e463cd7651f7fa2d1c073c568e676dc65667857dc283e87882db31ee21",
  "e1005e13fad7404b51fc5e72618005eb7077d022918f01acb36c9ebe1a904d56",
  "677e87a685072f97194f2ed2676c9dbc94a3dc9a58cd31a18d4d0edc5f787225",
  "d16e5b06e2f207ffb023acd08e41c29d104254f6edcd3c8cc4105eda9813b3ee",
  "eaf5ac48cb05aee6f92c843ca3ee8e3f7e4d4db84c3aa852745df57007b5442c",
  "8946a92a19e9fbf0e427a524aec681a19f41458a0fe9a147ad19a009c811cb91",
  "3308ee0663f3a2f686ce809fb31753eab208ff775da1d3697a8270cf91ad95cc",
  "88d277b703bb48015e8cfab20c238a3af560886ac179934d2a5e7fc2e00cd390",
  "4948da66180f3a5828668b88f295ff0ede15b164b60ab165d2161e83a2c81f8e",
  "0dd09d0c85f958c4fbe66428ec726340dc7393347d277cbc88330982c7d23622",
  "98894648c6031ac0d80c64486b0800fde6da58a1af56efd026c3074476681cfc",
  "e47d629d6f07f810c8480d8b7fbc7d2df97906ea9101088a7cb9bef9b43fe75c",
  "b9bdcefad6bd3616e819b6083fb7aacfe3a39f35b8147affa545571f12208ec7",
  "60d7a244d418e74a43d5bd8428d449d0dc71297777859f7c6cc55743def083e2",
  "133e81e63999f434f912666604cbd8d4b4e288acbe38ef3d466b19b7364d58a1",
  "4ecdf2fee8d099c811e8c944c9a4445dea7791bae38199120a50b9fa3b66abfd",
  "8a065ac289c284b2fcf0f0dc7c4187984298b6c44bbf8d619391af94b39c0d87",
  "e23f4544bf87840789066e576321d829742f16179dc3a3b01a461e5e581094f7",
  "8925d8022ccf0c211ae3e7cd7ed1ec44629d040231a7fd67e32966883681d04c",
  "3ee242a4c67f4dbe8ec7044b2244beacbbb5210135a049998ad0892bb82bac8c",
  "cb60eefb83e23d14e1ccd73c955cb894dcd361b7c1c311bbff187ebb30289737",
  "facdf68268138282b6eea30119ca087962fb8bf846aa28433c15e685e342b7c0"
];

async function sha256(texto) {
  const enc = new TextEncoder().encode(texto);
  const buffer = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizarChave(valor) {
  return valor.trim().toUpperCase();
}

async function validarPasskey(valorDigitado) {
  const chave = normalizarChave(valorDigitado);
  if (!chave) return false;
  const hash = await sha256(chave);
  return HASHES_VALIDOS.includes(hash);
}

function acessoJaLiberado() {
  return localStorage.getItem(CHAVE_STORAGE) === '1';
}

function liberarAcesso() {
  localStorage.setItem(CHAVE_STORAGE, '1');
}

function formatarEnquantoDigita(input) {
  // Auto-formata para XXXX-XXXX-XXXX-XXXX enquanto a pessoa digita
  let v = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  v = v.slice(0, 16);
  const blocos = v.match(/.{1,4}/g) || [];
  input.value = blocos.join('-');
}

document.addEventListener('DOMContentLoaded', () => {
  const tela = document.getElementById('tela-passkey');
  const telaJogo = document.getElementById('app');
  const inputChave = document.getElementById('input-passkey');
  const btnEntrar = document.getElementById('btn-validar-passkey');
  const erroMsg = document.getElementById('erro-passkey');

  if (!tela) return; // página não tem gate de acesso

  if (acessoJaLiberado()) {
    tela.style.display = 'none';
    telaJogo.style.display = 'block';
    if (window.iniciarJogoApp) window.iniciarJogoApp();
    return;
  }

  inputChave.addEventListener('input', () => formatarEnquantoDigita(inputChave));
  inputChave.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnEntrar.click();
  });

  btnEntrar.addEventListener('click', async () => {
    erroMsg.textContent = '';
    btnEntrar.disabled = true;
    btnEntrar.textContent = 'Verificando...';
    const ok = await validarPasskey(inputChave.value);
    btnEntrar.disabled = false;
    btnEntrar.textContent = 'Entrar';

    if (ok) {
      liberarAcesso();
      tela.style.display = 'none';
      telaJogo.style.display = 'block';
      if (window.iniciarJogoApp) window.iniciarJogoApp();
    } else {
      erroMsg.textContent = 'Passkey inválida. Confira os caracteres e tente de novo.';
      tela.classList.remove('tremer');
      requestAnimationFrame(() => tela.classList.add('tremer'));
    }
  });
});
