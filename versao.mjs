// Marca a versão nos arquivos .css/.js das páginas para o navegador sempre baixar a versão nova.
// Rode depois de qualquer mudança: node versao.mjs
import fs from 'node:fs';
const v = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
for (const f of ['index.html', 'admin.html', 'tabela.html', 'vendedor.html']) {
  let h = fs.readFileSync(f, 'utf8');
  h = h.replace(/((?:src|href)="(?:assets\/[\w.-]+\.(?:js|css)|config\.js|dados\/dados-locais\.js))(?:\?v=\w+)?"/g, `$1?v=${v}"`);
  fs.writeFileSync(f, h);
}
console.log('versão', v);
