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

const PROVA_ID = __ENV.PROVA_ID;
//const PROVA_ID = '599'; // ID fixo para teste

export function handleSummary(data) {
    return { "report/ramp_test.html": htmlReport(data) };
}

// Carrega usuários do arquivo externo
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

// Configuração de ramp-up
export const options = {
    stages: [
        { duration: '1s', target: 1 },   // sobe até 50 usuários
        { duration: '1s', target: 1 },  // aumenta para 100
        { duration: '1s', target: 1 },  // aumenta para 200
        { duration: '1s', target: 1 },  // aumenta para 300
        { duration: '1s', target: 1 },  // aumenta para 500
        { duration: '1s', target: 1 },    // encerra gradualmente
    ],
};

export default function () {
    const loginPageUrl = 'https://hom-serap-estudante.sme.prefeitura.sp.gov.br/#/login';
    const loginPageResponse = http.get(loginPageUrl);

    GetCustomerDuration.add(loginPageResponse.timings.duration);
    GetCustomerReqs.add(1);
    GetCustomerFailRate.add(loginPageResponse.status == 0 || loginPageResponse.status > 399);
    GetCustomerSuccessRate.add(loginPageResponse.status < 399);

    check(loginPageResponse, {
        'Página de login carregou': (res) => res.status === 200,
    });

    let usuarioIndex = (__VU - 1) % totalUsuarios;
    let usuarioPorVu = usuarios[usuarioIndex];

    console.log(`[VU: ${__VU}, Iteração: ${__ITER}] Usando usuário: ${usuarioPorVu.login}`);

    // 🔹 Login
    const loginUrl = 'https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/autenticacao';
    const loginPayload = JSON.stringify({
        dispositivo: '',
        login: usuarioPorVu.login,
        senha: usuarioPorVu.senha,
    });

    const loginHeaders = { 'Content-Type': 'application/json' };
    const loginResponse = http.post(loginUrl, loginPayload, { headers: loginHeaders });

    GetCustomerDuration.add(loginResponse.timings.duration);
    GetCustomerReqs.add(1);
    GetCustomerFailRate.add(loginResponse.status === 0 || loginResponse.status > 399);
    GetCustomerSuccessRate.add(loginResponse.status < 399);

    const loginSuccess = check(loginResponse, {
        'Login foi bem-sucedido': (res) => res.status === 200,
    });

    if (!loginSuccess) {
        console.error(`❌ Falha no login para ${usuarioPorVu.login}. Status: ${loginResponse.status}, Resposta: ${loginResponse.body}`);
        GetCustomerErrors.add(1);
        return;
    }

    const authToken = loginResponse.json('token');
    if (!authToken) {
        console.error(`❌ Token não encontrado para o usuário: ${usuarioPorVu.login}.`);
        GetCustomerErrors.add(1);
        return;
    }

    // 🔹 Buscar provas
    const apiUrl = 'https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas';
    const apiHeaders = {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
    };

    const apiResponse = http.get(apiUrl, { headers: apiHeaders });

    GetCustomerDuration.add(apiResponse.timings.duration);
    GetCustomerReqs.add(1);
    GetCustomerFailRate.add(apiResponse.status === 0 || apiResponse.status > 399);
    GetCustomerSuccessRate.add(apiResponse.status < 399);

    check(apiResponse, {
        'Requisição autenticada ao endpoint /api/v1/provas foi bem-sucedida': (res) => res.status === 200,
    });

    // 🔹 Iniciar prova
    const apiUrlIniciarProva = `https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas-tai/${PROVA_ID}/iniciar-prova`;
    const iniciarProvaPayload = JSON.stringify({
        status: 1,
        tipoDispositivo: 3,
        dataInicio: 638736026571710000,
        dataFim: null,
    });

    const apiResponseIniciarProva = http.post(apiUrlIniciarProva, iniciarProvaPayload, { headers: apiHeaders });

    GetCustomerDuration.add(apiResponseIniciarProva.timings.duration);
    GetCustomerReqs.add(1);
    const isFailure = apiResponseIniciarProva.status === 0 || (apiResponseIniciarProva.status > 399 && apiResponseIniciarProva.status !== 411);
    const isSuccess = apiResponseIniciarProva.status === 200 || apiResponseIniciarProva.status === 411;

    GetCustomerFailRate.add(isFailure);
    GetCustomerSuccessRate.add(isSuccess);

    check(apiResponseIniciarProva, {
        'Iniciar prova retornou 200 ou 411': (res) => res.status === 200 || res.status === 411,
    });

    // 🔹 Conexão R
    const apiUrlR = 'https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas-tai/existe-conexao-R';
    const apiResponseR = http.get(apiUrlR, { headers: apiHeaders });

    GetCustomerDuration.add(apiResponseR.timings.duration);
    GetCustomerReqs.add(1);
    GetCustomerFailRate.add(apiResponseR.status == 0 || apiResponseR.status > 399);
    GetCustomerSuccessRate.add(apiResponseR.status < 399);

    check(apiResponseR, {
        'Requisição para existe-conexao-R retornou 200': (res) => res.status === 200,
    });

    // 🔹 Proximo
    const apiUrlProxima = `https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas-tai/${PROVA_ID}/proximo`;
    const payload = JSON.stringify({
        alternativaId: 96012867,  // alternativa A da questão enviada
        alunoRa: usuarioPorVu.login,
        dataHoraRespostaTicks: 638736073354520000,
        dispositivoId: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        questaoId: 24030126,
        resposta: null,
        tempoRespostaAluno: 4680
    });

    const apiResponseProxima = http.post(apiUrlProxima, payload, { headers: apiHeaders });

    GetCustomerDuration.add(apiResponseProxima.timings.duration);
    GetCustomerReqs.add(1);
    const isFailureProxima = apiResponseProxima.status === 0 || (apiResponseProxima.status > 399 && apiResponseProxima.status !== 411);
    const isSuccessProxima = apiResponseProxima.status === 200 || apiResponseProxima.status === 411;

    GetCustomerFailRate.add(isFailureProxima);   
    GetCustomerSuccessRate.add(isSuccessProxima); 

    check(apiResponseProxima, {
        'Proximo retornou 200 ou 411': (res) => res.status === 200 || res.status === 411,
    });

    // 🔹 Obter questão
    const apiUrlObterQuestao = `https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas-tai/${PROVA_ID}/obter-questao`;
    const payloadObterQuestao = JSON.stringify({
        id: 24030126,
        questaoLegadoId: 19505,
        titulo: "<p>O gráfico mostra a quantidade de pães vendidos em cada dia da semana passada, em uma pequena padaria.</p><p style='text-align: center;'><img src='https://serap.sme.prefeitura.sp.gov.br/Files/Texto_Base/2022/9/f8d72451-f0d1-4e39-8840-659cc7af9a76.png'></p>",
        descricao: "<p>O total de pães vendidos na terça-feira e na quinta-feira foi</p>",
        ordem: 2,
        tipo: 1,
        quantidadeAlternativas: 4,
        audios: [],
        videos: [],
        alternativas: [
            { id: 96012867, descricao: "<p>395.</p>", numeracao: "A)" },
            { id: 96012868, descricao: "<p>338.</p>", numeracao: "B)" },
            { id: 96012869, descricao: "<p>235.</p>", numeracao: "C)" },
            { id: 96012870, descricao: "<p>230.</p>", numeracao: "D)" }
        ]
    });

    const apiResponseObterQuestao = http.post(apiUrlObterQuestao, payloadObterQuestao, { headers: apiHeaders });

    GetCustomerDuration.add(apiResponseObterQuestao.timings.duration);
    GetCustomerReqs.add(1);
    GetCustomerFailRate.add(apiResponseObterQuestao.status == 0 || apiResponseObterQuestao.status > 399 && apiResponseObterQuestao.status !== 411);
    GetCustomerSuccessRate.add(apiResponseObterQuestao.status < 399);

    check(apiResponseObterQuestao, {
        'Obter questão retornou 200 ou 411': (res) => res.status === 200 || res.status === 411,
    });

    sleep(3)
}