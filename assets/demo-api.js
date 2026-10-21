// ============================================================
//  MODO DEMONSTRAÇÃO (versão publicada no GitHub / Netlify)
//  Faz o papel do servidor.mjs dentro do navegador: tudo fica salvo
//  só no navegador de quem está testando (localStorage).
//  Admin: senha "demo"  ·  Vendedor: usuário "demo", senha "demo"
// ============================================================
(function () {
  const PREFIXO = 'demo-api';
  const SENHA = 'demo';
  const K = n => 'catalogo-demo-' + n;
  const ler = n => { try { return JSON.parse(localStorage.getItem(K(n)) || 'null'); } catch (e) { return null; } };
  const gravar = (n, v) => {
    try { localStorage.setItem(K(n), JSON.stringify(v)); }
    catch (e) { throw new Error('O espaço da demonstração neste navegador acabou. Use fotos menores ou limpe os dados do site.'); }
  };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  function agora() {
    const d = new Date(); const z = n => String(n).padStart(2, '0');
    return `${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()} às ${z(d.getHours())}:${z(d.getMinutes())}`;
  }

  let semente = null;
  async function carregarSemente() {
    if (semente) return semente;
    if (!window.AIKER_DADOS_LOCAIS) await new Promise(ok => { const s = document.createElement('script'); s.src = 'dados/dados-locais.js'; s.onload = s.onerror = ok; document.head.appendChild(s); });
    semente = JSON.parse(JSON.stringify(window.AIKER_DADOS_LOCAIS || { produtos: [], config: {}, vendedores: [] }));
    return semente;
  }
  function anonimizar(lista, cfg) {
    const lim = Math.max(0, Number((cfg || {}).estoqueAlertaCx ?? 2)) || 0;
    return (lista || []).filter(p => p && p.ativo !== false).map((p, i) => {
      if (p.esgotado) return { codigo: 'ESG-' + (i + 1), categoria: p.categoria, nome: '', preco: null, promo: null, pcs: '', esgotado: true, ativo: true, anonimo: true, specs: [], fotos: [] };
      const { estoque, ...resto } = p;
      const pcs = parseInt(String(p.pcs || '').match(/\d+/) || '0', 10) || 1;
      if (lim && typeof estoque === 'number' && estoque > 0 && estoque <= pcs * lim) resto.poucas = true;
      return resto;
    });
  }
  async function rascunho() {
    let r = ler('rascunho');
    if (!r) { const s = await carregarSemente(); r = { produtos: s.produtos, config: s.config, vendedores: s.vendedores, alteradoEm: '' }; gravar('rascunho', r); }
    return r;
  }
  async function publicado() {
    let p = ler('publicado');
    if (!p) { const s = await carregarSemente(); const { novidadesBase, ...cfg } = s.config || {}; p = { produtos: anonimizar(s.produtos, s.config), config: cfg, vendedores: [], publicadoEm: s.publicadoEm || '' }; gravar('publicado', p); }
    return p;
  }
  const pendente = (r, p) => { const { novidadesBase, ...cfg } = r.config || {}; const pc = { ...(p.config || {}) }; delete pc.novidadesBase; return JSON.stringify([anonimizar(r.produtos, r.config), cfg]) !== JSON.stringify([p.produtos, pc]); };
  const acessos = () => ler('acessos') || [{ id: 'demo', nome: 'Vendedor Demonstração', login: 'demo', senha: 'demo', contato: '(11) 90000-0000', email: 'vendedor@exemplo.com' }];
  const admins = () => ler('admins') || [];
  const publicoVend = v => ({ id: v.id, nome: v.nome, login: v.login, contato: v.contato || '', email: v.email || '' });
  const publicoAdmin = a => ({ id: a.id, nome: a.nome, login: a.login });
  const tokenVendedor = v => btoa(unescape(encodeURIComponent(v.id + ':' + v.senha))).slice(0, 40);
  const chaveDemo = (login, senha) => btoa(unescape(encodeURIComponent(login + '\n' + senha)));
  function autenticar(d) {
    if (d.token) { try { const [login, senha] = decodeURIComponent(escape(atob(d.token))).split('\n'); d = { ...d, usuario: login, senha }; } catch (e) { return null; } }
    const u = String(d.usuario || '').trim().toLowerCase();
    if (u) { const a = admins().find(x => x.login === u); return a && a.senha === String(d.senha || '') ? { nome: a.nome, login: a.login, id: a.id, principal: false } : null; }
    return d.senha === (ler('senha') || SENHA) ? { nome: 'Administrador (demonstração)', login: '', principal: true } : null;
  }
  async function registrarHistorico(produtos, data) {
    let h = ler('historico');
    if (!h) { h = {}; const s = await carregarSemente(); (s.produtos || []).forEach(p => { if (p.codigo && p.preco != null) h[p.codigo] = [{ d: s.publicadoEm || data, p: p.preco, pr: p.promo ?? null }]; }); }
    (produtos || []).forEach(p => {
      if (!p || !p.codigo || p.preco == null) return;
      const l = h[p.codigo] || (h[p.codigo] = []); const u = l[l.length - 1]; const pr = p.promo === '' ? null : (p.promo ?? null);
      if (u && u.p === p.preco && u.pr === pr) return;
      if (u && u.d === data) { u.p = p.preco; u.pr = pr; return; }
      l.push({ d: data, p: p.preco, pr });
    });
    gravar('historico', h);
  }
  // cópias de cada publicação (a demonstração guarda as 10 últimas, para caber no navegador)
  function copiaAutomatica(r, p, motivo, por) {
    const d = new Date(); const z = n => String(n).padStart(2, '0');
    const id = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}-${z(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, '0')}.json`;
    const l = ler('copias') || [];
    l.push({ id, motivo: motivo || 'publicacao', feitaEm: agora(), por: por || '', rascunho: r, publicado: p });
    gravar('copias', l.slice(-10));
  }

  async function api(metodo, url, corpo) {
    if (metodo === 'GET') {
      if (/acao=catalogo/.test(url)) { const p = await publicado(); return { ok: true, ...p }; }
      return { ok: false, erro: 'Ação desconhecida' };
    }
    let d; try { d = JSON.parse(corpo || '{}'); } catch (e) { return { ok: false, erro: 'Dados inválidos' }; }
    if (d.acao === 'vendedorEntrar') {
      const v = acessos().find(x => x.login === String(d.login || '').trim().toLowerCase());
      if (!v || v.senha !== String(d.senhaVendedor || '')) return { ok: false, erro: 'login' };
      return { ok: true, vendedor: { ...publicoVend(v), token: tokenVendedor(v) } };
    }
    if (d.acao === 'registrarProposta') {
      const v = acessos().find(x => x.login === String(d.login || '').trim().toLowerCase());
      if (!v || d.token !== tokenVendedor(v)) return { ok: false, erro: 'token' };
      const pr = d.proposta || {}; if (!pr.id) return { ok: false, erro: 'Proposta sem identificação.' };
      const lista = ler('propostas') || [];
      const item = { id: v.id + ':' + String(pr.id).slice(0, 40), vendedorId: v.id, vendedor: v.nome, login: v.login, numero: String(pr.numero || ''), cliente: String(pr.cliente || ''), cidade: String(pr.cidade || ''), tabela: +pr.tabela || 0, total: +pr.total || 0, itens: (pr.itens || []).slice(0, 300), descPedido: +pr.descPedido || 0, pdf: !!pr.pdf, atualizadaEm: agora(), quando: Date.now() };
      const k = lista.findIndex(x => x.id === item.id);
      if (k >= 0) { item.criadaEm = lista[k].criadaEm; item.pdf = item.pdf || lista[k].pdf; lista[k] = item; } else { item.criadaEm = agora(); lista.unshift(item); }
      gravar('propostas', lista.slice(0, 300));
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
      const a = d.admin || {}; const login = String(a.login || '').trim().toLowerCase();
      if (!a.nome || !login) return { ok: false, erro: 'Preencha nome e usuário.' };
      if (lista.some(x => x.login === login && x.id !== a.id)) return { ok: false, erro: 'Já existe um usuário com esse nome de acesso.' };
      let atual = lista.find(x => x.id === a.id);
      if (!atual) { if (!a.novaSenha) return { ok: false, erro: 'Defina uma senha.' }; atual = { id: uid() }; lista.push(atual); }
      Object.assign(atual, { nome: String(a.nome).trim(), login });
      if (a.novaSenha) { if (String(a.novaSenha).length < 4) return { ok: false, erro: 'A senha precisa ter pelo menos 4 caracteres.' }; atual.senha = String(a.novaSenha); }
      gravar('admins', lista);
      return { ok: true, admins: lista.map(publicoAdmin) };
    }
    if (d.acao === 'vendedores') return { ok: true, vendedores: acessos().map(publicoVend) };
    if (d.acao === 'salvarVendedor') {
      const v = d.vendedor || {}; const lista = acessos(); const login = String(v.login || '').trim().toLowerCase();
      if (!v.nome || !login) return { ok: false, erro: 'Preencha nome e usuário.' };
      if (lista.some(x => x.login === login && x.id !== v.id)) return { ok: false, erro: 'Já existe um vendedor com esse usuário.' };
      let atual = lista.find(x => x.id === v.id);
      if (!atual) { if (!v.novaSenha) return { ok: false, erro: 'Defina uma senha para o vendedor.' }; atual = { id: uid() }; lista.push(atual); }
      Object.assign(atual, { nome: String(v.nome).trim(), login, contato: String(v.contato || '').trim(), email: String(v.email || '').trim() });
      if (v.novaSenha) atual.senha = String(v.novaSenha);
      gravar('acessos', lista);
      return { ok: true, vendedores: lista.map(publicoVend) };
    }
    if (d.acao === 'removerVendedor') { const lista = acessos().filter(x => x.id !== d.id); gravar('acessos', lista); return { ok: true, vendedores: lista.map(publicoVend) }; }
    const r = await rascunho(); const p = await publicado();
    switch (d.acao) {
      case 'entrar': return { ok: true, quem: { nome: quem.nome, login: quem.login, principal: quem.principal }, token: d.token || chaveDemo(quem.login, String(d.senha || '')) };
      case 'rascunho': return { ok: true, ...r, publicadoEm: p.publicadoEm, pendente: pendente(r, p) };
      case 'salvar':
        if (Array.isArray(d.produtos)) r.produtos = d.produtos;
        if (d.config && typeof d.config === 'object') r.config = d.config;
        if (Array.isArray(d.vendedores)) r.vendedores = d.vendedores;
        r.alteradoEm = agora(); gravar('rascunho', r);
        return { ok: true, alteradoEm: r.alteradoEm, pendente: pendente(r, p) };
      case 'enviarFoto': return { ok: true, url: 'data:' + (d.tipo || 'image/jpeg') + ';base64,' + d.base64 };
      case 'publicar': {
        const { novidadesBase, ...cfgPub } = r.config || {};
        const novo = { produtos: anonimizar(r.produtos, r.config), config: cfgPub, vendedores: [], publicadoEm: agora() };
        gravar('publicado', novo);
        await registrarHistorico(r.produtos, novo.publicadoEm.split(' ')[0]);
        copiaAutomatica(r, novo, 'publicacao', quem.nome);
        return { ok: true, publicadoEm: novo.publicadoEm };
      }
      case 'historico': {
        if (!ler('historico')) await registrarHistorico(p.produtos, String(p.publicadoEm || '').split(' ')[0] || agora().split(' ')[0]);
        const h = ler('historico') || {};
        return { ok: true, historico: d.codigo ? (h[d.codigo] || []) : h };
      }
      case 'copias': return { ok: true, copias: (ler('copias') || []).slice().reverse().map(c => ({ id: c.id, por: c.por, motivo: c.motivo, feitaEm: c.feitaEm, publicadoEm: (c.publicado || {}).publicadoEm || '', produtos: ((c.publicado || {}).produtos || []).length, esgotados: ((c.publicado || {}).produtos || []).filter(x => x.esgotado).length, igualAoAtual: JSON.stringify([c.publicado.produtos, c.publicado.config]) === JSON.stringify([p.produtos, p.config]) })) };
      case 'copia': { const c = (ler('copias') || []).find(x => x.id === d.id); return c ? { ok: true, rascunho: c.rascunho, feitaEm: c.feitaEm } : { ok: false, erro: 'Versão não encontrada.' }; }
      case 'voltarCopia': {
        const c = (ler('copias') || []).find(x => x.id === d.id); if (!c) return { ok: false, erro: 'Versão não encontrada.' };
        copiaAutomatica(r, p, 'antes-de-voltar', quem.nome);
        if (c.rascunho) gravar('rascunho', c.rascunho);
        gravar('publicado', { ...c.publicado, publicadoEm: agora() });
        return { ok: true };
      }
      case 'lixeiraAdd': { const l = ler('lixeira') || []; (d.produtos || []).forEach(prod => { if (prod && prod.codigo) l.unshift({ id: uid(), quando: Date.now(), excluidoEm: agora(), por: quem.nome, produto: prod }); }); gravar('lixeira', l.slice(0, 200)); return { ok: true }; }
      case 'lixeira': { const lim = Date.now() - 30 * 864e5; const l = (ler('lixeira') || []).filter(x => x.quando >= lim); gravar('lixeira', l); return { ok: true, itens: l }; }
      case 'lixeiraTirar': { const ids = new Set(d.ids || []); gravar('lixeira', (ler('lixeira') || []).filter(x => !ids.has(x.id))); return { ok: true }; }
      case 'tamanhosFotos': { const t = {}; (d.fotos || []).forEach(u => { t[u] = 9999; }); return { ok: true, tamanhos: t }; }
      case 'backup': return { ok: true, backup: { tipo: 'backup-catalogo-aiker', versao: 1, geradoEm: agora(), rascunho: r, publicado: p, acessos: acessos(), admins: admins(), propostas: ler('propostas') || [], lixeira: ler('lixeira') || [], historico: ler('historico') || {}, fotos: {} } };
      case 'restaurar': {
        const b = d.backup || {};
        if (b.tipo !== 'backup-catalogo-aiker' || !b.rascunho || !Array.isArray(b.rascunho.produtos)) return { ok: false, erro: 'Este arquivo não é um backup do catálogo.' };
        copiaAutomatica(r, p, 'antes-de-restaurar', quem.nome);
        gravar('rascunho', b.rascunho);
        if (b.publicado) gravar('publicado', b.publicado);
        ['acessos', 'admins', 'propostas', 'lixeira', 'historico'].forEach(k => { if (b[k]) gravar(k, b[k]); });
        return { ok: true, produtos: b.rascunho.produtos.length, geradoEm: b.geradoEm || '' };
      }
      case 'trocarSenha':
        if (!d.novaSenha || String(d.novaSenha).length < 4) return { ok: false, erro: 'A nova senha precisa ter pelo menos 4 caracteres.' };
        if (!quem.principal) { const l = admins(); const a = l.find(x => x.id === quem.id); a.senha = String(d.novaSenha); gravar('admins', l); return { ok: true, token: chaveDemo(a.login, a.senha) }; }
        gravar('senha', String(d.novaSenha)); return { ok: true, token: chaveDemo('', String(d.novaSenha)) };
      case 'pastaAtualizacao': return { ok: true, ativo: false, base: 'D:\\IKANOO', arquivos: [], previa: '' };
      case 'pastaAtualizacaoSalvar':
      case 'abrirPastaAtualizacao': return { ok: false, erro: 'Na demonstração não há pasta no computador.' };
      default: return { ok: false, erro: 'Ação desconhecida' };
    }
  }

  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async function (entrada, opcoes) {
    const url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || '';
    if (!url.startsWith(PREFIXO)) return fetchOriginal(entrada, opcoes);
    let saida;
    try { saida = await api((opcoes && opcoes.method) || 'GET', url, opcoes && opcoes.body); }
    catch (e) { saida = { ok: false, erro: e.message }; }
    return new Response(JSON.stringify(saida), { headers: { 'Content-Type': 'application/json' } });
  };
  window.AIKER_DEMO = true;
})();
