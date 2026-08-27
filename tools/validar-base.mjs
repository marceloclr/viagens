/* =====================================================================================
   validar-base.mjs — DISCIPLINA DA CURADORIA

   Enquanto a base vivia dentro do HTML, a única defesa contra um registro malformado era
   o motor quebrar em tempo de execução. Separada em arquivos, ela pode ser conferida
   antes de virar produto — e é aqui que a regra "nunca inventar dado" deixa de ser uma
   promessa do código e passa a ser uma condição de compilação.

   Erro impede o build. Aviso não impede, mas fica visível.

       node tools/validar-base.mjs
   ===================================================================================== */
import fs from 'fs';
import path from 'path';

const D = p => path.join(process.cwd(), 'dados', p);
const ler = p => JSON.parse(fs.readFileSync(D(p), 'utf8'));
const existe = p => fs.existsSync(D(p));

const erros = [], avisos = [];
const erro = (arq, msg) => erros.push({ arq, msg });
const aviso = (arq, msg) => avisos.push({ arq, msg });

const paises = ler('paises.json');
const refs = ler('fontes.json').refs;
const ordem = ler('ordem.json');
const dirs = fs.readdirSync(D('.'), { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== 'schema').map(e => e.name);

/* ------------------------------------------------------------------ COLETA */
const cidades = [], sugeridas = [], atracoes = [], hospedagens = [], aeroportos = [], estacoes = [], portos = [], reps = [], alimentacao = [];
dirs.forEach(pid => {
    if (!paises[pid]) erro(pid + '/', 'Pasta de país sem entrada correspondente em paises.json.');
    const cs = ler(pid + '/cidades.json');
    cs.forEach(c => cidades.push({ ...c, __arq: pid + '/cidades.json' }));
    if (existe(pid + '/cidades_sugeridas.json')) {
        ler(pid + '/cidades_sugeridas.json').forEach(c => sugeridas.push({ ...c, __arq: pid + '/cidades_sugeridas.json' }));
    }
    ['aeroportos', 'estacoes', 'portos', 'hospedagens'].forEach(k => {
        if (!existe(pid + '/' + k + '.json')) return;
        ler(pid + '/' + k + '.json').forEach(r => {
            const alvo = k === 'aeroportos' ? aeroportos : (k === 'estacoes' ? estacoes : (k === 'portos' ? portos : hospedagens));
            alvo.push({ ...r, __arq: pid + '/' + k + '.json' });
        });
    });
    if (existe(pid + '/consular.json')) ler(pid + '/consular.json').forEach(r => reps.push({ ...r, __arq: pid + '/consular.json' }));
    if (existe(pid + '/alimentacao.json')) ler(pid + '/alimentacao.json').forEach(r => alimentacao.push({ ...r, __arq: pid + '/alimentacao.json' }));
    cs.forEach(c => {
        const rel = pid + '/atracoes/' + c.id + '.json';
        if (existe(rel)) ler(rel).forEach(a => atracoes.push({ ...a, __arq: rel }));
    });
});
if (existe('avulsos.json')) {
    const av = ler('avulsos.json');
    (av.aeroportos || []).forEach(a => aeroportos.push({ ...a, __arq: 'avulsos.json' }));
    (av.estacoes || []).forEach(e => estacoes.push({ ...e, __arq: 'avulsos.json' }));
}
const trechos = ler('trechos.json');
const voos = (existe('voos.json') ? ler('voos.json') : []).map(v => ({ ...v, __arq: 'voos.json' }));
const idsCidade = new Set([...cidades, ...sugeridas].map(c => c.id));
const idsAeroporto = new Set(aeroportos.map(a => a.id));

/* ------------------------------------------------------------------ IDENTIDADE */
const unicos = (arr, rotulo) => {
    const vistos = new Set();
    arr.forEach(r => {
        if (!r.id) return erro(r.__arq || rotulo, rotulo + ' sem id.');
        if (vistos.has(r.id)) erro(r.__arq || rotulo, 'Id repetido em ' + rotulo + ': ' + r.id);
        vistos.add(r.id);
    });
};
unicos([...cidades, ...sugeridas], 'cidade (curada + sugerida)');
unicos(atracoes, 'atração');
unicos(hospedagens, 'hospedagem');
unicos(aeroportos, 'aeroporto');
unicos(estacoes, 'estação');
unicos(portos, 'porto');
unicos(reps, 'representação');
unicos(voos, 'voo');

/* ------------------------------------------------------------------ REFERÊNCIAS */
cidades.forEach(c => {
    if (!paises[c.paisId]) erro(c.__arq, c.nome + ' aponta para país inexistente: ' + c.paisId);
    if (!(c.noitesMin <= c.noitesIdeal && c.noitesIdeal <= c.noitesMax)) {
        erro(c.__arq, c.nome + ': noites incoerentes (' + c.noitesMin + '/' + c.noitesIdeal + '/' + c.noitesMax + ').');
    }
    (c.aeroportos || []).forEach(a => {
        if (!aeroportos.some(x => x.id === a)) erro(c.__arq, c.nome + ' aponta para aeroporto inexistente: ' + a);
    });
    (c.estacoes || []).forEach(e => {
        if (!estacoes.some(x => x.id === e)) erro(c.__arq, c.nome + ' aponta para estação inexistente: ' + e);
    });
    if (c.lat == null || c.lon == null) aviso(c.__arq, c.nome + ' sem coordenadas — a consulta climática ficará indisponível.');
});
/* Sugeridas são cidades sem curadoria de atrações/hospedagem/trechos — mesmo tratamento
   das cidades declaradas pelo usuário (perfil vazio, afinidade neutra). Não entram na
   checagem de ordem.json: essa ordem é sobre a narrativa curada, não sobre a lista de
   apoio ao filtro por país. */
sugeridas.forEach(c => {
    if (!paises[c.paisId]) erro(c.__arq, c.nome + ' aponta para país inexistente: ' + c.paisId);
    if (!(c.noitesMin <= c.noitesIdeal && c.noitesIdeal <= c.noitesMax)) {
        erro(c.__arq, c.nome + ': noites incoerentes (' + c.noitesMin + '/' + c.noitesIdeal + '/' + c.noitesMax + ').');
    }
    if (c.perfil && Object.keys(c.perfil).length) {
        erro(c.__arq, c.nome + ' — cidade sugerida com "perfil" preenchido. Sugerida precisa de perfil vazio (afinidade neutra); perfil pontuado é curadoria, e pertence a cidades.json.');
    }
    if (c.lat == null || c.lon == null) aviso(c.__arq, c.nome + ' sem coordenadas — a consulta climática ficará indisponível.');
});
const orfa = (arr, rotulo) => arr.forEach(r => {
    if (r.cidadeId != null && !idsCidade.has(r.cidadeId)) erro(r.__arq, rotulo + ' ' + (r.id || r.titulo) + ' aponta para cidade inexistente: ' + r.cidadeId);
});
orfa(atracoes, 'atração'); orfa(hospedagens, 'hospedagem'); orfa(aeroportos, 'aeroporto'); orfa(estacoes, 'estação'); orfa(portos, 'porto');
trechos.forEach(t => {
    if (!idsCidade.has(t.de)) erro('trechos.json', 'Trecho parte de cidade inexistente: ' + t.de);
    if (!idsCidade.has(t.para)) erro('trechos.json', 'Trecho chega a cidade inexistente: ' + t.para);
});
reps.forEach(r => { if (!paises[r.paisId]) erro(r.__arq, 'Representação em país inexistente: ' + r.paisId); });

/* ------------------------------------------------------------------ PROVENIÊNCIA
   Nenhum valor afirmado sem origem declarada — a regra do §11/§12, verificada no dado
   e não apenas na renderização. */
const TIPOS = ['CONFIRMADO', 'EXTERNO', 'CADASTRADO', 'CALCULADO', 'ESTIMADO', 'HISTORICO', 'INDISPONIVEL'];
const conferirProveniencia = (arq, quem, campo, d) => {
    if (d == null) return;
    if (typeof d !== 'object' || !('tipo' in d)) return erro(arq, quem + ' — campo "' + campo + '" sem selo de proveniência.');
    if (TIPOS.indexOf(d.tipo) < 0) return erro(arq, quem + ' — tipo de proveniência desconhecido: ' + d.tipo);
    if (d.tipo === 'INDISPONIVEL') {
        if (d.valor != null) erro(arq, quem + ' — "' + campo + '" marcado como indisponível mas traz valor.');
        return;
    }
    if (d.valor == null) return erro(arq, quem + ' — "' + campo + '" declara ' + d.tipo + ' sem valor. Use indisponível.');
    if (!d.fonte) erro(arq, quem + ' — "' + campo + '" afirma um valor sem fonte. É exatamente o que o sistema não faz.');
};
atracoes.forEach(a => {
    ['custo', 'horario'].forEach(k => conferirProveniencia(a.__arq, a.nome, k, a[k]));
    if (!Array.isArray(a.fechado)) erro(a.__arq, a.nome + ' — "fechado" precisa ser lista de dias da semana (0–6), ainda que vazia.');
    if (!a.endereco) aviso(a.__arq, a.nome + ' sem endereço — o link de mapa não será gerado.');
    if (!a.dur || a.dur <= 0) erro(a.__arq, a.nome + ' sem duração de visita.');
});
reps.forEach(r => {
    ['endereco', 'telefoneGeral', 'telefoneConsular', 'whatsappConsular', 'telefonePlantao',
     'whatsappPlantao', 'horarioAtendimento', 'horarioConsular'].forEach(k => conferirProveniencia(r.__arq, r.nomeOficial, k, r[k]));
    const temPlantao = r.telefonePlantao && r.telefonePlantao.valor != null;
    const temWpp = r.whatsappPlantao && r.whatsappPlantao.valor != null;
    if ((temPlantao || temWpp) && !/emerg/i.test(JSON.stringify(r.plantaoNota || r.observacoes || ''))) {
        aviso(r.__arq, r.nomeOficial + ' — plantão publicado sem ressalva explícita de uso exclusivo em emergência (§42).');
    }
});
[...aeroportos, ...estacoes, ...portos, ...trechos, ...hospedagens].forEach(r => {
    if (!r.fonte) aviso(r.__arq || 'trechos.json', (r.nome || r.id || (r.de + '→' + r.para)) + ' sem fonte declarada.');
});
/* Voos são pernas internacionais Brasil↔país: o lado brasileiro não tem cidade curada,
   por isso a checagem de referência é só de aeroporto (inclui os avulsos, sem cidadeId).
   Malha aérea muda por temporada — aqui consultadoEm é erro, não só aviso, porque
   apresentar um horário sem dizer quando foi visto é exatamente o que a proveniência
   existe para impedir. */
voos.forEach(v => {
    if (!idsAeroporto.has(v.origemAeroporto)) erro(v.__arq, 'Voo ' + v.id + ' parte de aeroporto inexistente: ' + v.origemAeroporto);
    if (!idsAeroporto.has(v.destinoAeroporto)) erro(v.__arq, 'Voo ' + v.id + ' chega a aeroporto inexistente: ' + v.destinoAeroporto);
    if (v.paisId && !paises[v.paisId]) erro(v.__arq, 'Voo ' + v.id + ' aponta para país inexistente: ' + v.paisId);
    conferirProveniencia(v.__arq, v.id, 'custoPP', v.custoPP);
    if (!v.consultadoEm) erro(v.__arq, 'Voo ' + v.id + ' sem data de consulta — horário de referência precisa declarar quando foi verificado.');
});

/* ------------------------------------------------------------------ TOKENS E ORDEM */
const varrer = (v, arq, caminho) => {
    if (typeof v === 'string') {
        const m = v.match(/@ref:[a-z0-9_]+/gi);
        if (m) m.forEach(t => { if (!refs[t]) erro(arq, 'Token de fonte inexistente em fontes.json: ' + t + ' (' + caminho + ')'); });
    } else if (Array.isArray(v)) v.forEach((x, i) => varrer(x, arq, caminho + '[' + i + ']'));
    else if (v && typeof v === 'object') Object.keys(v).forEach(k => varrer(v[k], arq, caminho + '.' + k));
};
[...cidades, ...sugeridas, ...atracoes, ...hospedagens, ...aeroportos, ...estacoes, ...portos, ...reps, ...voos, ...alimentacao].forEach(r => varrer(r, r.__arq, r.id || r.cidadeId || r.nome));
varrer(trechos, 'trechos.json', 'trechos');

cidades.forEach(c => { if (ordem.cidades.indexOf(c.id) < 0) erro('ordem.json', c.nome + ' ausente da ordem curada — o build a jogaria para o fim da lista.'); });
ordem.cidades.forEach(id => { if (!idsCidade.has(id)) aviso('ordem.json', 'Ordem menciona cidade que não existe mais: ' + id); });

/* Toda cidade curada precisa de uma estratégia alimentar: sem isso, a seção "Alimentação
   por cidade" renderiza vazia para ela — sintoma silencioso, porque nada quebra, só falta
   aparecer. Descoberto porque cinco países inteiros (ch, es, il, pt, tr) entraram na base
   sem alimentacao.json e ninguém percebeu até o roteiro chegar lá. */
const idsComAlimentacao = new Set(alimentacao.map(a => a.cidadeId));
cidades.forEach(c => { if (!idsComAlimentacao.has(c.id)) aviso(c.__arq, c.nome + ' — sem estratégia alimentar cadastrada (alimentacao.json do país); a seção "Alimentação por cidade" ficará vazia para ela.'); });
alimentacao.forEach(a => { if (!idsCidade.has(a.cidadeId)) erro(a.__arq, 'Estratégia alimentar aponta para cidade inexistente: ' + a.cidadeId); });

/* ------------------------------------------------------------------ RELATÓRIO */
console.log('\n  ' + cidades.length + ' cidades · ' + sugeridas.length + ' sugeridas · ' + atracoes.length + ' atrações · ' + hospedagens.length +
    ' hospedagens · ' + trechos.length + ' trechos · ' + reps.length + ' repartições · ' + portos.length + ' portos · ' + voos.length + ' voos · ' + alimentacao.length + ' estratégias alimentares\n');
avisos.forEach(a => console.log('  ⚠  ' + a.arq + ' — ' + a.msg));
if (avisos.length) console.log('');
erros.forEach(e => console.log('  ✘  ' + e.arq + ' — ' + e.msg));
console.log('  ' + (erros.length ? erros.length + ' erro(s) — build bloqueado.' : 'Base íntegra.') +
    (avisos.length ? '  ' + avisos.length + ' aviso(s).' : '') + '\n');
process.exit(erros.length ? 1 : 0);
