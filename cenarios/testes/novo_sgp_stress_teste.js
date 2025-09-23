import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";

export let Duration = new Trend('duration_total');
export let FailRate = new Rate('fail_rate');
export let SuccessRate = new Rate('success_rate');
export let Reqs = new Counter('reqs_total');
export let Errors = new Counter('errors_total');

export function handleSummary(data) {
  return { "../../report/stress_teste.html": htmlReport(data) };
}

export const options = {
  stages: [
    { duration: '1s', target: 1 },
    { duration: '1s', target: 1 },
    { duration: '1s', target: 1 },
  ],
};

const BASE_URL = 'https://hom-novosgp.sme.prefeitura.sp.gov.br/api/v1';
const USER = 'marlon.amcom';
const PASS = 'Sgp@1234';

export default function () {
  flow();
}

// Login

function flow() {
  let loginRes = http.post(`${BASE_URL}/autenticacao`, JSON.stringify({ login: USER, senha: PASS }), { headers: { 'Content-Type': 'application/json' } });
  track(loginRes, "Login");
  const token = loginRes.json('token');
  if (!token) return;

  const authHeaders = { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };

  sleep(1);

  // Turmas vigentes

  let turmasRes = http.get(`${BASE_URL}/abrangencias/turmas/vigentes`, authHeaders);
  track(turmasRes, "Turmas vigentes");

  sleep(1);

  // Pendências

  let pendenciasRes = http.get(`${BASE_URL}/pendencias/listar?turmaCodigo=&tipoPendencia=0&tituloPendencia=&numeroPagina=1&numeroRegistros=10`, authHeaders);
  track(pendenciasRes, "Pendências");

  sleep(1);

  // Relatório de faltas

  let relatorioRes = http.post(`${BASE_URL}/relatorios/faltas-frequencia-mensal`, JSON.stringify({
    exibirHistorico: false,
    anoLetivo: "2025",
    codigoDre: "108100",
    codigoUe: "-99",
    modalidade: "5",
    codigosTurmas: ["-99"],
    mesesReferencias: ["4"],
    tipoFormatoRelatorio: "1",
  }), authHeaders);
  track(relatorioRes, "Relatório de Faltas");

  sleep(1);
}

function track(res, name) {
  Duration.add(res.timings.duration);
  Reqs.add(1);
  FailRate.add(res.status == 0 || res.status > 399);
  SuccessRate.add(res.status > 0 && res.status < 399);
  check(res, { [`${name} - status 200`]: (r) => r.status === 200 }) || Errors.add(1);
}
