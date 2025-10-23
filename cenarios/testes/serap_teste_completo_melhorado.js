import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { SharedArray } from 'k6/data';

export let GetCustomerDuration = new Trend('get_customer_duration');
export let GetCustomerFailRate = new Rate('get_customer_fail_rate');
export let GetCustomerSuccessRate = new Rate('get_customer_success_rate');
export let GetCustomerReqs = new Counter('get_customer_reqs');
export let GetCustomerErrors = new Counter('get_customer_errors');

const PROVA_ID = __ENV.PROVA_ID; // Passar via CLI: k6 run -e PROVA_ID=123 script.js

export function handleSummary(data) {
  return { "report/teste_prova.html": htmlReport(data) };
}

const usuarios = new SharedArray('Usuarios', function () {
  const data = open('../../usuarios.txt').split('\n');
  return data.map((line) => {
    const [login, senha] = line.split(',');
    return { login: login.trim(), senha: senha.trim() };
  });
});

const totalUsuarios = usuarios.length;
if (totalUsuarios === 0) {
  throw new Error('Nenhum usuário foi carregado do arquivo!');
}

export const options = {
  stages: [
    { duration: '10s', target: 1 }, 
    // { duration: '2m', target: 50 },
    // { duration: '2m', target: 100 },
    // { duration: '1m', target: 0 },
  ],
};

export default function () {
  // --- LOGIN PÁGINA
  const loginPageUrl = 'https://hom-serap-estudante.sme.prefeitura.sp.gov.br/#/login';
  const loginPageResponse = http.get(loginPageUrl);

  check(loginPageResponse, { 'Página de login carregou': (res) => res.status === 200 });

  let usuarioIndex = (__VU - 1) % totalUsuarios;
  let usuarioPorVu = usuarios[usuarioIndex];

  console.log(`[VU: ${__VU}, Iteração: ${__ITER}] Usando usuário: ${usuarioPorVu.login}`);

  // --- LOGIN AUTENTICAÇÃO
  const loginUrl = 'https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/autenticacao';
  const loginPayload = JSON.stringify({
    dispositivo: '',
    login: usuarioPorVu.login,
    senha: usuarioPorVu.senha,
  });

  const loginHeaders = { 'Content-Type': 'application/json' };
  const loginResponse = http.post(loginUrl, loginPayload, { headers: loginHeaders });

  const loginSuccess = check(loginResponse, { 'Login foi bem-sucedido': (res) => res.status === 200 });

  if (!loginSuccess) {
    console.error(`Falha no login para ${usuarioPorVu.login}. Status: ${loginResponse.status}, Resposta: ${loginResponse.body}`);
    return;
  }

  const authToken = loginResponse.json('token');
  if (!authToken) {
    console.error(`Token não encontrado para o usuário: ${usuarioPorVu.login}.`);
    return;
  }

  // --- INICIAR PROVA
  const apiUrlIniciarProva = `https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas-tai/${PROVA_ID}/iniciar-prova`;
  const iniciarProvaPayload = JSON.stringify({
    status: 1,
    tipoDispositivo: 3,
    dataInicio: Date.now(),
    dataFim: null,
  });

  const apiResponseIniciarProva = http.post(apiUrlIniciarProva, iniciarProvaPayload, {
    headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
  });

  check(apiResponseIniciarProva, {
    'Iniciou a prova (200 ou 411)': (res) => res.status === 200 || res.status === 411,
  });

  sleep(2);

  // --- ENVIAR RESPOSTA DA QUESTÃO (24030126)
  const apiUrlResposta = `https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas-tai/${PROVA_ID}/proximo`;
  const payloadResposta = JSON.stringify({
    questaoId: 24030126,
    alternativaId: 96012868, // exemplo: seleciona a alternativa B) 338
    alunoRa: usuarioPorVu.login,
    dataHoraRespostaTicks: Date.now(),
    dispositivoId: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    resposta: null,
    tempoRespostaAluno: 3200,
  });

  const apiResponseResposta = http.post(apiUrlResposta, payloadResposta, {
    headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
  });

  check(apiResponseResposta, {
    'Resposta enviada com sucesso (200 ou 411)': (res) => res.status === 200 || res.status === 411,
  });

  sleep(2);

  // --- OBTER PRÓXIMA QUESTÃO
  const apiUrlObterQuestao = `https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas-tai/${PROVA_ID}/obter-questao`;
  const payloadObterQuestao = JSON.stringify({
    id: 24030126,
    questaoLegadoId: 19505,
    titulo: '<p>O gráfico mostra a quantidade de pães vendidos em cada dia da semana passada...</p>',
    descricao: '<p>O total de pães vendidos na terça-feira e na quinta-feira foi</p>',
    ordem: 2,
    tipo: 1,
    quantidadeAlternativas: 4,
    alternativas: [
      { id: 96012867, numeracao: "A)", descricao: "395" },
      { id: 96012868, numeracao: "B)", descricao: "338" },
      { id: 96012869, numeracao: "C)", descricao: "235" },
      { id: 96012870, numeracao: "D)", descricao: "230" },
    ],
  });

  const apiResponseObterQuestao = http.post(apiUrlObterQuestao, payloadObterQuestao, {
    headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
  });

  check(apiResponseObterQuestao, {
    'Obteve a questão (200 ou 411)': (res) => res.status === 200 || res.status === 411,
  });

  sleep(3);
}
