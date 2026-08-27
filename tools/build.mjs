/* =====================================================================================
   build.mjs — COMPOSIÇÃO

   Lê dados/, resolve os tokens de proveniência e injeta o resultado em src/template.html,
   produzindo index.html (raiz): um arquivo único, que abre com dois cliques, sem servidor,
   sem fetch e sem módulos ES — as três coisas que morrem em file://. É esse index.html
   que um servidor de publicação carrega por padrão.

   Autoria modular, distribuição monolítica. É a leitura literal do §8.

       node tools/build.mjs
   ===================================================================================== */
import fs from 'fs';
import path from 'path';

const RAIZ = process.cwd();
const D = p => path.join(RAIZ, 'dados', p);
const ler = p => JSON.parse(fs.readFileSync(D(p), 'utf8'));
const existe = p => fs.existsSync(D(p));

/* ------------------------------------------------------------------ PROVENIÊNCIA
   Os tokens @ref:* são expandidos aqui, no build, e não em tempo de execução: o HTML
   distribuído sai com a fonte escrita por extenso em cada registro, como sempre esteve.
   O token existe para dar um único ponto de verdade ao curador, não para economizar
   bytes no produto. */
const refs = ler('fontes.json').refs;
const resolver = v => {
    if (typeof v === 'string') {
        let s = v;
        Object.keys(refs).forEach(k => { s = s.split(k).join(refs[k]); });
        if (/@ref:/.test(s)) throw new Error('Token de fonte não resolvido: ' + s);
        return s;
    }
    if (Array.isArray(v)) return v.map(resolver);
    if (v && typeof v === 'object') {
        const o = {};
        Object.keys(v).forEach(k => { o[k] = resolver(v[k]); });
        return o;
    }
    return v;
};

/* ------------------------------------------------------------------ MONTAGEM
   A ordem dos países segue dados/paises.json; a das cidades, cada cidades.json. Ordem
   estável importa: sem ela, dois builds do mesmo conteúdo produziriam diffs falsos. */
const paises = ler('paises.json');
const dirs = fs.readdirSync(D('.'), { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== 'schema')
    .map(e => e.name)
    .sort((a, b) => Object.keys(paises).indexOf(a) - Object.keys(paises).indexOf(b));

const DB = {
    paises: paises,
    cidades: [], cidadesSugeridas: [], zonas: {}, matrizZonas: {}, zonasCoordenadas: {},
    aeroportos: [], estacoes: [], portos: [], trechos: ler('trechos.json'),
    // Pernas internacionais Brasil↔país, com número de voo e horário reais — ao contrário
    // de trechos.json (deslocamento entre cidades da própria base), aqui o lado brasileiro
    // não tem cidade curada: por isso os aeroportos de origem (Fortaleza etc.) vivem em
    // avulsos.json, sem cidadeId. Cada registro carrega proveniência com consultadoEm
    // porque malha aérea muda por temporada — a interface declara isso, não esconde.
    voos: existe('voos.json') ? ler('voos.json') : [],
    atracoes: [], hospedagens: [], alimentacao: [], representacoes: [],
    portalConsular: ler('fontes.json').portalConsular,
    climatologiaFallback: {},
    // Só nome, país e coordenadas — geografia de domínio público, usada para sugerir
    // latitude/longitude de destinos declarados e para estimar trechos por distância
    // quando não há trecho curado. Não é curadoria turística: não carrega atração,
    // hospedagem, preço nem proveniência item a item.
    gazetteer: existe('gazetteer.json') ? ler('gazetteer.json') : []
};

let arquivos = 1;
dirs.forEach(pid => {
    const cidades = ler(pid + '/cidades.json');
    DB.cidades.push(...cidades);
    arquivos++;
    // Cidades sugeridas: apoio ao filtro por país, sem curadoria de atrações, hospedagem
    // ou trechos — mesmo tratamento de uma cidade declarada pelo usuário (perfil vazio,
    // afinidade neutra em calcularNoites()). Não entram na ordem curada de dados/ordem.json.
    if (existe(pid + '/cidades_sugeridas.json')) { DB.cidadesSugeridas.push(...ler(pid + '/cidades_sugeridas.json')); arquivos++; }
    ['aeroportos', 'estacoes', 'portos', 'hospedagens', 'alimentacao'].forEach(k => {
        if (existe(pid + '/' + k + '.json')) { DB[k].push(...ler(pid + '/' + k + '.json')); arquivos++; }
    });
    if (existe(pid + '/consular.json')) { DB.representacoes.push(...ler(pid + '/consular.json')); arquivos++; }
    if (existe(pid + '/zonas.json')) {
        const z = ler(pid + '/zonas.json');
        Object.assign(DB.zonas, z.rotulos || {});
        Object.assign(DB.matrizZonas, z.matriz || {});
        // Coordenadas de zona: geografia de domínio público, usada só para estimar
        // deslocamento intraurbano por distância quando não há matriz curada — não
        // substitui a matriz manual onde ela existe (ver IDX.minutosZona).
        Object.assign(DB.zonasCoordenadas, z.coordenadas || {});
        arquivos++;
    }
    if (existe(pid + '/climatologia.json')) { Object.assign(DB.climatologiaFallback, ler(pid + '/climatologia.json')); arquivos++; }
    // Atrações na ordem das cidades, não na ordem alfabética do sistema de arquivos.
    cidades.forEach(c => {
        const rel = pid + '/atracoes/' + c.id + '.json';
        if (existe(rel)) { DB.atracoes.push(...ler(rel)); arquivos++; }
    });
});
/* ------------------------------------------------------------------ ORDEM CURADA
   A divisão por país reagrupa as cidades por pasta; dados/ordem.json devolve a sequência
   que o curador escolheu, que é a que o formulário exibe. Sem isto, a separação seria
   silenciosamente destrutiva — mudaria o produto sem mudar um dado sequer. */
const ordem = ler('ordem.json');
arquivos++;
if (existe('avulsos.json')) {
    const av = ler('avulsos.json');
    DB.aeroportos.push(...(av.aeroportos || []));
    DB.estacoes.push(...(av.estacoes || []));
    arquivos++;
}
const chaveDe = o => o.id || o.cidadeId || (o.de + '>' + o.para);
const ordenar = (arr, chaves) => {
    const p = id => { const i = chaves.indexOf(id); return i < 0 ? chaves.length : i; };
    return arr.sort((a, b) => p(chaveDe(a)) - p(chaveDe(b)));
};
const ordenarChaves = (obj, chaves) => {
    const p = id => { const i = chaves.indexOf(id); return i < 0 ? chaves.length : i; };
    const o = {};
    Object.keys(obj).sort((a, b) => p(a) - p(b)).forEach(k => { o[k] = obj[k]; });
    return o;
};

DB.cidades = ordenar(DB.cidades, ordem.cidades);
['aeroportos', 'estacoes', 'atracoes', 'hospedagens', 'alimentacao'].forEach(k => {
    DB[k] = ordenar(DB[k], ordem[k] || ordem.cidades);
});
DB.zonas = ordenarChaves(DB.zonas, ordem.zonas || ordem.cidades);
DB.matrizZonas = ordenarChaves(DB.matrizZonas, ordem.zonas || ordem.cidades);
DB.climatologiaFallback = ordenarChaves(DB.climatologiaFallback, ordem.climatologia || ordem.cidades);

const faltando = DB.cidades.map(c => c.id).filter(id => ordem.cidades.indexOf(id) < 0);
if (faltando.length) throw new Error('Cidades ausentes de dados/ordem.json: ' + faltando.join(', '));

const CATALOGO = ler('catalogo.json');
arquivos += 2;

/* ------------------------------------------------------------------ INJEÇÃO */
const tpl = fs.readFileSync(path.join(RAIZ, 'src/template.html'), 'utf8');
['/*@BASE@*/', '/*@CATALOGO@*/'].forEach(m => {
    if (tpl.indexOf(m) < 0) throw new Error('Marcador ausente em src/template.html: ' + m);
});

const literal = (nome, obj) =>
    '/* ---------------------------------------------------------------------------------\n' +
    '   ' + nome + ' — GERADO POR tools/build.mjs. NÃO EDITAR AQUI.\n' +
    '   Fonte: dados/. Toda correção de curadoria é feita lá e recomposta pelo build.\n' +
    '   --------------------------------------------------------------------------------- */\n' +
    'const ' + nome + ' = ' + JSON.stringify(resolver(obj), null, 4) + ';\n';

// </script> dentro de um dado quebraria o documento antes de virar objeto.
const seguro = s => s.split('</script').join('<\\/script');

let saida = tpl
    .replace('/*@BASE@*/', () => seguro(literal('DB', DB)))
    .replace('/*@CATALOGO@*/', () => seguro(literal('CATALOGO', CATALOGO)));

const destino = path.join(RAIZ, 'index.html');
fs.writeFileSync(destino, saida);

console.log('\n  ' + arquivos + ' arquivos de dados lidos');
console.log('  ' + DB.cidades.length + ' cidades · ' + DB.cidadesSugeridas.length + ' sugeridas · ' + DB.atracoes.length + ' atrações · ' +
    DB.hospedagens.length + ' hospedagens · ' + DB.representacoes.length + ' repartições consulares · ' +
    DB.portos.length + ' portos · ' + DB.voos.length + ' voos');
console.log('  index.html — ' + (Buffer.byteLength(saida) / 1024).toFixed(1) +
    ' KB, ' + saida.split('\n').length + ' linhas\n');
