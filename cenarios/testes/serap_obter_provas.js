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

export function handleSummary(data) {
    return {
        "report/obter_provas_test.html": htmlReport(data),
    };
}

export const options = {
    stages: [
        { duration: '1s', target: 1 }, // Sobe para 10 VUs
        { duration: '2m', target: 10 }, // Mantém 10 VUs
        { duration: '1m', target: 15 }, // Aumenta para 15 VUs
        { duration: '2m', target: 15 }, // Mantém 15 VUs
        { duration: '1m', target: 0 },  // Reduz para 0 VUs
    ],
};

export default function () {
    const apiUrl = 'https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas';
    const authToken = login(); 
    const apiHeaders = {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
    };

    const apiResponse = http.get(apiUrl, { headers: apiHeaders });

    GetCustomerDuration.add(apiResponse.timings.duration);
    GetCustomerReqs.add(1);
    GetCustomerFailRate.add(apiResponse.status == 0 || apiResponse.status > 399);
    GetCustomerSuccessRate.add(apiResponse.status < 399);

    check(apiResponse, {
        'Requisição autenticada obter prova endpoint api/v1/provas': (res) => res.status === 200,
    });

    sleep(2);
}
