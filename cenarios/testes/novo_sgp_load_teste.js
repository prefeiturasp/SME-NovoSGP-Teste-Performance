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
  return { "../../report/load_teste.html": htmlReport(data) };
}

// Load Test
export const options = {
  vus: 1,
  duration: '1s',
};

const BASE_URL = 'https://hom-novosgp.sme.prefeitura.sp.gov.br/api/v1';
const USER = 'marlon.amcom';
const PASS = 'Sgp@1234';

export default function () { flow(); }

function flow() {
  let loginRes = http.post(`${BASE_URL}/autenticacao`, JSON.stringify({ login: USER, senha: PASS }), {
    headers: { 'Content-Type': 'application/json' }
  });
  track(loginRes, "Login");
  const token = loginRes.json('token');
  if (!token) return;
  const authHeaders = { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' } };
  sleep(1);

  // Turmas
  let turmasRes = http.get(`${BASE_URL}/abrangencias/turmas/vigentes`, authHeaders);
  track(turmasRes, "Turmas vigentes"); sleep(1);

  // Pendências
  let pendenciasRes = http.get(`${BASE_URL}/pendencias/listar?turmaCodigo=&tipoPendencia=0&tituloPendencia=&numeroPagina=1&numeroRegistros=10`, authHeaders);
  track(pendenciasRes, "Pendências"); sleep(1);

  // Relatório de Faltas
  let relatorioRes = http.post(`${BASE_URL}/relatorios/faltas-frequencia-mensal`, JSON.stringify({
    exibirHistorico: false, anoLetivo: "2025", codigoDre: "108100", codigoUe: "-99", modalidade: "5", codigosTurmas: ["-99"], mesesReferencias: ["4"], tipoFormatoRelatorio: "1",
  }), authHeaders);
  track(relatorioRes, "Relatório de Faltas"); sleep(1);

  // Diário de Bordo
  let diarioRes = http.post(`${BASE_URL}/diarios-bordo`, JSON.stringify({
    aulaId: "251810099", planejamento: "Teste automatizado k6", reflexoesReplanejamento: "", componenteCurricularId: "512"
  }), authHeaders);
  track(diarioRes, "Diário de Bordo"); sleep(1);

  // Conselho
  let conselhoRes = http.post(`${BASE_URL}/conselhos-classe/recomendacoes`, JSON.stringify({
    conselhoClasseId: "12345", alunoCodigo: "987654", recomendacao: "Aluno demonstra boa participação, mas precisa reforçar leitura."
  }), authHeaders);
  track(conselhoRes, "Conselho de Classe"); sleep(1);

  // Calendário
  let calendarioRes = http.get(`${BASE_URL}/calendarios/frequencias?anoLetivo=2025&mes=9`, authHeaders);
  track(calendarioRes, "Calendário - Frequências"); sleep(1);

  // Fechamento
  let fechamentoRes = http.post(`${BASE_URL}/fechamentos/turmas`, JSON.stringify([{
    id: 561, turmaId: "2853538", bimestre: 3, disciplinaId: "1105", notaConceitoAlunos: [{ codigoAluno: "6539974", disciplinaId: 138, nota: 10, conceitoId: null }], justificativa: null
  }]), authHeaders);
  track(fechamentoRes, "Fechamento de Turmas"); sleep(1);

  // Relatório - Filtros Componentes Curriculares
  let filtrosRes = http.get(`${BASE_URL}/relatorios/filtros/componentes-curriculares/anos-letivos/2025/ues/-99/modalidades/5/?anos=-99&anos=1&anos=2&anos=3&anos=4&anos=5&anos=6&anos=7&anos=8&anos=9`, authHeaders);
  track(filtrosRes, "Relatório - Filtros Componentes Curriculares"); sleep(1);

  // Relatório - Pareceres Conclusivos
  let parecerRes = http.post(`${BASE_URL}/relatorios/pareceres-conclusivos`, JSON.stringify({
    anoLetivo: 2025, dreCodigo: "108100", ueCodigo: "", modalidade: "5", semestre: null, ciclo: 0, anos: [], parecerConclusivoId: 0, tipoFormatoRelatorio: "1", historico: false
  }), authHeaders);
  track(parecerRes, "Relatório - Pareceres Conclusivos"); sleep(1);

  // Abrangências - DREs
  let dresRes = http.get(`${BASE_URL}/abrangencias/false/dres`, authHeaders);
  track(dresRes, "Abrangências - DREs"); sleep(1);
}

function track(res, name) {
  Duration.add(res.timings.duration);
  Reqs.add(1);
  FailRate.add(res.status == 0 || res.status > 399);
  SuccessRate.add(res.status > 0 && res.status < 399);
  check(res, { [`${name}`]: (r) => r.status === 200 }) || Errors.add(1);
}