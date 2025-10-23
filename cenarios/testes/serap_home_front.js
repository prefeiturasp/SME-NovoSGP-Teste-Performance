import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";

export let GetCustomerDuration = new Trend('get_customer_duration');
export let GetCustomerFailRate = new Rate('get_customer_fail_rate');
export let GetCustomerSuccessRate = new Rate('get_customer_success_rate');
export let GetCustomerReqs = new Rate('get_customer_reqs');

export function handleSummary(data) {
    return {
        "report/home_front_test.html": htmlReport(data),
    };
}

// Configuração de carga
export const options = {
    stages: [
        { duration: '1s', target: 1  }, // Sobe para 10 VUs
        { duration: '2m', target: 10 }, // Mantém 10 VUs
        { duration: '1m', target: 15 }, // Aumenta para 15 VUs
        { duration: '2m', target: 15 }, // Mantém 15 VUs
        { duration: '1m', target: 0  },  // Reduz para 0 VUs
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

    sleep(1)
}
