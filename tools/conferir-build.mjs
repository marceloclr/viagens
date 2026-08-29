/* =====================================================================================
   conferir-build.mjs — PROVA DE FIDELIDADE

   Avalia o HTML de origem e o HTML reconstruído, extrai DB e CATALOGO de cada um e
   compara. A separação da base só se justifica se for exatamente reversível: qualquer
   registro perdido, reordenado ou alterado no caminho é uma mudança de produto disfarçada
   de mudança de arquitetura.

       node tools/conferir-build.mjs origem_fase3.html index.html
   ===================================================================================== */
import fs from 'fs';
import vm from 'vm';

const elFake = () => ({
    innerHTML: '', textContent: '', value: '', style: { setProperty() {} }, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, remove() {}, setAttribute() {}, getAttribute: () => null,
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    scrollIntoView() {}, focus() {}, closest: () => null
});

function carregar(arquivo) {
    const html = fs.readFileSync(arquivo, 'utf8');
    // lastIndexOf, não indexOf: se o arquivo tiver um <script> pequeno antes do
    // bloco principal (caso de index.html, que aplica o tema no <head>), isto
    // ainda pega só o motor. Em arquivos de um script só, dá o mesmo resultado.
    const src = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
    const ctx = {
        console: { log() {}, group() {}, groupEnd() {}, error() {} },
        Date, Math, JSON, Set, Map, Array, Object, String, Number, Boolean, RegExp, Error,
        parseInt, parseFloat, isNaN, setTimeout, encodeURIComponent, Intl,
        document: {
            body: elFake(), documentElement: elFake(),
            getElementById: () => elFake(), querySelector: () => elFake(),
            querySelectorAll: () => [], createElement: () => elFake(), addEventListener() {}
        },
        window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), location: { search: '' } },
        location: { search: '' },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        fetch: () => Promise.reject(new Error('sem rede')),
        requestAnimationFrame: f => setTimeout(f, 0)
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(src + '\n;globalThis.__X = { DB, CATALOGO };', ctx, { filename: arquivo });
    return ctx.__X;
}

const [, , A, B] = process.argv;
const a = carregar(A), b = carregar(B);
let falhas = 0;

const conferir = (rotulo, x, y) => {
    const ok = JSON.stringify(x) === JSON.stringify(y);
    if (!ok) falhas++;
    console.log('  ' + (ok ? '✔' : '✘') + ' ' + rotulo);
    return ok;
};

console.log('\nComparando ' + A + '  ×  ' + B + '\n');
Object.keys(a.DB).forEach(k => {
    const n = Array.isArray(a.DB[k]) ? a.DB[k].length
        : (a.DB[k] && typeof a.DB[k] === 'object' ? Object.keys(a.DB[k]).length : 1);
    conferir('DB.' + k.padEnd(22) + String(n).padStart(4) + ' registro(s), incluindo a ordem', a.DB[k], b.DB[k]);
});
conferir('CATALOGO', a.CATALOGO, b.CATALOGO);

console.log('\n' + (falhas
    ? falhas + ' divergência(s) — a base reconstruída NÃO é idêntica à de origem.'
    : 'Reconstrução idêntica à origem, registro a registro e na mesma ordem.') + '\n');
process.exit(falhas ? 1 : 0);
