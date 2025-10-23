import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { SharedArray } from 'k6/data';

export let GetCustomerDuration = new Trend('get_customer_duration');
export let GetCustomerFailRate = new Rate('get_customer_fail_rate');
export let GetCustomerSuccessRate = new Rate('get_customer_success_rate');
export let GetCustomerReqs = new Rate('get_customer_reqs');

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
    scenarios: {
        default: {
            executor: 'per-vu-iterations',
            vus: 7,
            iterations: totalUsuarios,
        },
    },
};

export default function login() {
    const usuarioIndex = (__VU - 1) % totalUsuarios;

    const usuarioPorVu = usuarios[usuarioIndex];

    if (!usuarioPorVu) {
        console.error(`Usuário não encontrado no índice: ${usuarioIndex}`);
        return;
    }

    console.log(`Usuário selecionado [VU: ${__VU}, Iteração: ${__ITER}, Índice: ${usuarioIndex}]: ${usuarioPorVu.login}`);

    const loginUrl = 'https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/autenticacao';
    const loginPayload = JSON.stringify({
        dispositivo: '',
        login: usuarioPorVu.login,
        senha: usuarioPorVu.senha,
    });

    const loginHeaders = {
        'Content-Type': 'application/json',
    };

    const loginResponse = http.post(loginUrl, loginPayload, { headers: loginHeaders });

    GetCustomerDuration.add(loginResponse.timings.duration);
    GetCustomerReqs.add(1);
    GetCustomerFailRate.add(loginResponse.status == 0 || loginResponse.status > 399);
    GetCustomerSuccessRate.add(loginResponse.status < 399);

    check(loginResponse, {
        'Login foi bem-sucedido endpoint api/v1/autenticacao': (res) => res.status === 200,
    });

    const authToken = loginResponse.json('token');
    if (!authToken) {
        console.error(`Token não encontrado para o usuário: ${usuarioPorVu.login}`);
        return;
    }

    sleep(3);

    return authToken;
}

export { login };