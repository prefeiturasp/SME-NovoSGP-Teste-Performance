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

export function handleSummary(data) {
    return { "report/teste_completo.html": htmlReport(data) };
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
    // Setar a quantidade de usuários para o teste
    stages: [
        { duration: '10s', target: 1 },
        // { duration: '1m', target: 200 }, 
        // { duration: '2m', target: 500 }, 
        // { duration: '2m', target: 100 }, 
        // { duration: '1m', target: 0 }, 
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
        console.error(`Falha no login para ${usuarioPorVu.login}. Status: ${loginResponse.status}, Resposta: ${loginResponse.body}`);
        GetCustomerErrors.add(1);
        return;
    }

    const authToken = loginResponse.json('token');
    if (!authToken) {
        console.error(`Token não encontrado para o usuário: ${usuarioPorVu.login}.`);
        GetCustomerErrors.add(1);
        return;
    }

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

    const apiUrlIniciarProva = `https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas-tai/${PROVA_ID}/iniciar-prova`;
    const iniciarProvaPayload = JSON.stringify({
        status: 1,
        tipoDispositivo: 3,
        dataInicio: 638736026571710000,
        dataFim: null,
    });

    const apiHeadersIniciarProva = {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
    };

    const apiResponseIniciarProva = http.post(apiUrlIniciarProva, iniciarProvaPayload, { headers: apiHeadersIniciarProva });

    GetCustomerDuration.add(apiResponseIniciarProva.timings.duration);
    GetCustomerReqs.add(1);

    const isFailure = apiResponseIniciarProva.status === 0 || (apiResponseIniciarProva.status > 399 && apiResponseIniciarProva.status !== 411);
    const isSuccess = apiResponseIniciarProva.status === 200 || apiResponseIniciarProva.status === 411;

    GetCustomerFailRate.add(isFailure);
    GetCustomerSuccessRate.add(isSuccess);

    check(apiResponseIniciarProva, {
        'Verifica se o status é 200 ou 411 no endpoint api/v1/provas-tai/${PROVA_ID}/iniciar-prova': (res) => res.status === 200 || res.status === 411,
    });

    const apiUrlR = 'https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas-tai/existe-conexao-R';
    const apiHeadersR = {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
    };

    const apiResponseR = http.get(apiUrlR, { headers: apiHeadersR });

    GetCustomerDuration.add(apiResponseR.timings.duration);
    GetCustomerReqs.add(1);
    GetCustomerFailRate.add(apiResponseR.status == 0 || apiResponseR.status > 399);
    GetCustomerSuccessRate.add(apiResponseR.status < 399);

    check(apiResponseR, {
        'Requisição para o endpoint api/v1/provas-tai/existe-conexao-R': (res) => res.status === 200,
    });

    sleep(5)

    const apiUrlProxima = `https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas-tai/${PROVA_ID}/proximo`;
    const payload = JSON.stringify({
        alternativaId: 95901222,
        alunoRa: usuarioPorVu.login,
        dataHoraRespostaTicks: 638736073354520000,
        dispositivoId: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        questaoId: 24005684,
        resposta: null,
        tempoRespostaAluno: 4680,
        
    });

    const payloadSize = payload.length;

    const apiHeadersProxima = {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Content-Length': payloadSize.toString(),
    };

    const apiResponseProxima = http.post(apiUrlProxima, payload, { headers: apiHeadersProxima });

    GetCustomerDuration.add(apiResponseProxima.timings.duration);
    GetCustomerReqs.add(1);

    const isFailureProxima = apiResponseProxima.status === 0 || (apiResponseProxima.status > 399 && apiResponseProxima.status !== 411);
    const isSuccessProxima = apiResponseProxima.status === 200 || apiResponseProxima.status === 411;

    GetCustomerFailRate.add(isFailureProxima);
    GetCustomerSuccessRate.add(isSuccessProxima);

    check(apiResponseProxima, {
        'Verifica se o status é 200 endpoint api/v1/provas-tai/${PROVA_ID}/proximo': (res) => res.status === 200 || res.status === 411,
    });

    sleep(5)

    const apiUrlObterQuestao = `https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas-tai/${PROVA_ID}/obter-questao`;
    const payloadObterQuestao = JSON.stringify({
        audios: [],
        descricao: '<p>Se a medida da diagonal fosse em centímetros, o dado que apareceria na tela da TV seria </p>',
        id: 24005691,
        ordem: 1,
        quantidadeAlternativas: 4,
        questaoLegadoId: 20259,
        tipo: 1,
        titulo: '<p>Jéssica escolheu para comprar o modelo de TV mostrado na imagem a seguir. Ela perguntou ao vendedor da loja qual era o significado do número indicado na tela da TV. O vendedor da loja explicou que era o tamanho da diagonal da tela retangular, medida em polegadas, e que cada polegada media, aproximadamente, 2,5 cm.</p><p style="text-align: center;"><img src="#4985659#" id="4985659"></p>',
        videos: [],
    });

    const apiHeadersObterQuestao = {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
    };

    const apiResponseObterQuestao = http.post(apiUrlObterQuestao, payloadObterQuestao, { headers: apiHeadersObterQuestao });

    GetCustomerDuration.add(apiResponseObterQuestao.timings.duration);
    GetCustomerReqs.add(1);
    GetCustomerFailRate.add(apiResponseObterQuestao.status == 0 || apiResponseObterQuestao.status > 399 && apiResponseObterQuestao.status !== 411);
    GetCustomerSuccessRate.add(apiResponseObterQuestao.status < 399);

    check(apiResponseObterQuestao, {
        'Requisição autenticada obter questoes endpoint api/v1/provas-tai/${PROVA_ID}/obter-questao': (res) => res.status === 200 || res.status === 411,
    });

    console.log('Obteve a próxima questão');
}