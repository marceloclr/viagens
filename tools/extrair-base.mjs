/* =====================================================================================
   extrair-base.mjs — MIGRAÇÃO, EXECUTADA UMA ÚNICA VEZ

   Lê o HTML monolítico, avalia o bloco [4] fora do navegador e escreve a curadoria em
   dados/. Também produz src/index.html: o mesmo HTML com o literal da base substituído
   por marcadores, para que tools/build.mjs possa recompô-lo.

   Depois desta execução, a fonte da verdade passa a ser dados/. O HTML deixa de ser
   lugar de curadoria e volta a ser apenas o motor.

       node tools/extrair-base.mjs origem_fase3.html
   ===================================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const ORIGEM = process.argv[2] || 'origem_fase3.html';
const RAIZ = process.cwd();
const DADOS = path.join(RAIZ, 'dados');

/* ------------------------------------------------------------------ DOM MÍNIMO
   O bloco [4] é dado puro, mas vive num arquivo que, ao ser avaliado, também instala
   ouvintes e monta o formulário. Um DOM de fachada basta para atravessar isso. */
const elFake = () => ({
    innerHTML: '', textContent: '', value: '', disabled: false, style: { setProperty() {} },
    dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, remove() {}, setAttribute() {}, getAttribute: () => null,
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    scrollIntoView() {}, focus() {}, closest: () => null
});
globalThis.document = {
    body: elFake(), documentElement: elFake(),
    getElementById: () => elFake(), querySelector: () => elFake(), querySelectorAll: () => [],
    createElement: () => elFake(), addEventListener() {}
};
globalThis.window = { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), location: { search: '' } };
globalThis.location = { search: '' };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
globalThis.fetch = () => Promise.reject(new Error('sem rede na extração'));
globalThis.requestAnimationFrame = f => setTimeout(f, 0);

const html = fs.readFileSync(path.join(RAIZ, ORIGEM), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
vm.runInThisContext(script + '\n;globalThis.__X = { DB, CATALOGO, FONTE_REF };', { filename: 'origem.js' });
const { DB, CATALOGO, FONTE_REF } = globalThis.__X;

/* ------------------------------------------------------------------ PROVENIÊNCIA
   A fonte de referência aparece 65 vezes na base. Repeti-la em cada registro tornaria
   o JSON ilegível e, pior, permitiria que uma cópia divergisse das demais. Ela vira um
   token resolvido no carregamento — a proveniência continua obrigatória, mas passa a
   ter um único ponto de verdade. */
const REF = '@ref:v12';
const tokenizar = v => {
    if (typeof v === 'string') return v.split(FONTE_REF).join(REF);
    if (Array.isArray(v)) return v.map(tokenizar);
    if (v && typeof v === 'object') {
        const o = {};
        Object.keys(v).forEach(k => { o[k] = tokenizar(v[k]); });
        return o;
    }
    return v;
};

let escritos = 0, bytes = 0;
const escrever = (rel, obj, cru) => {
    const p = path.join(DADOS, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    // fontes.json é a própria tabela de resolução: tokenizá-la a tornaria circular.
    const txt = JSON.stringify(cru ? obj : tokenizar(obj), null, 2) + '\n';
    fs.writeFileSync(p, txt);
    escritos++; bytes += Buffer.byteLength(txt);
    console.log('  ' + rel.padEnd(42) + String(txt.split('\n').length - 1).padStart(5) + ' linhas');
};

fs.rmSync(DADOS, { recursive: true, force: true });
console.log('\nEscrevendo dados/ a partir de ' + ORIGEM + '\n');

/* ------------------------------------------------------------------ RAIZ */
escrever('fontes.json', {
    refs: { [REF]: FONTE_REF },
    portalConsular: DB.portalConsular
}, true);
escrever('paises.json', DB.paises);
/* A ordem curada das cidades é informação, não acaso: ela governa a sequência dos chips
   no formulário. Ao dividir por país ela se perderia, então vira dado explícito — e, de
   quebra, passa a ser editável sem mexer em nenhum registro. */
const chaveDe = o => o.id || o.cidadeId || (o.de + '>' + o.para);
escrever('ordem.json', {
    cidades: DB.cidades.map(c => c.id),
    aeroportos: DB.aeroportos.map(chaveDe),
    estacoes: DB.estacoes.map(chaveDe),
    atracoes: DB.atracoes.map(chaveDe),
    hospedagens: DB.hospedagens.map(chaveDe),
    alimentacao: DB.alimentacao.map(chaveDe),
    climatologia: Object.keys(DB.climatologiaFallback || {}),
    zonas: Object.keys(DB.zonas || {})
}, true);
escrever('catalogo.json', CATALOGO);
// Trechos atravessam fronteiras (Paris → Roma), então não pertencem a país nenhum.
escrever('trechos.json', DB.trechos);

/* ------------------------------------------------------------------ POR PAÍS */
const paisDaCidade = {};
DB.cidades.forEach(c => { paisDaCidade[c.id] = c.paisId; });
const paisesUsados = Array.from(new Set(DB.cidades.map(c => c.paisId)));
/* Nem todo registro pertence a uma cidade do roteiro: o aeroporto de Lisboa é escala e
   não tem cidade cadastrada. Um nó logístico órfão que sumisse na divisão seria perda
   silenciosa de curadoria — exatamente o que a separação não pode custar. */
const vistos = new Set();

const filtrarPorChave = (obj, pred) => {
    const o = {};
    Object.keys(obj).forEach(k => { if (pred(k)) o[k] = obj[k]; });
    return o;
};

paisesUsados.forEach(pid => {
    const daqui = id => paisDaCidade[id] === pid;
    const cidades = DB.cidades.filter(c => c.paisId === pid);

    escrever(pid + '/cidades.json', cidades);
    escrever(pid + '/aeroportos.json', DB.aeroportos.filter(a => daqui(a.cidadeId)));
    escrever(pid + '/estacoes.json', DB.estacoes.filter(e => daqui(e.cidadeId)));
    DB.aeroportos.filter(a => daqui(a.cidadeId)).forEach(a => vistos.add('aer:' + a.id));
    DB.estacoes.filter(e => daqui(e.cidadeId)).forEach(e => vistos.add('est:' + e.id));
    escrever(pid + '/hospedagens.json', DB.hospedagens.filter(h => daqui(h.cidadeId)));
    escrever(pid + '/alimentacao.json', DB.alimentacao.filter(a => daqui(a.cidadeId)));
    escrever(pid + '/zonas.json', {
        rotulos: filtrarPorChave(DB.zonas || {}, daqui),
        matriz: filtrarPorChave(DB.matrizZonas || {}, daqui)
    });
    escrever(pid + '/climatologia.json', filtrarPorChave(DB.climatologiaFallback || {}, daqui));
    escrever(pid + '/consular.json', DB.representacoes.filter(r => r.paisId === pid));

    // Uma cidade, um arquivo de atrações: é a unidade natural de curadoria.
    cidades.forEach(c => {
        const ats = DB.atracoes.filter(a => a.cidadeId === c.id);
        if (ats.length) escrever(pid + '/atracoes/' + c.id + '.json', ats);
    });
});

/* ------------------------------------------------------------------ AVULSOS */
const aerOrfaos = DB.aeroportos.filter(a => !vistos.has('aer:' + a.id));
const estOrfaas = DB.estacoes.filter(e => !vistos.has('est:' + e.id));
if (aerOrfaos.length || estOrfaas.length) {
    escrever('avulsos.json', { aeroportos: aerOrfaos, estacoes: estOrfaas });
}

/* ------------------------------------------------------------------ TEMPLATE
   O HTML de origem vira src/index.html com dois marcadores no lugar dos literais.
   Nada mais é tocado: motor, renderização, formulário e arnês seguem intactos. */
const recorte = (txt, abre, fecha, marcador, nome) => {
    const i = txt.indexOf(abre);
    if (i < 0) throw new Error('Não encontrei o início de ' + nome);
    const j = txt.indexOf(fecha, i);
    if (j < 0) throw new Error('Não encontrei o fim de ' + nome);
    const linhas = txt.slice(i, j + fecha.length).split('\n').length;
    console.log('  template: ' + nome + ' → ' + marcador + ' (' + linhas + ' linhas removidas)');
    return txt.slice(0, i) + marcador + txt.slice(j + fecha.length);
};

let tpl = html;
tpl = recorte(tpl, 'const DB = {', '\n};\n', '/*@BASE@*/', 'literal DB');
tpl = recorte(tpl, 'const CATALOGO = {', '\n};\n', '/*@CATALOGO@*/', 'literal CATALOGO');
fs.mkdirSync(path.join(RAIZ, 'src'), { recursive: true });
fs.writeFileSync(path.join(RAIZ, 'src/index.html'), tpl);

console.log('\n' + escritos + ' arquivos JSON · ' + (bytes / 1024).toFixed(1) + ' KB');
console.log('src/index.html gravado — ' + tpl.split('\n').length + ' linhas (origem: ' + html.split('\n').length + ')\n');
