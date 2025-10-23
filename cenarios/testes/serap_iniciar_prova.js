import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { login } from './serap_autenticacao_login.js';

// Métricas customizadas com nomes únicos
export let GetCustomerDuration = new Trend('get_customer_duration_ms');
export let GetCustomerFailRate = new Rate('get_customer_fail_rate_flag');
export let GetCustomerSuccessRate = new Rate('get_customer_success_rate_flag');
export let GetCustomerReqsCounter = new Counter('get_customer_reqs_count');
export let GetCustomerErrorsCounter = new Counter('get_customer_errors_count');

const PROVA_ID = __ENV.PROVA_ID;
//const PROVA_ID = '599'; // ID fixo para teste

export function handleSummary(data) {
    return {
        "report/iniciar_prova_test.html": htmlReport(data),
    };
}

export const options = {
    stages: [
        { duration: '1s', target: 1 }, // sobe para 1 VU para validar
    ],
};

export default function () {
    const apiUrl = `https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas-tai/${PROVA_ID}/iniciar-prova`;
    const payload = JSON.stringify({
        status: 1,
        tipoDispositivo: 3,
        dataInicio: 638736026571710000,
        dataFim: null,
    });

    const authToken = login();
    if (!authToken) {
        console.error("❌ Token de autenticação não retornado.");
        GetCustomerErrorsCounter.add(1);
        return;
    }

    const apiHeaders = {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
    };

    const apiResponse = http.post(apiUrl, payload, { headers: apiHeaders });

    // Métricas
    GetCustomerDuration.add(apiResponse.timings.duration);
    GetCustomerReqsCounter.add(1);

    const isFailure = apiResponse.status === 0 || (apiResponse.status > 399 && apiResponse.status !== 411);
    const isSuccess = apiResponse.status === 200 || apiResponse.status === 411;

    GetCustomerFailRate.add(isFailure);
    GetCustomerSuccessRate.add(isSuccess);

    const checkResult = check(apiResponse, {
        '✅ Status é 200 ou 411 no endpoint /provas-tai/599/iniciar-prova': (res) =>
            res.status === 200 || res.status === 411,
    });

    if (!checkResult) {
        console.error(`❌ Falha na requisição iniciar-prova. Status: ${apiResponse.status}, Body: ${apiResponse.body}`);
        GetCustomerErrorsCounter.add(1);
    } else {
        if (apiResponse.status === 200) {
            console.log('✅ Prova iniciada com sucesso (200).');
        } else if (apiResponse.status === 411) {
            console.log('⚠️ Prova já havia sido iniciada (411).');
        }
    }

    sleep(2);
}