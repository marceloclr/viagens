/* =====================================================================================
   testar.mjs — ARNÊS FORA DO NAVEGADOR

   Executa o bloco <script> do HTML com um DOM de fachada e roda as 92 verificações do
   bloco [21], as mesmas que ?debug=1 dispara na página. Serve para conferir o arquivo
   construído antes de distribuí-lo: teste vermelho impede a entrega.

       node tools/testar.mjs index.html
   ===================================================================================== */
const fs = require('fs');

function el(id) {
    return {
        id: id, innerHTML: '', value: '', disabled: false, style: {}, dataset: {},
        classList: { add() {}, remove() {}, contains() { return false; } },
        appendChild() {}, remove() {}, insertAdjacentHTML() {}, setAttribute() {},
        getAttribute() { return null; }, addEventListener() {}, removeEventListener() {},
        querySelector() { return null; }, querySelectorAll() { return []; },
        scrollIntoView() {}, focus() {}, closest() { return null; }, contains() { return false; }
    };
}
const doc = {
    body: el('body'),
    documentElement: el('html'),
    getElementById(id) { return el(id); },
    querySelector() { return el('q'); },
    querySelectorAll() { return []; },
    createElement(t) { return el(t); },
    addEventListener() {},
    createTextNode() { return {}; }
};
global.document = doc;
global.window = { addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; }, location: { search: '' }, print() {} };
global.location = { search: '', href: '' };
global.navigator = { userAgent: 'node' };
const store = {};
global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
};
global.fetch = () => Promise.reject(new Error('rede indisponível no arnês'));
global.requestAnimationFrame = f => setTimeout(f, 0);

const html = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
// lastIndexOf, não indexOf: o <head> tem um <script> pequeno (aplica o tema
// antes do primeiro paint) que vem antes do bloco principal do motor.
const src = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
const vm = require('vm');
vm.createContext(global);
vm.runInThisContext(src, { filename: 'app.js' });

(async () => {
    const res = await Testes.executar();
    const falhos = res.linhas.filter(l => !l.ok);
    console.log('\n=== RESULTADO: ' + res.passou + '/' + res.total + ' ===');
    if (falhos.length) { console.log('FALHAS:'); falhos.forEach(f => console.log(' ✘ ' + f.n + '  →  ' + f.d)); }
})().catch(e => { console.error('ERRO NO ARNÊS:', e); process.exit(1); });
