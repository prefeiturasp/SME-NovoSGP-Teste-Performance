import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";

// ----------------- MÉTRICAS -----------------
export let Duration = new Trend('duration_total');
export let FailRate = new Rate('fail_rate');
export let SuccessRate = new Rate('success_rate');
export let Reqs = new Counter('reqs_total');
export let Errors = new Counter('errors_total');

// ----------------- RELATÓRIO -----------------
export function handleSummary(data) {
  return { "../../report/load_teste.html": htmlReport(data) };
}

// ----------------- CONFIGURAÇÃO - RAMP TEST -----------------
export const options = {
  stages: [
    { duration: '30s', target: 1 },  // carga VUs
    { duration: '1s', target: 1 },   // sobe
    { duration: '1s', target: 1 },   // aumenta
  ],
};

// ----------------- VARIÁVEIS DE AMBIENTE -----------------
const BASE_URL = __ENV.BASE_URL || 'https://hom-novosgp.sme.prefeitura.sp.gov.br/api/v1';
const USER = __ENV.USER;
const PASS = __ENV.PASS;
const USER_ALT = __ENV.USER_ALT;
const PASS_ALT = __ENV.PASS_ALT;

// ----------------- EXECUÇÃO PRINCIPAL -----------------
export default function () {
  flow();
}

function flow() {
  // Login principal
  let loginRes = http.post(`${BASE_URL}/autenticacao`, JSON.stringify({ login: USER, senha: PASS }), {
    headers: { 'Content-Type': 'application/json' }
  });
  const token = loginRes.json('token');
  const authHeaders = { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' } };

  // Login alternativo
  let loginAltRes = http.post(`${BASE_URL}/autenticacao`, JSON.stringify({ login: USER_ALT, senha: PASS_ALT }), {
    headers: { 'Content-Type': 'application/json' }
  });
  const tokenAlt = loginAltRes.json('token');
  const authAltHeaders = { headers: { Authorization: `Bearer ${tokenAlt}`, 'Content-Type': 'application/json', 'Accept': 'application/json' } };

  sleep(1);

  // --------- Cenário funcional típico de carga ---------
  track(http.get(`${BASE_URL}/abrangencias/turmas/vigentes`, authHeaders), "Turmas vigentes"); sleep(1);

  track(http.get(`${BASE_URL}/pendencias/listar?turmaCodigo=&tipoPendencia=0&tituloPendencia=&numeroPagina=1&numeroRegistros=10`, authHeaders), "Pendências"); sleep(1);

  track(http.post(`${BASE_URL}/relatorios/faltas-frequencia-mensal`, JSON.stringify({
    exibirHistorico: false, anoLetivo: "2025", codigoDre: "108100", codigoUe: "-99", modalidade: "5",
    codigosTurmas: ["-99"], mesesReferencias: ["4"], tipoFormatoRelatorio: "1"
  }), authHeaders), "Relatório de Faltas"); sleep(1);

  track(http.post(`${BASE_URL}/diarios-bordo`, JSON.stringify({
    aulaId: "251810099",
    planejamento: textoPlanejamento(),
    reflexoesReplanejamento: "",
    componenteCurricularId: "512"
  }), authAltHeaders), "Diário de Bordo"); sleep(1);

  track(http.post(`${BASE_URL}/conselhos-classe/recomendacoes`, JSON.stringify({
    conselhoClasseId: 683687,
    fechamentoTurmaId: 960168,
    alunoCodigo: "6405752",
    anotacoesPedagogicas: "",
    recomendacaoAluno: "<p>x</p>",
    recomendacaoFamilia: "<p>x</p>",
    recomendacaoFamiliaIds: [],
    recomendacaoAlunoIds: [12]
  }), authHeaders), "Conselho de Classe"); sleep(1);

  track(http.post(`${BASE_URL}/calendarios/frequencias`, JSON.stringify({
    aulaId: 65,
    listaFrequencia: [
      {
        aulas: [{ tipoFrequencia: "F", numeroAula: 1, possuiCompensacao: false }],
        codigoAluno: "6539974",
        codigoSituacaoMatricula: 1,
        nomeAluno: "ANA CLARA SENA SILVA",
        numeroAlunoChamada: 4,
        situacaoMatricula: "Ativo"
      }
    ]
  }), authAltHeaders), "Calendário - Frequências"); sleep(1);

  track(http.post(`${BASE_URL}/fechamentos/turmas`, JSON.stringify([{
    id: 561, turmaId: "2853538", bimestre: 3, disciplinaId: "1105",
    notaConceitoAlunos: [{ codigoAluno: "6539974", disciplinaId: 138, nota: 10, conceitoId: null }],
    justificativa: null
  }]), authHeaders), "Fechamento de Turmas"); sleep(1);

  track(http.get(`${BASE_URL}/relatorios/filtros/componentes-curriculares/anos-letivos/2025/ues/-99/modalidades/5/?anos=-99&anos=1&anos=2&anos=3&anos=4&anos=5&anos=6&anos=7&anos=8&anos=9`, authHeaders), "Relatório - Filtros"); sleep(1);

  track(http.post(`${BASE_URL}/relatorios/pareceres-conclusivos`, JSON.stringify({
    anoLetivo: 2025, dreCodigo: "108100", ueCodigo: "", modalidade: "5", semestre: null, ciclo: 0,
    anos: [], parecerConclusivoId: 0, tipoFormatoRelatorio: "1", historico: false
  }), authHeaders), "Relatório - Pareceres Conclusivos"); sleep(1);

  track(http.get(`${BASE_URL}/abrangencias/false/dres`, authHeaders), "Abrangências - DREs"); sleep(1);
}

// ----------------- FUNÇÕES AUXILIARES -----------------
function textoPlanejamento() {
  return "<p>" + "Planejamento de aula automatizado. ".repeat(10) + "</p>";
}

function track(res, name) {
  if (res.status !== 200) {
    console.log(`⚠️ [${name}] falhou. Status: ${res.status}`);
    console.log(`Body: ${res.body}`);
  }
  Duration.add(res.timings.duration);
  Reqs.add(1);
  FailRate.add(res.status == 0 || res.status > 399);
  SuccessRate.add(res.status > 0 && res.status < 399);
  check(res, { [`${name} - status 200`]: (r) => r.status === 200 }) || Errors.add(1);
}