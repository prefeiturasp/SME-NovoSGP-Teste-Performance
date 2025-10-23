import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { SharedArray } from 'k6/data';
import { login } from './serap_autenticacao_login.js';

export let GetCustomerDuration = new Trend('get_customer_duration');
export let GetCustomerFailRate = new Rate('get_customer_fail_rate');
export let GetCustomerSuccessRate = new Rate('get_customer_success_rate');
export let GetCustomerReqs = new Rate('get_customer_reqs');

const PROVA_ID = __ENV.PROVA_ID;
//const PROVA_ID = '599'; // ID fixo para teste

export function handleSummary(data) {
    return {
        "summary.html": htmlReport(data),
    };
}

const usuarios = new SharedArray('Usuarios', function () {
    const data = open('../usuarios.txt').split('\n');
    return data.map((line) => {
        const [login, senha] = line.split(',');
        return { login: login.trim(), senha: senha.trim() };
    });
});

const totalUsuarios = usuarios.length;
if (totalUsuarios === 0) {
    console.error('Nenhum usuário foi carregado do arquivo!');
}

export const options = {
    stages: [
        { duration: '1s', target: 4 }, // Sobe para 4 VUs
    ],
};

let usuarioPorVu;

export default function () {
    const usuarioIndex = (__VU - 1) % totalUsuarios; 

    if (usuarioIndex < 0 || usuarioIndex >= totalUsuarios) {
        console.error(`Índice de usuário inválido: ${usuarioIndex}`);
        return;
    }

    usuarioPorVu = usuarios[usuarioIndex];

    if (!usuarioPorVu) {
        console.error(`Usuário não encontrado no índice: ${usuarioIndex}`);
        return;
    }

    const authToken = login();

    const apiUrl = `https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas-tai/${PROVA_ID}/proximo`;
    const payload = JSON.stringify({
        alternativaId: 95901222,
        alunoRa: usuarioPorVu.login,
        dataHoraRespostaTicks: 638736073354520000,
        dispositivoId: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        questaoId: 24005684,
        resposta: null, 
        tempoRespostaAluno: 4680
    });
   
    const payloadSize = payload.length;

    const apiHeaders = {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Content-Length': payloadSize.toString(),
    };

    const apiResponse = http.post(apiUrl, payload, { headers: apiHeaders });

    GetCustomerDuration.add(apiResponse.timings.duration);
    GetCustomerReqs.add(1);

    const isFailure = apiResponse.status === 0 || (apiResponse.status > 399 && apiResponse.status !== 411);
    const isSuccess = apiResponse.status === 200 || apiResponse.status === 411;

    GetCustomerFailRate.add(isFailure);   
    GetCustomerSuccessRate.add(isSuccess); 

    check(apiResponse, {
        'verifica se o Status é 200 endpoint api/v1/provas-tai/599/proximo': (res) => res.status === 200 || res.status === 411,
    });

    sleep(2);
}