// Servidor do sistema no computador: node servidor.mjs  →  http://localhost:5173
// Guarda os dados na pasta dados-dev/ e as fotos enviadas em fotos-dev/.
// Senha do admin nos testes: aiker
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawn } from 'node:child_process';

const raiz = path.dirname(fileURLToPath(import.meta.url));
const porta = Number(process.env.PORT) || 5173;
const SENHA = process.env.SENHA_ADMIN || 'aiker';
const DIR = path.join(raiz, 'dados-dev');
const FOTOS = path.join(raiz, 'fotos-dev');
fs.mkdirSync(DIR, { recursive: true });
fs.mkdirSync(FOTOS, { recursive: true });

const tipos = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.pdf': 'application/pdf',
  '.gs': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const arq = n => path.join(DIR, n + '.json');
function ler(n) {
  try { return JSON.parse(fs.readFileSync(arq(n), 'utf8')); } catch (e) { return null; }
}
function gravar(n, v) { fs.writeFileSync(arq(n), JSON.stringify(v, null, 1)); }
function semente() {
  return ler('seed') || { produtos: [], config: {}, vendedores: [], publicadoEm: '' };
}
function rascunho() {
  let r = ler('rascunho');
  if (!r) { const s = semente(); r = { produtos: s.produtos, config: s.config, vendedores: s.vendedores, alteradoEm: '' }; gravar('rascunho', r); }
  return r;
}
function publicado() {
  let p = ler('publicado');
  if (!p) { const s = semente(); p = { produtos: s.produtos, config: s.config, vendedores: s.vendedores, publicadoEm: s.publicadoEm || '' }; gravar('publicado', p); }
  return p;
}
// esgotados saem do catálogo público sem nada que identifique o produto (proteção contra concorrentes)
function anonimizar(lista, cfg) {
  const lim = Math.max(0, Number((cfg || {}).estoqueAlertaCx ?? 2)) || 0;
  return (lista || []).filter(p => p && p.ativo !== false).map((p, i) => {
    if (p.esgotado) return { codigo: 'ESG-' + (i + 1), categoria: p.categoria, nome: '', preco: null, promo: null, pcs: '', esgotado: true, ativo: true, anonimo: true, specs: [], fotos: [] };
    // o número do estoque fica só no painel; o público recebe só o aviso de "últimas unidades"
    const { estoque, ...resto } = p;
    const pcs = parseInt(String(p.pcs || '').match(/\d+/) || '0', 10) || 1;
    if (lim && typeof estoque === 'number' && estoque > 0 && estoque <= pcs * lim) resto.poucas = true;
    return resto;
  });
}
function acessos() { return ler('acessos') || []; }
function admins() { return ler('admins') || []; }
function segredo() {
  let x = ler('segredo');
  if (!x) { x = crypto.randomBytes(24).toString('hex'); gravar('segredo', x); }
  return x;
}
// token do vendedor: muda se a senha dele mudar (assim um aparelho antigo deixa de valer)
function tokenVendedor(v) { return crypto.createHash('sha256').update(segredo() + ':' + v.id + ':' + (v.hash || '')).digest('hex').slice(0, 40); }
function publicoAdmin(a) { return { id: a.id, nome: a.nome, login: a.login }; }
// quem está usando o painel: principal (senha mestra, usuário em branco) ou um usuário extra
function autenticar(d) {
  const u = String(d.usuario || '').trim().toLowerCase();
  if (u) {
    const a = admins().find(x => x.login === u);
    return a && a.hash === hash(a.sal, String(d.senha || '')) ? { nome: a.nome, login: a.login, id: a.id, principal: false } : null;
  }
  return d.senha === (ler('senha') || SENHA) ? { nome: 'Administrador principal', login: '', principal: true } : null;
}
function hash(sal, senha) { return crypto.createHash('sha256').update(sal + ':' + senha, 'utf8').digest('hex'); }
function publicoVend(v) { return { id: v.id, nome: v.nome, login: v.login, contato: v.contato || '', email: v.email || '' }; }
function agora() {
  const d = new Date();
  const z = n => String(n).padStart(2, '0');
  return `${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()} às ${z(d.getHours())}:${z(d.getMinutes())}`;
}
// histórico de preços: uma entrada por produto sempre que o preço/promoção publicado muda
function registrarHistorico(produtos, data) {
  let h = ler('historico');
  if (!h) {
    h = {};
    const s = semente();
    (s.produtos || []).forEach(p => { if (p.codigo && p.preco != null) h[p.codigo] = [{ d: s.publicadoEm || '14/10/2026', p: p.preco, pr: p.promo ?? null }]; });
  }
  (produtos || []).forEach(p => {
    if (!p || !p.codigo || p.preco == null) return;
    const l = h[p.codigo] || (h[p.codigo] = []);
    const u = l[l.length - 1];
    const pr = p.promo === '' ? null : (p.promo ?? null);
    if (u && u.p === p.preco && u.pr === pr) return;
    if (u && u.d === data) { u.p = p.preco; u.pr = pr; return; } // mesmo dia: fica só a última
    l.push({ d: data, p: p.preco, pr });
  });
  gravar('historico', h);
}
// cópia automática a cada publicação (guarda as 30 últimas)
function copiaAutomatica(r, p, motivo, por) {
  const pasta = path.join(DIR, 'copias');
  fs.mkdirSync(pasta, { recursive: true });
  const d = new Date(); const z = n => String(n).padStart(2, '0');
  const nome = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}-${z(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, "0")}.json`;
  fs.writeFileSync(path.join(pasta, nome), JSON.stringify({ motivo: motivo || 'publicacao', feitaEm: agora(), por: por || '', rascunho: r, publicado: p }));
  fs.readdirSync(pasta).filter(f => f.endsWith('.json')).sort().slice(0, -30).forEach(f => fs.rmSync(path.join(pasta, f)));
}
// lado maior da imagem (px) lendo só o cabeçalho: PNG, JPEG e WEBP
function ladoMaior(arquivo) {
  try {
    const fd = fs.openSync(arquivo, 'r'); const b = Buffer.alloc(65536); const n = fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd);
    if (b.toString('ascii', 1, 4) === 'PNG') return Math.max(b.readUInt32BE(16), b.readUInt32BE(20));
    if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
      const t = b.toString('ascii', 12, 16);
      if (t === 'VP8X') return Math.max(1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3));
      if (t === 'VP8 ') return Math.max(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
      if (t === 'VP8L') { const v = b.readUInt32LE(21); return Math.max(1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)); }
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      for (let i = 2; i < n - 9;) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1], len = b.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return Math.max(b.readUInt16BE(i + 5), b.readUInt16BE(i + 7));
        i += 2 + len;
      }
    }
  } catch (e) { /* arquivo sumiu ou formato desconhecido */ }
  return 0;
}
function montarBackup() {
  const fotos = {};
  for (const f of fs.readdirSync(FOTOS)) fotos[f] = fs.readFileSync(path.join(FOTOS, f)).toString('base64');
  return { tipo: 'backup-catalogo-aiker', versao: 1, geradoEm: agora(), rascunho: rascunho(), publicado: publicado(), acessos: acessos(), admins: admins(), propostas: ler('propostas') || [], lixeira: ler('lixeira') || [], historico: ler('historico') || {}, fotos };
}

// ---- backup automático: uma cópia completa por dia numa pasta (de preferência sincronizada com a nuvem) ----
function cfgBackupAuto() {
  let c = ler('backup-auto');
  if (!c) {
    const nuvem = process.env.OneDrive || path.join(os.homedir(), 'OneDrive');
    // instalação nova: começa desligado (sugere a pasta do OneDrive); liga em Configurações → Backup automático
    c = { ativo: false, pasta: path.join(nuvem, 'Backup Catálogo Aiker'), ultimo: '', arquivo: '', erro: '' };
    gravar('backup-auto', c);
  }
  return c;
}
function backupAutomatico(forcar) {
  const c = cfgBackupAuto();
  if (!c.ativo && !forcar) return c;
  try {
    fs.mkdirSync(c.pasta, { recursive: true });
    const d = new Date(); const z = n => String(n).padStart(2, '0');
    const alvo = path.join(c.pasta, `backup-catalogo-aiker-${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}.json`);
    if (forcar || !fs.existsSync(alvo)) {
      fs.writeFileSync(alvo, JSON.stringify(montarBackup()));
      c.ultimo = agora(); c.arquivo = alvo;
    }
    // guarda os 30 dias mais recentes
    fs.readdirSync(c.pasta).filter(f => /^backup-catalogo-aiker-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(0, -30).forEach(f => fs.rmSync(path.join(c.pasta, f)));
    c.erro = '';
  } catch (e) { c.erro = e.message; }
  gravar('backup-auto', c);
  return c;
}

// ---- pasta da atualização: a cada publicação, salva tabela, novidades, planilha e backup numa pasta com a data ----
const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
function cfgArquivo() {
  let c = ler('pasta-atualizacao');
  if (!c) { const base = 'D:\\IKANOO'; c = { ativo: fs.existsSync(base), base, ultimo: '', pasta: '', arquivos: [], erro: '' }; gravar('pasta-atualizacao', c); }
  return c;
}
function pastaDoDia(base, d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return { pasta: path.join(base, String(d.getFullYear()), 'TABELA-DE-PRODUTOS', MESES[d.getMonth()], `${z(d.getDate())}-${z(d.getMonth() + 1)}`, 'AIKER'), prefixo: `${z(d.getDate())}-${z(d.getMonth() + 1)}`, ano: d.getFullYear() };
}
const NAVEGADORES = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
// imprime uma página do próprio sistema em PDF, com o navegador do computador sem janela
function imprimirPdf(url, destino) {
  return new Promise((ok, falha) => {
    const nav = NAVEGADORES.find(f => fs.existsSync(f));
    if (!nav) return falha(new Error('não encontrei o Edge ou o Chrome para gerar o PDF'));
    const perfil = path.join(os.tmpdir(), 'catalogo-aiker-pdf-' + process.pid);
    const p = spawn(nav, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw', '--virtual-time-budget=45000', '--user-data-dir=' + perfil, '--print-to-pdf=' + destino, url], { windowsHide: true, stdio: 'ignore' });
    const limite = setTimeout(() => { p.kill(); falha(new Error('o navegador demorou demais para gerar o PDF')); }, 180000);
    p.on('exit', () => { clearTimeout(limite); fs.existsSync(destino) && fs.statSync(destino).size > 1000 ? ok() : falha(new Error('o PDF não foi gerado')); });
    p.on('error', e => { clearTimeout(limite); falha(e); });
  });
}
async function arquivarAtualizacao(d, quem) {
  const c = cfgArquivo();
  const { pasta, prefixo, ano } = pastaDoDia(c.base);
  fs.mkdirSync(pasta, { recursive: true });
  // publicou de novo no mesmo dia: não apaga a anterior, os arquivos novos ganham _V2, _V3…
  const ja = fs.readdirSync(pasta);
  let v = 1;
  while (ja.some(f => f.startsWith(`${prefixo}-TABELA_AIKER_${ano}${v === 1 ? '' : '_V' + v}.`) || f.startsWith(`${prefixo}-BACKUP_AIKER_${ano}${v === 1 ? '' : '_V' + v}.`))) v++;
  const nome = tipo => path.join(pasta, `${prefixo}-${tipo}_AIKER_${ano}${v === 1 ? '' : '_V' + v}`);
  const feitos = [], erros = [];
  const tentar = async (rotulo, fn) => { try { await fn(); feitos.push(rotulo); } catch (e) { erros.push(rotulo + ': ' + e.message); } };
  await tentar(path.basename(nome('TABELA')) + '.pdf', () => imprimirPdf(`http://localhost:${porta}/tabela.html?arquivo=1`, nome('TABELA') + '.pdf'));
  if (d.novidades && Array.isArray(d.novidades.produtos) && d.novidades.produtos.length) {
    const id = 'novidades-' + Date.now();
    fs.mkdirSync(path.join(DIR, 'previas'), { recursive: true });
    fs.writeFileSync(path.join(DIR, 'previas', id + '.json'), JSON.stringify(d.novidades));
    await tentar(path.basename(nome('NOVIDADES')) + '.pdf', () => imprimirPdf(`http://localhost:${porta}/tabela.html?previaServidor=${id}`, nome('NOVIDADES') + '.pdf'));
    fs.rmSync(path.join(DIR, 'previas', id + '.json'), { force: true });
  }
  if (d.xlsx) await tentar(path.basename(nome('PRODUTOS')) + '.xlsx', () => fs.writeFileSync(nome('PRODUTOS') + '.xlsx', Buffer.from(String(d.xlsx), 'base64')));
  await tentar(path.basename(nome('BACKUP')) + '.json', () => fs.writeFileSync(nome('BACKUP') + '.json', JSON.stringify(montarBackup())));
  Object.assign(c, { ultimo: agora(), pasta, arquivos: feitos, erro: erros.join(' · '), por: quem.nome });
  gravar('pasta-atualizacao', c);
  return c;
}

function pendente(r, p) {
  // compara com o que a publicação geraria (esgotados anônimos, sem a base das novidades)
  const { novidadesBase, ...cfg } = r.config || {};
  const pc = { ...(p.config || {}) }; delete pc.novidadesBase;
  return JSON.stringify([anonimizar(r.produtos, r.config), cfg]) !== JSON.stringify([p.produtos, pc]);
}

function api(req, corpo) {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET') {
    if (url.searchParams.get('acao') === 'previaArquivo') {
      const f = path.join(DIR, 'previas', path.basename(String(url.searchParams.get('id') || '')) + '.json');
      if (!fs.existsSync(f)) return { ok: false, erro: 'Prévia não encontrada' };
      return { ok: true, ...JSON.parse(fs.readFileSync(f, 'utf8')) };
    }
    if (url.searchParams.get('acao') === 'catalogo') {
      const p = publicado();
      return { ok: true, produtos: p.produtos, config: p.config, vendedores: p.vendedores, publicadoEm: p.publicadoEm };
    }
    return { ok: false, erro: 'Ação desconhecida' };
  }
  let d;
  try { d = JSON.parse(corpo || '{}'); } catch (e) { return { ok: false, erro: 'Dados inválidos' }; }
  // ---- vendedores (login próprio) ----
  if (d.acao === 'vendedorEntrar') {
    const v = acessos().find(x => x.login === String(d.login || '').trim().toLowerCase());
    if (!v || v.hash !== hash(v.sal, String(d.senhaVendedor || ''))) return { ok: false, erro: 'login' };
    return { ok: true, vendedor: { ...publicoVend(v), token: tokenVendedor(v) } };
  }
  if (d.acao === 'registrarProposta') {
    const v = acessos().find(x => x.login === String(d.login || '').trim().toLowerCase());
    if (!v || d.token !== tokenVendedor(v)) return { ok: false, erro: 'token' };
    const pr = d.proposta || {};
    if (!pr.id) return { ok: false, erro: 'Proposta sem identificação.' };
    const lista = ler('propostas') || [];
    const item = {
      id: v.id + ':' + String(pr.id).slice(0, 40), vendedorId: v.id, vendedor: v.nome, login: v.login,
      numero: String(pr.numero || '').slice(0, 40), cliente: String(pr.cliente || '').slice(0, 120), cidade: String(pr.cidade || '').slice(0, 80),
      tabela: +pr.tabela || 0, total: +pr.total || 0, itens: (Array.isArray(pr.itens) ? pr.itens : []).slice(0, 300).map(i => ({ codigo: String(i.codigo || '').slice(0, 40), qtd: +i.qtd || 0, modo: i.modo === 'un' ? 'un' : 'cx', unidades: +i.unidades || 0, desc: +i.desc || 0 })),
      descPedido: +pr.descPedido || 0, pdf: !!pr.pdf, atualizadaEm: agora(), quando: Date.now(),
    };
    const k = lista.findIndex(x => x.id === item.id);
    if (k >= 0) { item.criadaEm = lista[k].criadaEm; item.pdf = item.pdf || lista[k].pdf; lista[k] = item; } else { item.criadaEm = agora(); lista.unshift(item); }
    gravar('propostas', lista.slice(0, 5000));
    return { ok: true };
  }
  const quem = autenticar(d);
  if (!quem) return { ok: false, erro: 'senha' };
  if (d.acao === 'atividade') return { ok: true, propostas: ler('propostas') || [] };
  if (d.acao === 'admins') return { ok: true, admins: quem.principal ? admins().map(publicoAdmin) : [] };
  if (d.acao === 'salvarAdmin' || d.acao === 'removerAdmin') {
    if (!quem.principal) return { ok: false, erro: 'Só o administrador principal pode cuidar dos usuários do painel.' };
    let lista = admins();
    if (d.acao === 'removerAdmin') { lista = lista.filter(x => x.id !== d.id); gravar('admins', lista); return { ok: true, admins: lista.map(publicoAdmin) }; }
    const a = d.admin || {};
    const login = String(a.login || '').trim().toLowerCase();
    if (!a.nome || !login) return { ok: false, erro: 'Preencha nome e usuário.' };
    if (!/^[a-z0-9._-]{2,30}$/.test(login)) return { ok: false, erro: 'Usuário: use só letras, números, ponto ou traço (sem espaço).' };
    if (lista.some(x => x.login === login && x.id !== a.id)) return { ok: false, erro: 'Já existe um usuário com esse nome de acesso.' };
    let atual = lista.find(x => x.id === a.id);
    if (!atual) { if (!a.novaSenha) return { ok: false, erro: 'Defina uma senha.' }; atual = { id: crypto.randomUUID() }; lista.push(atual); }
    Object.assign(atual, { nome: String(a.nome).trim(), login });
    if (a.novaSenha) { if (String(a.novaSenha).length < 4) return { ok: false, erro: 'A senha precisa ter pelo menos 4 caracteres.' }; atual.sal = crypto.randomBytes(8).toString('hex'); atual.hash = hash(atual.sal, String(a.novaSenha)); }
    gravar('admins', lista);
    return { ok: true, admins: lista.map(publicoAdmin) };
  }
  if (d.acao === 'vendedores') return { ok: true, vendedores: acessos().map(publicoVend) };
  if (d.acao === 'salvarVendedor') {
    const v = d.vendedor || {};
    const lista = acessos();
    const login = String(v.login || '').trim().toLowerCase();
    if (!v.nome || !login) return { ok: false, erro: 'Preencha nome e usuário.' };
    if (lista.some(x => x.login === login && x.id !== v.id)) return { ok: false, erro: 'Já existe um vendedor com esse usuário.' };
    let atual = lista.find(x => x.id === v.id);
    if (!atual) { if (!v.novaSenha) return { ok: false, erro: 'Defina uma senha para o vendedor.' }; atual = { id: crypto.randomUUID() }; lista.push(atual); }
    Object.assign(atual, { nome: String(v.nome).trim(), login, contato: String(v.contato || '').trim(), email: String(v.email || '').trim() });
    if (v.novaSenha) { if (String(v.novaSenha).length < 4) return { ok: false, erro: 'A senha precisa ter pelo menos 4 caracteres.' }; atual.sal = crypto.randomBytes(8).toString('hex'); atual.hash = hash(atual.sal, String(v.novaSenha)); }
    gravar('acessos', lista);
    return { ok: true, vendedores: lista.map(publicoVend) };
  }
  if (d.acao === 'removerVendedor') {
    const lista = acessos().filter(x => x.id !== d.id);
    gravar('acessos', lista);
    return { ok: true, vendedores: lista.map(publicoVend) };
  }
  const r = rascunho();
  const p = publicado();
  switch (d.acao) {
    case 'entrar':
      return { ok: true, quem: { nome: quem.nome, login: quem.login, principal: quem.principal } };
    case 'rascunho':
      return { ok: true, ...r, publicadoEm: p.publicadoEm, pendente: pendente(r, p) };
    case 'salvar': {
      if (Array.isArray(d.produtos)) r.produtos = d.produtos;
      if (d.config && typeof d.config === 'object') r.config = d.config;
      if (Array.isArray(d.vendedores)) r.vendedores = d.vendedores;
      r.alteradoEm = agora();
      gravar('rascunho', r);
      return { ok: true, alteradoEm: r.alteradoEm, pendente: pendente(r, p) };
    }
    case 'enviarFoto': {
      const nome = String(d.nome || 'foto').replace(/[^\w.-]+/g, '-').slice(0, 80);
      const final = Date.now() + '-' + nome;
      fs.writeFileSync(path.join(FOTOS, final), Buffer.from(String(d.base64 || ''), 'base64'));
      return { ok: true, url: 'fotos-dev/' + final };
    }
    case 'publicar': {
      const { novidadesBase, ...cfgPub } = r.config || {};
      const novo = { produtos: anonimizar(r.produtos, r.config), config: cfgPub, vendedores: [], publicadoEm: agora() };
      gravar('publicado', novo);
      registrarHistorico(r.produtos, novo.publicadoEm.split(' ')[0]);
      copiaAutomatica(r, novo, 'publicacao', quem.nome);
      return { ok: true, publicadoEm: novo.publicadoEm };
    }
    case 'historico': {
      if (!ler('historico')) registrarHistorico(p.produtos, String(p.publicadoEm || '').split(' ')[0] || agora().split(' ')[0]);
      const h = ler('historico') || {};
      return { ok: true, historico: d.codigo ? (h[d.codigo] || []) : h };
    }
    case 'copias': {
      const pasta = path.join(DIR, 'copias');
      const lista = fs.existsSync(pasta) ? fs.readdirSync(pasta).filter(f => f.endsWith('.json')).sort().reverse() : [];
      return { ok: true, copias: lista.map(f => {
        let c = {}; try { c = JSON.parse(fs.readFileSync(path.join(pasta, f), 'utf8')); } catch (e) {}
        const pub = (c.publicado || {}).produtos || [];
        return { id: f, por: c.por || '', motivo: c.motivo || 'publicacao', feitaEm: c.feitaEm || '', publicadoEm: (c.publicado || {}).publicadoEm || '', produtos: pub.length, esgotados: pub.filter(x => x.esgotado).length, igualAoAtual: !!c.publicado && JSON.stringify([c.publicado.produtos, c.publicado.config]) === JSON.stringify([p.produtos, p.config]) };
      }) };
    }
    case 'voltarCopia': {
      const f = path.join(DIR, 'copias', path.basename(String(d.id || '')));
      if (!/\.json$/.test(f) || !fs.existsSync(f)) return { ok: false, erro: 'Versão não encontrada.' };
      const c = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (!c.publicado || !Array.isArray(c.publicado.produtos)) return { ok: false, erro: 'Versão inválida.' };
      copiaAutomatica(r, p, 'antes-de-voltar', quem.nome);
      if (c.rascunho && Array.isArray(c.rascunho.produtos)) gravar('rascunho', c.rascunho);
      gravar('publicado', { ...c.publicado, publicadoEm: agora() });
      return { ok: true };
    }
    case 'lixeiraAdd': {
      const l = ler('lixeira') || [];
      (Array.isArray(d.produtos) ? d.produtos : []).forEach(prod => { if (prod && prod.codigo) l.unshift({ id: crypto.randomUUID(), quando: Date.now(), excluidoEm: agora(), por: quem.nome, produto: prod }); });
      gravar('lixeira', l.slice(0, 2000));
      return { ok: true };
    }
    case 'lixeira': {
      const limite = Date.now() - 30 * 864e5;
      const l = (ler('lixeira') || []).filter(x => x.quando >= limite); // some sozinho depois de 30 dias
      gravar('lixeira', l);
      return { ok: true, itens: l };
    }
    case 'lixeiraTirar': {
      const ids = new Set(Array.isArray(d.ids) ? d.ids : []);
      gravar('lixeira', (ler('lixeira') || []).filter(x => !ids.has(x.id)));
      return { ok: true };
    }
    case 'copia': {
      const f = path.join(DIR, 'copias', path.basename(String(d.id || '')));
      if (!/\.json$/.test(f) || !fs.existsSync(f)) return { ok: false, erro: 'Versão não encontrada.' };
      const c = JSON.parse(fs.readFileSync(f, 'utf8'));
      return { ok: true, rascunho: c.rascunho || null, feitaEm: c.feitaEm || '' };
    }
    case 'tamanhosFotos': {
      const tamanhos = {};
      (Array.isArray(d.fotos) ? d.fotos : []).slice(0, 2000).forEach(u => {
        const rel = String(u).replace(/^\/+/, '');
        if (!/^(fotos|fotos-dev)\/[^/]+$/.test(rel)) return;
        tamanhos[u] = ladoMaior(path.join(raiz, rel)) || 9999;
      });
      return { ok: true, tamanhos };
    }
    case 'pastaAtualizacao': { const c = cfgArquivo(); return { ok: true, ...c, previa: pastaDoDia(c.base).pasta, baseExiste: fs.existsSync(c.base) }; }
    case 'pastaAtualizacaoSalvar': {
      const c = cfgArquivo(); const base = String(d.base || '').trim();
      if (d.ativo && !path.isAbsolute(base)) return { ok: false, erro: 'Informe a pasta completa, por exemplo D:\\IKANOO.' };
      if (d.ativo && !fs.existsSync(base)) return { ok: false, erro: 'Essa pasta não existe neste computador: ' + base };
      Object.assign(c, { ativo: !!d.ativo, base: base || c.base }); gravar('pasta-atualizacao', c);
      return { ok: true, ...c, previa: pastaDoDia(c.base).pasta, baseExiste: true };
    }
    case 'abrirPastaAtualizacao': {
      const c = cfgArquivo(); const alvo = c.pasta && fs.existsSync(c.pasta) ? c.pasta : c.base;
      spawn('explorer.exe', [alvo], { detached: true, stdio: 'ignore' }).unref();
      return { ok: true };
    }
    case 'backupAuto': return { ok: true, ...cfgBackupAuto(), pastaExiste: fs.existsSync(cfgBackupAuto().pasta) };
    case 'backupAutoSalvar': {
      const c = cfgBackupAuto();
      const pasta = String(d.pasta || '').trim();
      if (d.ativo && !path.isAbsolute(pasta)) return { ok: false, erro: 'Informe a pasta completa, por exemplo C:\\Users\\Voce\\OneDrive\\Backup Catálogo Aiker.' };
      const anterior = { ...c };
      Object.assign(c, { ativo: !!d.ativo, pasta: pasta || c.pasta });
      gravar('backup-auto', c);
      const fim = c.ativo ? backupAutomatico(true) : c;
      if (fim.erro) { const erro = fim.erro; gravar('backup-auto', anterior); return { ok: false, erro: 'Não consegui gravar nessa pasta (continua a anterior): ' + erro }; }
      return { ok: true, ...fim };
    }
    case 'backup':
      return { ok: true, backup: montarBackup() };
    case 'restaurar': {
      const b = d.backup || {};
      if (b.tipo !== 'backup-catalogo-aiker' || !b.rascunho || !Array.isArray(b.rascunho.produtos)) return { ok: false, erro: 'Este arquivo não é um backup do catálogo.' };
      copiaAutomatica(r, p, 'antes-de-restaurar', quem.nome); // guarda o estado atual antes de trocar
      gravar('rascunho', b.rascunho);
      if (b.publicado && Array.isArray(b.publicado.produtos)) gravar('publicado', b.publicado);
      if (Array.isArray(b.acessos)) gravar('acessos', b.acessos);
      if (b.historico && typeof b.historico === 'object') gravar('historico', b.historico);
      if (Array.isArray(b.admins)) gravar('admins', b.admins);
      if (Array.isArray(b.propostas)) gravar('propostas', b.propostas);
      if (Array.isArray(b.lixeira)) gravar('lixeira', b.lixeira);
      for (const [nome, b64] of Object.entries(b.fotos || {})) {
        const limpo = path.basename(nome).replace(/[^\w.-]+/g, '-');
        if (limpo) fs.writeFileSync(path.join(FOTOS, limpo), Buffer.from(String(b64), 'base64'));
      }
      return { ok: true, produtos: b.rascunho.produtos.length, geradoEm: b.geradoEm || '' };
    }
    case 'trocarSenha': {
      if (!d.novaSenha || String(d.novaSenha).length < 4) return { ok: false, erro: 'A nova senha precisa ter pelo menos 4 caracteres.' };
      if (!quem.principal) {
        const lista = admins(); const a = lista.find(x => x.id === quem.id);
        a.sal = crypto.randomBytes(8).toString('hex'); a.hash = hash(a.sal, String(d.novaSenha));
        gravar('admins', lista);
        return { ok: true };
      }
      gravar('senha', String(d.novaSenha));
      return { ok: true };
    }
    default:
      return { ok: false, erro: 'Ação desconhecida' };
  }
}

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/api') {
    let corpo = '';
    req.on('data', c => { corpo += c; if (corpo.length > 300e6) req.destroy(); });
    req.on('end', async () => {
      let saida;
      try {
        let d = {}; try { d = JSON.parse(corpo || '{}'); } catch (e) { /* api() responde */ }
        // arquivar a atualização (gera PDFs): é demorado, então roda à parte
        if (d.acao === 'arquivarAtualizacao') {
          const quem = autenticar(d);
          saida = !quem ? { ok: false, erro: 'senha' } : !cfgArquivo().ativo ? { ok: false, erro: 'A pasta da atualização está desligada em Configurações.' } : { ok: true, ...(await arquivarAtualizacao(d, quem)) };
        } else saida = api(req, corpo);
      } catch (e) { saida = { ok: false, erro: e.message }; }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(saida));
    });
    return;
  }
  if (p.endsWith('/')) p += 'index.html';
  if (p === '/admin') p = '/admin.html';
  const caminho = path.join(raiz, p);
  if (!caminho.startsWith(raiz) || /[\\/]dados-dev[\\/]/.test(caminho)) { res.writeHead(403).end(); return; }
  fs.readFile(caminho, (err, dados) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado'); return; }
    res.writeHead(200, { 'Content-Type': tipos[path.extname(caminho).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(dados);
  });
}).listen(porta, () => {
  backupAutomatico(false); // ao ligar e depois de hora em hora (só grava uma vez por dia)
  setInterval(() => backupAutomatico(false), 60 * 60 * 1000);
  console.log(`Catálogo: http://localhost:${porta}  ·  Admin: http://localhost:${porta}/admin  (senha de teste: ${SENHA})`);
});
