import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { SharedArray } from 'k6/data';

// Métricas customizadas
export let GetCustomerDuration = new Trend('get_customer_duration');
export let GetCustomerFailRate = new Rate('get_customer_fail_rate');
export let GetCustomerSuccessRate = new Rate('get_customer_success_rate');
export let GetCustomerReqs = new Counter('get_customer_reqs');
export let GetCustomerErrors = new Counter('get_customer_errors');

const PROVA_ID = __ENV.PROVA_ID;
//const PROVA_ID = '599'; // ID fixo para teste

// Relatório HTML
export function handleSummary(data) {
  return { "report/load_test.html": htmlReport(data) };
}

// Carregar usuários
const usuarios = new SharedArray('Usuarios', function () {
  const data = open('../../usuarios.txt').split('\n').filter(Boolean);
  return data.map((line) => {
    const [login, senha] = line.split(',');
    return { login: login.trim(), senha: senha.trim() };
  });
});

const totalUsuarios = usuarios.length;
if (totalUsuarios === 0) {
  throw new Error('Nenhum usuário foi carregado do arquivo!');
}

// Configuração do teste
export const options = {
  vus: 1,
  duration: '1s',
};

// Dados da questão (ajustado conforme você enviou)
const questaoPayload = JSON.stringify({
  id: 24030126,
  questaoLegadoId: 19505,
  titulo: '<p>O gráfico mostra a quantidade de pães vendidos em cada dia da semana passada, em uma pequena padaria.</p><p style="text-align: center;"><img src="#5653368#" id="5653368"></p>',
  descricao: '<p>O total de pães vendidos na terça-feira e na quinta-feira foi</p>',
  ordem: 2,
  tipo: 1,
  quantidadeAlternativas: 4,
  arquivos: [
    {
      id: 9554680,
      legadoId: 5653368,
      questaoId: 24030126,
      caminho: "https://serap.sme.prefeitura.sp.gov.br/Files/Texto_Base/2022/9/f8d72451-f0d1-4e39-8840-659cc7af9a76.png",
      tamanhoBytes: 27109,
    },
  ],
  audios: [],
  videos: [],
  alternativas: [
    {
      questaoId: 24030126,
      id: 96012867,
      alternativaLegadoId: 79308,
      descricao: "<p>395.</p>",
      ordem: 0,
      numeracao: "A)",
    },
    {
      questaoId: 24030126,
      id: 96012868,
      alternativaLegadoId: 79309,
      descricao: "<p>338.</p>",
      ordem: 1,
      numeracao: "B)",
    },
    {
      questaoId: 24030126,
      id: 96012869,
      alternativaLegadoId: 79310,
      descricao: "<p>235.</p>",
      ordem: 2,
      numeracao: "C)",
    },
    {
      questaoId: 24030126,
      id: 96012870,
      alternativaLegadoId: 79311,
      descricao: "<p>230.</p>",
      ordem: 3,
      numeracao: "D)",
    },
  ],
});

export default function () {
  const usuarioIndex = (__VU - 1) % totalUsuarios;
  const usuario = usuarios[usuarioIndex];

  console.log(`[VU: ${__VU}, Iteração: ${__ITER}] Usuário: ${usuario.login}`);

  // 1. Login
  const loginPayload = JSON.stringify({
    dispositivo: '',
    login: usuario.login,
    senha: usuario.senha,
  });

  const loginRes = http.post(
    'https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/autenticacao',
    loginPayload,
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(loginRes, { 'Login 200': (r) => r.status === 200 });

  const token = loginRes.json('token');
  if (!token) {
    console.error(`Token não encontrado para o usuário: ${usuario.login}`);
    GetCustomerErrors.add(1);
    return;
  }

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // 2. Listar provas
  const provasRes = http.get(
    'https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas',
    { headers: authHeaders }
  );
  check(provasRes, { 'GET /provas 200': (r) => r.status === 200 });

  // 3. Iniciar prova
  const iniciarProvaRes = http.post(
    `https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas-tai/${PROVA_ID}/iniciar-prova`,
    JSON.stringify({ status: 1, tipoDispositivo: 3, dataInicio: Date.now(), dataFim: null }),
    { headers: authHeaders }
  );
  check(iniciarProvaRes, {
    'Iniciar prova 200|411': (r) => r.status === 200 || r.status === 411,
  });

  // 4. Verificar conexão R
  const conexaoRRes = http.get(
    'https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas-tai/existe-conexao-R',
    { headers: authHeaders }
  );
  check(conexaoRRes, { 'Conexão R 200': (r) => r.status === 200 });

  sleep(1);

  // 5. Próxima questão
  const proximoRes = http.post(
    `https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas-tai/${PROVA_ID}/proximo`,
    JSON.stringify({
      alternativaId: 95901222,
      alunoRa: usuario.login,
      dataHoraRespostaTicks: Date.now(),
      dispositivoId: "Mozilla/5.0",
      questaoId: 24027877,
      resposta: null,
      tempoRespostaAluno: 4680,
    }),
    { headers: authHeaders }
  );
  check(proximoRes, {
    'Próxima questão 200|411': (r) => r.status === 200 || r.status === 411,
  });

  sleep(1);

  // 6. Obter questão (com payload real fornecido)
  const obterQuestaoRes = http.post(
    `https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas-tai/${PROVA_ID}/obter-questao`,
    questaoPayload,
    { headers: authHeaders }
  );

  check(obterQuestaoRes, {
    'Obter questão 200|411': (r) => r.status === 200 || r.status === 411,
  });

  sleep(2);
}
