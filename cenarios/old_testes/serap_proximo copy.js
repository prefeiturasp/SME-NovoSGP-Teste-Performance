import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { SharedArray } from 'k6/data';
import { login } from '../serap_autenticacao_login.js';

export let GetCustomerDuration = new Trend('get_customer_duration');
export let GetCustomerFailRate = new Rate('get_customer_fail_rate');
export let GetCustomerSuccessRate = new Rate('get_customer_success_rate');
export let GetCustomerReqs = new Rate('get_customer_reqs');

export function handleSummary(data) {
    return {
        "summary.html": htmlReport(data),
    };
}

export const options = {
    stages: [
        { duration: '1s', target: 3 }, // Sobe para 2 VUs
    ],
};

export default function () {
    const apiUrl = 'https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas-tai/325/proximo';
    const payload = JSON.stringify({
        alternativaId:95901222,
        alunoRa:usuarioPorVu.login,
        dataHoraRespostaTicks:638736073354520000,
        dispositivoId:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        questaoId:24005684,
        resposta:null,
        tempoRespostaAluno:4680
    });
    const authToken = login();
    const apiHeaders = {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Content-Length': payload.length.toString(),
    };

    const apiResponse = http.post(apiUrl, payload, { headers: apiHeaders });

    GetCustomerDuration.add(apiResponse.timings.duration);
    GetCustomerReqs.add(1);

    const isFailure = apiResponse.status === 0 || (apiResponse.status > 399);
    const isSuccess = apiResponse.status === 200;

    GetCustomerFailRate.add(isFailure);   
    GetCustomerSuccessRate.add(isSuccess); 

    console.log(apiResponse)

    check(apiResponse, {
        'verifica se o Status é 200 endpoint api/v1/provas-tai/325/proximo': (res) => res.status === 200,
    });

    sleep(2);
}