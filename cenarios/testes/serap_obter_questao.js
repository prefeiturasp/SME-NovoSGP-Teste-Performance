import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { login } from './serap_autenticacao_login.js';

// Métricas customizadas
export let GetCustomerDuration = new Trend('get_customer_duration_ms');
export let GetCustomerFailRate = new Rate('get_customer_fail_rate_flag');
export let GetCustomerSuccessRate = new Rate('get_customer_success_rate_flag');
export let GetCustomerReqsCounter = new Counter('get_customer_reqs_count');

const PROVA_ID = __ENV.PROVA_ID;
//const PROVA_ID = '599'; // ID fixo para teste

export function handleSummary(data) {
    return {
        "report/obter_questao_test.html": htmlReport(data),
    };
}

export const options = {
    stages: [
        { duration: '1s', target: 1 }, // Sobe para 1 VU para teste
        { duration: '2m', target: 10 },
        { duration: '1m', target: 15 },
        { duration: '2m', target: 15 },
        { duration: '1m', target: 0 },
    ],
};

export default function () {
    const apiUrl = `https://hom-serap-estudante.sme.prefeitura.sp.gov.br/api/v1/provas-tai/${PROVA_ID}/obter-questao`;
    const authToken = login();

    if (!authToken) {
        console.error("❌ Token de autenticação não retornado.");
        return;
    }

    const payload = JSON.stringify({
        id: 24030126,
        questaoLegadoId: 19505,
        titulo: "<p>O gráfico mostra a quantidade de pães vendidos em cada dia da semana passada, em uma pequena padaria.</p><p><span class=\"TextRun SCXW247833381 BCX0\"></span> </p><p style=\"text-align: center;\"><img src=\"#5653368#\" id=\"5653368\"></p>",
        descricao: "<p><span class=\"TextRun SCXW242697337 BCX0\"><span class=\"NormalTextRun SCXW242697337 BCX0\">O total de pães vendidos na terça-feira e na quinta-feira foi</span></span> </p>",
        ordem: 2,
        tipo: 1,
        quantidadeAlternativas: 4,
        arquivos: [
            {
                id: 9554680,
                legadoId: 5653368,
                questaoId: 24030126,
                caminho: "https://serap.sme.prefeitura.sp.gov.br/Files/Texto_Base/2022/9/f8d72451-f0d1-4e39-8840-659cc7af9a76.png",
                tamanhoBytes: 27109
            }
        ],
        audios: [],
        videos: [],
        alternativas: [
            { questaoId: 24030126, id: 96012867, alternativaLegadoId: 79308, descricao: "<p>395.</p>", ordem: 0, numeracao: "A)" },
            { questaoId: 24030126, id: 96012868, alternativaLegadoId: 79309, descricao: "<p>338.</p>", ordem: 1, numeracao: "B)" },
            { questaoId: 24030126, id: 96012869, alternativaLegadoId: 79310, descricao: "<p>235.</p>", ordem: 2, numeracao: "C)" },
            { questaoId: 24030126, id: 96012870, alternativaLegadoId: 79311, descricao: "<p>230.</p>", ordem: 3, numeracao: "D)" }
        ]
    });

    const apiHeaders = {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
    };

    const apiResponse = http.post(apiUrl, payload, { headers: apiHeaders });

    // Métricas
    GetCustomerDuration.add(apiResponse.timings.duration);
    GetCustomerReqsCounter.add(1);
    GetCustomerFailRate.add(apiResponse.status === 0 || (apiResponse.status > 399 && apiResponse.status !== 411));
    GetCustomerSuccessRate.add(apiResponse.status === 200 || apiResponse.status === 411);

    console.log(apiResponse.body);

    check(apiResponse, {
        'Requisição autenticada obter questoes endpoint api/v1/provas-tai/599/obter-questao': (res) =>
            res.status === 200 || res.status === 411,
    });

    sleep(2);
}