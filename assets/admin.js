(function () {
  const A = window.Aiker;
  const { esc, norm, slug, parsePreco, fotoUrl, miniUrl } = A;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const API = (window.AIKER_CONFIG || {}).api;
  const MAX_FOTOS = 8;
  const MAX_SPECS = 20;
  // bibliotecas guardadas no próprio projeto (assets/vendor): tudo funciona sem internet
  const VENDOR = new URL('assets/vendor/', location.href).href;
  const XLSX_URL = VENDOR + 'xlsx.full.min.js'; // SheetJS 0.18.5
  const OCR_URL = VENDOR + 'ocr/tesseract.min.js'; // tesseract.js 5.1.1

  const E = {
    senha: '', produtos: [], config: {}, vendedores: [], publicadoEm: '', alteradoEm: '', pendente: false,
    mudou: new Set(), // códigos alterados desde a última publicação (destaque amarelo)
  };

  // ================= utilidades =================
  const guarda = {
    ler(k, area = localStorage) { try { return area.getItem(k); } catch (e) { return null; } },
    gravar(k, v, area = localStorage) { try { v == null ? area.removeItem(k) : area.setItem(k, v); } catch (e) { /* ignora */ } },
  };
  const fmt = n => (n == null || n === '' || isNaN(n) ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const brl = A.brl;
  // o aviso fica guardado aqui: se ele estiver dentro de uma janela que é redesenhada, é só colocá-lo de volta
  const toastEl = document.getElementById('toast');
  function toast(t, erro) {
    const el = toastEl;
    (document.querySelector('dialog[open]') || document.body).appendChild(el);
    el.textContent = t;
    el.className = 'toast on' + (erro ? ' erro' : '');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.className = 'toast'; }, erro ? 4200 : 2400);
  }
  // carrega cada biblioteca uma vez só (mesmo com dois cliques rápidos ou endereço escrito de outro jeito)
  const scripts = {};
  function carregarScript(url) {
    const abs = new URL(url, location.href).href;
    if (scripts[abs]) return scripts[abs];
    if ([...document.scripts].some(s => s.src === abs)) return (scripts[abs] = Promise.resolve());
    return (scripts[abs] = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = abs; s.onload = ok;
      s.onerror = () => { delete scripts[abs]; s.remove(); falha(new Error('Não foi possível carregar ' + abs.split('/').pop() + '. Feche e abra o painel de novo.')); };
      document.head.appendChild(s);
    }));
  }
  async function copiar(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (er) { /* */ } ta.remove(); return ok;
    }
  }
  const urlCatalogo = () => new URL('./', location.href).href;

  // ================= API =================
  async function api(acao, dados = {}) {
    if (!API) throw new Error('O endereço do servidor (API) não está configurado no arquivo config.js.');
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ acao, usuario: E.usuario || '', ...(E.token ? { token: E.token } : { senha: E.senha }), ...dados }) });
    let j;
    try { j = await r.json(); } catch (e) { throw new Error('O servidor não respondeu corretamente.'); }
    if (!j.ok) {
      if (j.erro === 'senha') { sair(true); throw new Error('Senha incorreta.'); }
      throw new Error(j.erro || 'Erro no servidor.');
    }
    return j;
  }

  // ================= login =================
  $('#formLogin').addEventListener('submit', async e => {
    e.preventDefault();
    E.senha = $('#senha').value;
    E.usuario = $('#usuario').value.trim().toLowerCase();
    $('#btnEntrar').disabled = true;
    $('#erroLogin').textContent = '';
    try {
      E.token = '';
      const r = await api('entrar');
      E.lembrar = $('#lembrar').checked;
      guardarChave(r.token);
      guarda.gravar('aiker-admin-usuario', E.lembrar ? E.usuario : null);
      guarda.gravar('aiker-admin-usuario', E.usuario, sessionStorage);
      await iniciar();
    } catch (err) {
      $('#erroLogin').textContent = err.message === 'Senha incorreta.' ? 'Senha incorreta. Tente de novo.' : err.message;
    } finally { $('#btnEntrar').disabled = false; }
  });

  // o navegador guarda só a chave de acesso (nunca a senha); trocar a senha invalida as chaves antigas
  function guardarChave(t) {
    E.token = t || ''; E.senha = '';
    guarda.gravar('aiker-admin', null); guarda.gravar('aiker-admin', null, sessionStorage); // senha guardada pela versão antiga
    guarda.gravar('aiker-admin-chave', E.lembrar ? E.token : null);
    guarda.gravar('aiker-admin-chave', E.token, sessionStorage);
  }
  function sair(porErro) {
    E.token = '';
    guarda.gravar('aiker-admin-chave', null);
    guarda.gravar('aiker-admin-chave', null, sessionStorage);
    guarda.gravar('aiker-admin', null);
    guarda.gravar('aiker-admin', null, sessionStorage);
    guarda.gravar('aiker-admin-usuario', null);
    guarda.gravar('aiker-admin-usuario', null, sessionStorage);
    E.senha = ''; E.usuario = '';
    $('#app').hidden = true;
    $('#telaLogin').hidden = false;
    if (porErro) $('#erroLogin').textContent = 'Sua sessão expirou. Entre novamente.';
  }
  $('#btnSair').addEventListener('click', () => sair());

  (async function auto() {
    E.token = guarda.ler('aiker-admin-chave', sessionStorage) || guarda.ler('aiker-admin-chave') || '';
    E.lembrar = !!guarda.ler('aiker-admin-chave') || !!guarda.ler('aiker-admin');
    const antiga = guarda.ler('aiker-admin', sessionStorage) || guarda.ler('aiker-admin'); // versão antiga guardava a senha
    if (!E.token && !antiga) return;
    if (!E.token) E.senha = antiga;
    E.usuario = guarda.ler('aiker-admin-usuario', sessionStorage) || guarda.ler('aiker-admin-usuario') || '';
    try { await iniciar(); } catch (e) { sair(); }
  })();

  // ================= gerar PDF: tabela completa ou só as novidades =================
  // a "base" é a foto da tabela da última vez que as novidades foram zeradas (preço, promoção, esgotado)
  const un = p => (p.promo != null && p.promo !== '' && p.preco != null && +p.promo < +p.preco ? +p.promo : (p.preco == null || p.preco === '' ? null : +p.preco));
  function fotografar(lista) {
    const itens = {};
    (lista || []).forEach(p => { if (p && p.codigo) itens[norm(p.codigo)] = [un(p), p.esgotado ? 1 : 0]; });
    return { data: new Date().toLocaleDateString('pt-BR'), itens };
  }
  async function baseNovidades() {
    if (E.config.novidadesBase && E.config.novidadesBase.itens) return E.config.novidadesBase;
    // primeira vez: compara com a tabela original (14/10)
    if (!window.AIKER_DADOS_LOCAIS) await new Promise(ok => { const s = document.createElement('script'); s.src = 'dados/dados-locais.js?_=' + Date.now(); s.onload = s.onerror = ok; document.head.appendChild(s); });
    const b = fotografar((window.AIKER_DADOS_LOCAIS || {}).produtos || []);
    b.data = '14/10/2026';
    E.config.novidadesBase = b;
    alterado([]);
    return b;
  }
  function calcularNovidades(base) {
    const r = [];
    E.produtos.forEach(p => {
      if (!p.codigo || p.ativo === false || p.esgotado) return; // esgotados nunca entram (proteção)
      const a = base.itens[norm(p.codigo)];
      const agora = un(p);
      let nov = null;
      if (!a) nov = { tipo: 'novo', txt: 'Novo' };
      else if (a[1] && !p.esgotado) nov = { tipo: 'voltou', txt: 'Voltou ao estoque' };
      else if (a[0] != null && agora != null && agora < a[0]) nov = { tipo: 'baixou', txt: 'Preço baixou', de: a[0] };
      else if ((a[0] ?? -1) !== (agora ?? -1)) nov = { tipo: 'preco', txt: 'Preço atualizado' };
      if (nov) r.push(Object.assign({}, p, { novidade: nov }));
    });
    return r;
  }
  function abrirTabela(produtos, extra) {
    try {
      localStorage.setItem('aiker-previa', JSON.stringify({ produtos, config: Object.assign({}, E.config, { novidadesBase: null, atualizadoEm: new Date().toLocaleString('pt-BR') }, extra || {}), vendedores: [] }));
    } catch (e) { toast('Não foi possível preparar o PDF neste navegador', true); return; }
    window.open('tabela.html?previa=1', '_blank', 'noopener');
  }
  $('#btnPdf').addEventListener('click', async () => {
    const m = modal('<h2>Gerar PDF</h2><p class="carregando-txt">Comparando com a tabela anterior…</p>');
    const base = await baseNovidades();
    const nov = calcularNovidades(base);
    const conta = t => nov.filter(x => x.novidade.tipo === t).length;
    const partes = [['baixou', 'preço baixou'], ['preco', 'preço atualizado'], ['voltou', 'voltaram ao estoque'], ['novo', 'novos']].filter(([t]) => conta(t)).map(([t, n]) => `${conta(t)} ${n}`);
    m.innerHTML = `<h2>Gerar PDF</h2>
      <p>Usa as alterações atuais do painel, mesmo antes de publicar.</p>
      <div class="pdf-ajustes">
        <label class="campo">Desconto em todos os produtos (%)<input id="pdfDesc" inputmode="decimal" placeholder="Ex.: 10 · vazio = sem desconto"></label>
        <label class="troca"><input type="checkbox" id="pdfPreco" checked><span class="trilho"></span> Mostrar preços</label>
      </div>
      <p class="dica" style="margin-top:-4px">Valem só para este PDF: o desconto aparece com o preço antigo riscado; sem preços, sai "Consulte seu vendedor". O catálogo não muda.</p>
      <div class="pdf-opcoes">
        <button type="button" class="pdf-op" data-t="completa"><b>Tabela completa</b><span>Todos os produtos, com capa e índice de categorias.</span></button>
        <button type="button" class="pdf-op" data-t="novidades" ${nov.length ? '' : 'disabled'}><b>Tabela de novidades · ${nov.length} produto${nov.length === 1 ? '' : 's'}</b>
          <span>${nov.length ? 'Desde ' + esc(base.data) + ': ' + partes.join(' · ') + '.' : 'Nenhuma mudança de preço ou estoque desde ' + esc(base.data) + '.'}</span></button>
      </div>
      <p class="dica">Depois de enviar a tabela de novidades aos vendedores, clique em <b>Zerar novidades</b>. A próxima tabela de novidades vai mostrar só o que mudar a partir de agora. Produtos esgotados não entram.</p>
      <div class="acoes"><button class="btn btn-claro" type="button" data-z>Zerar novidades</button>${nov.length ? '<button class="btn btn-claro" type="button" data-msg>Copiar mensagem para o grupo</button>' : ''}<button class="btn btn-claro" type="button" data-n>Fechar</button></div>`;
    if (nov.length) $('[data-msg]', m).onclick = async () => toast(await copiar(mensagemNovidades(nov, base.data)) ? 'Mensagem copiada: cole no grupo dos vendedores' : 'Não foi possível copiar', false);
    $('[data-n]', m).onclick = () => m.close();
    // opções só deste PDF: desconto geral e com/sem preço
    const ajustes = () => {
      const d = parsePreco($('#pdfDesc', m).value);
      if (d != null && (d < 0 || d >= 100)) { toast('O desconto precisa ficar entre 1 e 99%.', true); return null; }
      return { descontoGeral: d || 0, semPreco: !$('#pdfPreco', m).checked };
    };
    $('#pdfPreco', m).addEventListener('change', e => { $('#pdfDesc', m).disabled = !e.target.checked; });
    $('[data-t="completa"]', m).onclick = () => { const a = ajustes(); if (!a) return; m.close(); abrirTabela(E.produtos, a); };
    $('[data-t="novidades"]', m).onclick = () => { const a = ajustes(); if (!a) return; m.close(); abrirTabela(nov, { modoNovidades: true, novidadesDesde: base.data, ...a }); };
    $('[data-z]', m).onclick = () => {
      if (!confirm('Zerar as novidades? A próxima tabela de novidades vai comparar com a tabela de hoje.')) return;
      E.config.novidadesBase = fotografar(E.produtos);
      alterado([]);
      m.close();
      toast('Novidades zeradas: a partir de agora, só o que mudar entra na tabela de novidades');
    };
  });

  async function iniciar() {
    const ent = await api('entrar');
    E.quem = ent.quem || null;
    if (ent.token) guardarChave(ent.token);
    if (ent.senhaPadrao) setTimeout(exigirNovaSenha, 400);
    const d = await api('rascunho');
    E.produtos = d.produtos || [];
    E.config = d.config || {};
    E.vendedores = d.vendedores || [];
    E.publicadoEm = d.publicadoEm || '';
    E.alteradoEm = d.alteradoEm || '';
    E.pendente = !!d.pendente;
    try { E.mudou = new Set(JSON.parse(guarda.ler('aiker-mudou') || '[]')); } catch (e) { E.mudou = new Set(); }
    if (!E.pendente) { E.mudou.clear(); guarda.gravar('aiker-mudou', '[]'); } // nada pendente: ninguém está "alterado"
    $('#telaLogin').hidden = true;
    $('#app').hidden = false;
    preencherFiltros();
    desenharProdutos();
    desenharLink();
    desenharCategorias();
    preencherConfig();
    mostrarStatus();
    desenharInicio();
    $('#quemSou').textContent = E.quem ? 'Você entrou como ' + E.quem.nome + (E.quem.login ? ' (usuário ' + E.quem.login + ')' : '') + '.' : '';
    carregarUsuariosPainel();
    mostrarQuem();
    contarLixeira();
    carregarBackupAuto().then(desenharInicio);
    carregarPastaAtu();
    requestAnimationFrame(() => moverIndicador(true));
    if (!$('#aba-inicio').hidden) contarNumeros();
    if (!E.produtos.length) oferecerCatalogoInicial();
  }

  // primeira vez: carrega os produtos extraídos da tabela em PDF
  function oferecerCatalogoInicial() {
    confirmar('Bem-vindo ao painel', 'O catálogo ainda está vazio. Quer carregar os <b>133 produtos</b> da tabela de 14/10 (com fotos, preços e esgotados)? Depois é só conferir e publicar.', 'Carregar produtos', async () => {
      try {
        await carregarScript('dados/dados-locais.js');
        const d = window.AIKER_DADOS_LOCAIS || {};
        E.produtos = JSON.parse(JSON.stringify(d.produtos || []));
        const cfg = { ...(d.config || {}) };
        Object.keys(E.config).forEach(k => { if (E.config[k]) cfg[k] = E.config[k]; });
        E.config = cfg;
        preencherFiltros();
        desenharProdutos();
        preencherConfig();
        alterado([]);
        toast(`${E.produtos.length} produtos carregados`);
      } catch (e) { toast(e.message, true); }
    }, false);
  }

  // ================= salvar (automático) =================
  let tSalvar, salvando = false, deNovo = false;
  function alterado(codigos) {
    (codigos || []).forEach(c => E.mudou.add(c));
    guarda.gravar('aiker-mudou', JSON.stringify([...E.mudou]));
    E.pendente = true;
    mostrarStatus('salvando');
    clearTimeout(tSalvar);
    tSalvar = setTimeout(salvar, 700);
  }
  async function salvar() {
    if (salvando) { deNovo = true; return; }
    salvando = true;
    try {
      const r = await api('salvar', { produtos: E.produtos, config: E.config, vendedores: E.vendedores });
      E.alteradoEm = r.alteradoEm;
      E.pendente = r.pendente !== false;
      mostrarStatus();
    } catch (e) {
      mostrarStatus('erro', e.message);
    } finally {
      salvando = false;
      if (deNovo) { deNovo = false; salvar(); }
    }
  }
  window.addEventListener('beforeunload', e => { if (salvando || tSalvar && $('#status').classList.contains('salvando')) { e.preventDefault(); e.returnValue = ''; } });

  function mostrarStatus(modo, msg) {
    if (modo !== 'salvando' && E.produtos && !$('#aba-inicio').hidden) setTimeout(desenharInicio);
    const s = $('#status');
    s.className = 'status ' + (modo || 'ok');
    let t;
    if (modo === 'salvando') t = 'Salvando…';
    else if (modo === 'erro') t = 'Não foi possível salvar: ' + msg;
    else t = E.pendente ? 'Alterações salvas · ainda não publicadas' : (E.publicadoEm ? 'Tudo publicado · ' + E.publicadoEm : 'Tudo salvo');
    $('span', s).textContent = t;
    const n = E.mudou.size;
    $('#pend').hidden = !E.pendente;
    $('#pend').textContent = n || '•';
  }

  // ================= início: resumo e atalhos =================
  function irPara(aba) { $(`[data-aba="${aba}"]`).click(); }
  function desenharInicio() {
    const el = $('#inicio');
    if (!el || !E.produtos) return;
    const P = E.produtos;
    const conta = k => P.filter((SITUACOES.find(s => s[0] === k) || [0, 0, () => false])[2]).length;
    const visiveis = P.filter(p => p.ativo !== false && !p.esgotado).length;
    const pend = E.mudou.size;
    const ultBackup = guarda.ler('aiker-ultimo-backup');
    const autoEmDia = E.backupAuto && E.backupAuto.ativo && E.backupAuto.ultimo && !E.backupAuto.erro;
    const diasBackup = autoEmDia ? 0 : (() => {
      if (!ultBackup) return Infinity;
      const m = ultBackup.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      return m ? (Date.now() - new Date(+m[3], +m[2] - 1, +m[1])) / 864e5 : Infinity;
    })();
    const tiles = [
      ['disp', 'Disponíveis', visiveis, ''],
      ['esg', 'Esgotados', conta('esg'), ''],
      ['promo', 'Em promoção', conta('promo'), ''],
      ['dest', 'Destaques', conta('dest'), ''],
      ['semfoto', 'Sem foto', conta('semfoto'), conta('semfoto') ? 'atencao' : ''],
      ['sempreco', 'Sem preço', conta('sempreco'), conta('sempreco') ? 'atencao' : ''],
      ['oculto', 'Ocultos', conta('oculto'), ''],
      ['poucas', 'Últimas unidades', conta('poucas'), conta('poucas') ? 'atencao' : ''],
    ];
    const mudados = P.filter(p => E.mudou.has(p.codigo)).slice(0, 8);
    medirFotos();
    const pendencias = PENDENCIAS.map(([k, rot, dica]) => ({ k, rot, dica, n: conta(k) })).filter(x => x.n);
    const s = n => (n === 1 ? '' : 's');
    const cats = new Set(P.filter(p => p.ativo !== false).map(p => p.categoria)).size;
    const quando = E.publicadoEm ? E.publicadoEm.replace(' às ', ', às ') : '';
    const h = new Date().getHours(), primeiro = E.quem && !E.quem.principal ? ' ' + String(E.quem.nome).split(' ')[0] : '';
    $('#iniTitulo').textContent = (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + primeiro;
    const capas = [E.config.promoAtiva && E.config.pdfPromo !== false ? (E.config.capaPromoPdf || 'img/capa-promo.webp') : '', E.config.capaPdf || 'img/capa.webp'].filter(Boolean);
    el.innerHTML = `
      <div class="ini-hero">
        <div class="ini-capas c${capas.length}">${capas.map(c => `<img src="${esc(fotoUrl(c))}" alt="" loading="lazy">`).join('')}</div>
        <div class="ini-hero-txt">
          <h2>${!E.publicadoEm ? 'O catálogo ainda não foi publicado' : E.pendente ? (pend ? `${pend} produto${s(pend)} esperando publicação` : 'Há alterações esperando publicação') : 'Tudo publicado'}</h2>
          <p>${E.publicadoEm ? `No ar desde ${esc(quando)}: os clientes veem ${visiveis} produtos disponíveis em ${cats} categorias.` : 'Confira os produtos e clique em Publicar.'}${E.pendente ? ' As mudanças só aparecem para o cliente depois de publicar.' : ''}</p>
        </div>
        <div class="ini-hero-acoes">
          ${E.pendente ? '<button class="btn btn-laranja" type="button" data-ini="publicar">Revisar e publicar</button>' : ''}
          <button class="btn btn-claro" type="button" data-ini="pdf">Gerar PDF</button>
        </div>
      </div>
      ${diasBackup > 7 ? `<div class="ini-aviso"><div><b>${ultBackup ? 'Faz mais de uma semana desde o último backup' : 'Você ainda não baixou nenhum backup'}</b><small>O catálogo fica só neste computador. Guarde uma cópia num pendrive ou no Google Drive.</small></div><button class="btn btn-claro" type="button" data-ini="backup">Baixar backup agora</button></div>` : ''}
      <div class="ini-tiles">${tiles.map(([k, rot, n, cl]) => `<button type="button" class="ini-tile ${cl}" data-sit-ini="${k}"><span>${rot}</span><b>${n}</b></button>`).join('')}</div>
      <div class="ini-dupla">
        <div class="cartao ini-mudancas">
          <h2>O que mudou desde a última publicação</h2>
          <div id="iniMudancas"><p class="dica">Comparando com a versão publicada…</p></div>
        </div>
        <div class="cartao ini-pend">
          <h2>Precisa de atenção <span class="ini-pend-n">${pendencias.length ? pendencias.reduce((s, x) => s + x.n, 0) : ''}</span></h2>
          ${pendencias.length
            ? `<ul class="pend-lista">${pendencias.map(x => `<li><button type="button" data-sit-ini="${x.k}"><span><b>${x.rot}</b><small>${x.dica}</small></span><em>${x.n}</em></button></li>`).join('')}</ul>`
            : '<p class="dica">Nada pendente. Os produtos estão completos.</p>'}
        </div>
      </div>
      <div class="ini-atalhos-faixa" aria-label="Atalhos">
        <button type="button" data-ini="precos"><b>Atualizar preços</b><small>Print ou texto</small></button>
        <button type="button" data-ini="lote"><b>Fotos em lote</b><small>Nome = código</small></button>
        <button type="button" data-ini="novo"><b>Novo produto</b><small>Cadastrar</small></button>
        <button type="button" data-ini="resumo"><b>Resumo para o chefe</b><small>O que mudou, em PDF</small></button>
        <button type="button" data-ini="buscar"><b>Buscar</b><small>Ctrl K</small></button>
      </div>`;
    desenharMudancas(mudados);
  }
  // lista do que mudou, comparando com a última publicação (preço antigo → novo, esgotou, voltou…)
  async function desenharMudancas() {
    const alvo = () => $('#iniMudancas');
    const base = await baseUltimaPublicacao();
    if (!alvo()) return;
    if (!base) { alvo().innerHTML = '<p class="dica">Não consegui ler a versão publicada agora.</p>'; return; }
    const d = compararVersoes(base, E.produtos);
    const itens = [
      ...d.precos.map(x => ({ p: x.p, t: `Preço <span class="mud-v ${x.para != null && x.de != null && x.para < x.de ? 'desce' : 'sobe'}">${x.de == null ? '—' : brl(x.de)} → ${x.para == null ? '—' : brl(x.para)}</span>` })),
      ...d.esgotaram.map(p => ({ p, t: 'Vai aparecer como <b>esgotado</b>' })),
      ...d.voltaram.map(p => ({ p, t: '<b>Volta ao estoque</b>' })),
      ...d.novos.map(p => ({ p, t: '<b>Produto novo</b>' })),
      ...d.removidos.map(p => ({ p, t: '<b>Sai do catálogo</b>', fora: true })),
      ...d.outros.map(p => ({ p, t: 'Nome, fotos ou especificações' })),
    ];
    if (!itens.length) { alvo().innerHTML = E.pendente ? '<p class="dica">Nenhum preço ou produto mudou; o que falta publicar é a ordem dos produtos ou configurações (capas, textos, promoção).</p>' : '<p class="dica">Nenhuma mudança. O que está no painel é o que o cliente vê.</p>'; return; }
    const MAX = 7;
    alvo().innerHTML = `<ul class="mud-lista">${itens.slice(0, MAX).map(x => { const i = E.produtos.indexOf(x.p); const f = (x.p.fotos || [])[0]; return `<li><button type="button" ${i >= 0 ? `data-editar-ini="${i}"` : 'disabled'}><span class="mini">${f ? `<img src="${esc(miniUrl(f))}" alt="" loading="lazy">` : ''}</span><span class="mud-txt"><b>${esc(x.p.codigo)}</b> ${esc(A.bonito(x.p.nome))}<small>${x.t}</small></span></button></li>`; }).join('')}</ul>${itens.length > MAX ? `<button type="button" class="btn-texto" data-sit-ini="alterados">Ver todas as ${itens.length} mudanças</button>` : ''}`;
  }
  $('#inicio').addEventListener('click', e => {
    const t = e.target.closest('[data-sit-ini]');
    if (t) { irPara('produtos'); situacao = t.dataset.sitIni; $('#fBusca').value = ''; $('#fCat').value = ''; desenharProdutos(); return; }
    const ed = e.target.closest('[data-editar-ini]');
    if (ed) { abrirEditor(+ed.dataset.editarIni); return; }
    const b = e.target.closest('[data-ini]');
    if (!b) return;
    const acao = b.dataset.ini;
    if (acao === 'publicar') $('#btnPublicar').click();
    if (acao === 'backup') { irPara('config'); $('#btnBackup').click(); }
    if (acao === 'precos') irPara('precos');
    if (acao === 'pdf') $('#btnPdf').click();
    if (acao === 'lote') { irPara('produtos'); $('#arqLote').click(); }
    if (acao === 'novo') { irPara('produtos'); abrirEditor(-1); }
    if (acao === 'resumo') abrirResumo();
    if (acao === 'buscar') abrirPaleta();
  });

  // ================= atividade dos vendedores (propostas salvas / geradas em PDF) =================
  let atividade = [];
  async function carregarAtividade() {
    try { atividade = (await api('atividade')).propostas || []; } catch (e) { atividade = []; }
    desenharAtividade();
  }
  function desenharAtividade() {
    const el = $('#atividade');
    if (!el) return;
    const dias = +$('#atvPeriodo').value;
    const desde = dias ? Date.now() - dias * 864e5 : 0;
    const l = atividade.filter(x => (x.quando || 0) >= desde);
    if (!l.length) {
      el.innerHTML = `<p class="dica">${atividade.length ? 'Nenhuma proposta neste período.' : 'Ainda não há propostas registradas. Elas aparecem aqui quando um vendedor salva ou gera uma proposta em PDF.'}</p>`;
      return;
    }
    const pct = (a, b) => (b > 0 ? Math.round((1 - a / b) * 1000) / 10 : 0);
    // por vendedor
    const porV = new Map();
    l.forEach(x => {
      const v = porV.get(x.vendedorId) || { nome: x.vendedor, n: 0, pdf: 0, total: 0, tabela: 0, ultima: 0, clientes: new Set() };
      v.n++; if (x.pdf) v.pdf++; v.total += x.total; v.tabela += x.tabela; v.ultima = Math.max(v.ultima, x.quando || 0);
      if (x.cliente) v.clientes.add(norm(x.cliente));
      porV.set(x.vendedorId, v);
    });
    // produtos mais pedidos
    const porP = new Map();
    l.forEach(x => (x.itens || []).forEach(i => {
      const k = norm(i.codigo); const p = porP.get(k) || { codigo: i.codigo, propostas: 0, unidades: 0 };
      p.propostas++; p.unidades += i.unidades || 0; porP.set(k, p);
    }));
    const topo = [...porP.values()].sort((a, b) => b.propostas - a.propostas || b.unidades - a.unidades).slice(0, 10);
    const nomeDe = c => { const p = E.produtos.find(x => norm(x.codigo) === norm(c)); return p ? A.bonito(p.nome) : ''; };
    const data = t => (t ? new Date(t).toLocaleDateString('pt-BR') : '—');
    const totalGeral = l.reduce((s, x) => s + x.total, 0);
    el.innerHTML = `
      <div class="atv-resumo">
        <div><span>Propostas</span><b>${l.length}</b></div>
        <div><span>Em PDF (enviadas)</span><b>${l.filter(x => x.pdf).length}</b></div>
        <div><span>Valor total</span><b>${brl(totalGeral)}</b></div>
        <div><span>Desconto médio</span><b>${String(pct(totalGeral, l.reduce((s, x) => s + x.tabela, 0))).replace('.', ',')}%</b></div>
      </div>
      <div class="rolagem"><table class="atv-tab"><thead><tr><th>Vendedor</th><th class="n">Propostas</th><th class="n">Em PDF</th><th class="n">Clientes</th><th class="n">Valor total</th><th class="n">Desc. médio</th><th class="n">Última</th></tr></thead>
        <tbody>${[...porV.values()].sort((a, b) => b.total - a.total).map(v => `<tr><td><b>${esc(v.nome)}</b></td><td class="n">${v.n}</td><td class="n">${v.pdf}</td><td class="n">${v.clientes.size}</td><td class="n">${brl(v.total)}</td><td class="n">${String(pct(v.total, v.tabela)).replace('.', ',')}%</td><td class="n">${data(v.ultima)}</td></tr>`).join('')}</tbody></table></div>
      <div class="atv-grade">
        <div><h3>Produtos que mais aparecem nas propostas</h3>
          <ol class="atv-top">${topo.map(p => `<li><b>${esc(p.codigo)}</b> <span>${esc(nomeDe(p.codigo))}</span><small>${p.propostas} proposta${p.propostas === 1 ? '' : 's'} · ${p.unidades.toLocaleString('pt-BR')} un.</small></li>`).join('')}</ol></div>
        <div><h3>Últimas propostas</h3>
          <ul class="atv-ult">${l.slice(0, 12).map(x => `<li><button type="button" data-prop="${esc(x.id)}"><span><b>${esc(x.cliente || 'Sem cliente')}</b><small>${esc(x.vendedor)} · ${esc(x.atualizadaEm || '')}${x.pdf ? ' · PDF' : ''}</small></span><b>${brl(x.total)}</b></button></li>`).join('')}</ul></div>
      </div>`;
  }
  $('#atvPeriodo').addEventListener('change', desenharAtividade);
  $('#atividade').addEventListener('click', e => {
    const b = e.target.closest('[data-prop]');
    if (!b) return;
    const x = atividade.find(y => y.id === b.dataset.prop);
    if (!x) return;
    const m = modal(`<h2>Proposta ${esc(x.numero || '')}</h2>
      <p><b>${esc(x.cliente || 'Sem cliente')}</b>${x.cidade ? ' · ' + esc(x.cidade) : ''}<br><small class="dica">Vendedor: ${esc(x.vendedor)} · criada em ${esc(x.criadaEm || '')} · atualizada em ${esc(x.atualizadaEm || '')}${x.pdf ? ' · gerada em PDF' : ''}</small></p>
      <div class="ajuste-previa"><table><thead><tr><th>Produto</th><th class="n">Qtd.</th><th class="n">Desc.</th></tr></thead><tbody>
        ${(x.itens || []).map(i => `<tr><td><b>${esc(i.codigo)}</b> ${esc((() => { const p = E.produtos.find(y => norm(y.codigo) === norm(i.codigo)); return p ? A.bonito(p.nome) : ''; })())}</td><td class="n">${i.qtd} ${i.modo === 'un' ? 'un.' : 'cx'}</td><td class="n">${i.desc ? String(i.desc).replace('.', ',') + '%' : '—'}</td></tr>`).join('')}
      </tbody></table></div>
      <p>Valor de tabela ${brl(x.tabela)} · desconto no pedido ${String(x.descPedido || 0).replace('.', ',')}% · <b>total ${brl(x.total)}</b></p>
      <div class="acoes"><button class="btn btn-claro" type="button" data-n>Fechar</button></div>`);
    $('[data-n]', m).onclick = () => m.close();
  });

  // ================= usuários do painel (além do administrador principal) =================
  let usuariosPainel = [];
  async function carregarUsuariosPainel() {
    const card = $('#cartaoUsuarios');
    if (!E.quem || !E.quem.principal) { card.hidden = true; return; }
    card.hidden = false;
    try { usuariosPainel = (await api('admins')).admins || []; } catch (e) { usuariosPainel = []; }
    $('#listaUsuarios').innerHTML = usuariosPainel.length
      ? usuariosPainel.map(a => `<li><span><b>${esc(a.nome)}</b><small>usuário: ${esc(a.login)}</small></span><span class="linha-btns"><button class="btn btn-claro btn-p" type="button" data-u-senha="${esc(a.id)}">Nova senha</button><button class="btn-texto perigo" type="button" data-u-rem="${esc(a.id)}">Remover</button></span></li>`).join('')
      : '<li class="dica">Só você usa o painel por enquanto.</li>';
  }
  $('#btnNovoUsuario').addEventListener('click', () => {
    const m = modal(`<h2>Novo usuário do painel</h2><p class="dica" style="margin-top:0">A pessoa entra com o usuário e a senha abaixo e pode fazer tudo no painel, menos cuidar dos usuários.</p>
      <label class="campo">Nome<input id="uNome" placeholder="Ex.: Maria"></label>
      <label class="campo">Usuário (para entrar)<input id="uLogin" placeholder="Ex.: maria" autocapitalize="off"></label>
      <label class="campo">Senha<input id="uSenha" type="text" autocomplete="off"></label>
      <p class="erro" id="uErro"></p>
      <div class="acoes"><button class="btn btn-claro" type="button" data-n>Cancelar</button><button class="btn btn-escuro" type="button" data-s>Criar usuário</button></div>`);
    $('#uNome', m).focus();
    $('[data-n]', m).onclick = () => m.close();
    $('[data-s]', m).onclick = async () => {
      try {
        await api('salvarAdmin', { admin: { nome: $('#uNome', m).value, login: $('#uLogin', m).value, novaSenha: $('#uSenha', m).value } });
        m.close(); toast('Usuário criado'); carregarUsuariosPainel();
      } catch (e) { $('#uErro', m).textContent = e.message; }
    };
  });
  $('#listaUsuarios').addEventListener('click', async e => {
    const s = e.target.closest('[data-u-senha]'), rm = e.target.closest('[data-u-rem]');
    const a = usuariosPainel.find(x => x.id === (s || rm || {}).dataset?.[s ? 'uSenha' : 'uRem']);
    if (!a) return;
    if (rm) {
      if (!confirm(`Remover o acesso de ${a.nome}?`)) return;
      try { await api('removerAdmin', { id: a.id }); toast('Acesso removido'); carregarUsuariosPainel(); } catch (err) { toast(err.message, true); }
      return;
    }
    const nova = prompt(`Nova senha para ${a.nome} (mínimo 4 caracteres):`);
    if (!nova) return;
    try { await api('salvarAdmin', { admin: { ...a, novaSenha: nova } }); toast('Senha trocada'); } catch (err) { toast(err.message, true); }
  });

  // ================= configurações: índice que acompanha a rolagem =================
  (function () {
    const links = $$('#cfgNav a');
    const marcar = id => links.forEach(a => {
      const on = a.getAttribute('href') === '#' + id;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
    $('#cfgNav').addEventListener('click', e => {
      const a = e.target.closest('a');
      if (!a) return;
      e.preventDefault();
      const alvo = $(a.getAttribute('href'));
      const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches;
      // desconta as barras fixas do topo (no celular, a barra e o menu ficam presos em cima)
      const fixo = ['.barra-topo', '.menu'].map(s => $(s)).filter(el => el && getComputedStyle(el).position === 'sticky' && el.offsetWidth > el.offsetHeight).reduce((t, el) => t + el.offsetHeight, 0);
      scrollTo({ top: alvo.getBoundingClientRect().top + scrollY - fixo - 16, behavior: reduzir ? 'auto' : 'smooth' });
      marcar(alvo.id);
    });
    // a seção ativa é a última cujo topo já passou da barra do topo
    let pend = false;
    addEventListener('scroll', () => {
      if (pend || $('#aba-config').hidden) return;
      pend = true;
      requestAnimationFrame(() => {
        pend = false;
        const grupos = $$('.cfg-grupo');
        const fim = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
        let atual = grupos[0];
        const fixo = ['.barra-topo', '.menu'].map(s => $(s)).filter(el => el && getComputedStyle(el).position === 'sticky' && el.offsetWidth > el.offsetHeight).reduce((t, el) => t + el.offsetHeight, 0);
        grupos.forEach(g => { if (g.getBoundingClientRect().top <= fixo + 80) atual = g; });
        marcar((fim ? grupos[grupos.length - 1] : atual).id);
      });
    }, { passive: true });
  })();

  // ================= menu: destaque que desliza até o item ativo =================
  const reduzMov = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function moverIndicador(semAnimar) {
    const ind = $('#menuInd'), b = $('#menu button.on');
    if (!ind || !b || !b.offsetParent) return;
    if (semAnimar) ind.style.transition = 'none';
    ind.style.width = b.offsetWidth + 'px';
    ind.style.height = b.offsetHeight + 'px';
    ind.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop}px)`;
    ind.classList.add('pronto');
    if (semAnimar) { ind.offsetWidth; ind.style.transition = ''; }
  }
  addEventListener('resize', () => moverIndicador(true));
  $('#menuSair').addEventListener('click', () => $('#btnSair').click());
  function mostrarQuem() {
    const nome = (E.quem && E.quem.nome) || 'Administrador';
    $('#menuNome').textContent = nome;
    $('#menuAv').textContent = (nome.trim()[0] || 'A').toUpperCase();
    $('#menuAv').title = nome + ' · para sair: Configurações → Acesso ao painel';
  }
  // números do Início contam até o valor na primeira vez que aparecem
  let contou = false;
  function contarNumeros() {
    if (contou || reduzMov()) { contou = true; return; }
    contou = true;
    $$('.ini-tile b').forEach(el => {
      const alvo = +el.textContent || 0;
      if (!alvo) return;
      const t0 = performance.now(), dur = 600;
      const passo = t => {
        const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(alvo * e);
        if (k < 1) requestAnimationFrame(passo);
      };
      el.textContent = '0';
      requestAnimationFrame(passo);
    });
  }

  // ================= lixeira: produtos excluídos ficam 30 dias =================
  async function mandarLixeira(lista) {
    try { await api('lixeiraAdd', { produtos: JSON.parse(JSON.stringify(lista)) }); contarLixeira(); }
    catch (e) { toast('Excluído, mas não foi para a lixeira: ' + e.message, true); }
  }
  async function contarLixeira() {
    try { const l = (await api('lixeira')).itens || []; $('#nLixeira').textContent = l.length || ''; return l; } catch (e) { return []; }
  }
  async function abrirLixeira() {
    const m = modal('<h2>Lixeira</h2><p class="carregando-txt">Carregando…</p>');
    const l = await contarLixeira();
    const desenhar = itens => {
      m.innerHTML = `<h2>Lixeira</h2>
        <p class="dica" style="margin-top:0">Produtos excluídos ficam aqui por 30 dias. Depois disso somem sozinhos.</p>
        ${itens.length ? `<ul class="lixo">${itens.map(x => `<li>
            <div class="mini">${(x.produto.fotos || [])[0] ? `<img src="${esc(miniUrl(x.produto.fotos[0]))}" alt="">` : ''}</div>
            <span><b>${esc(x.produto.codigo)}</b> ${esc(A.bonito(x.produto.nome))}<small>Excluído em ${esc(x.excluidoEm)}${x.por ? ' por ' + esc(x.por) : ''} · ${esc(x.produto.categoria || '')}</small></span>
            <button class="btn btn-claro btn-p" type="button" data-volta="${esc(x.id)}">Restaurar</button>
            <button class="btn-texto perigo" type="button" data-apaga="${esc(x.id)}">Apagar</button>
          </li>`).join('')}</ul>` : '<p>A lixeira está vazia.</p>'}
        <div class="acoes">${itens.length > 1 ? '<button class="btn-texto perigo" type="button" data-esvaziar>Esvaziar lixeira</button>' : ''}<button class="btn btn-claro" type="button" data-n>Fechar</button></div>`;
      $('[data-n]', m).onclick = () => m.close();
    };
    desenhar(l);
    m.onclick = async e => {
      const v = e.target.closest('[data-volta]'), a = e.target.closest('[data-apaga]'), z = e.target.closest('[data-esvaziar]');
      if (!v && !a && !z) return;
      const itens = (await api('lixeira')).itens || [];
      if (v) {
        const x = itens.find(i => i.id === v.dataset.volta);
        if (!x) return;
        if (E.produtos.some(p => norm(p.codigo) === norm(x.produto.codigo))) { toast(`Já existe um produto com o código ${x.produto.codigo}. Troque o código dele antes de restaurar.`, true); return; }
        lembrar('Restaurar ' + x.produto.codigo);
        let pos = -1; E.produtos.forEach((p, k) => { if (p.categoria === x.produto.categoria) pos = k; });
        E.produtos.splice(pos >= 0 ? pos + 1 : E.produtos.length, 0, x.produto);
        await api('lixeiraTirar', { ids: [x.id] });
        preencherFiltros(); desenharProdutos(); alterado([x.produto.codigo]);
        toast(`${x.produto.codigo} restaurado`);
      } else if (a || z) {
        if (!confirm(z ? 'Apagar de vez todos os produtos da lixeira?' : 'Apagar este produto de vez?')) return;
        await api('lixeiraTirar', { ids: z ? itens.map(i => i.id) : [a.dataset.apaga] });
      }
      desenhar(await contarLixeira());
    };
  }
  $('#btnLixeira').addEventListener('click', abrirLixeira);

  // ================= mensagem de novidades para o grupo =================
  function mensagemNovidades(nov, desde) {
    const g = t => nov.filter(x => x.novidade.tipo === t);
    const nome = p => `${p.codigo} ${A.bonito(p.nome)}`;
    const bloco = (titulo, l, linha) => (l.length ? `\n*${titulo}*\n${l.map(linha).join('\n')}\n` : '');
    const linkCat = new URL('./', location.href).href;
    return `*Novidades Aiker* (desde ${desde})\n`
      + bloco('Preço baixou', g('baixou'), p => `• ${nome(p)}: de ${brl(p.novidade.de)} por ${brl(precoAtual(p))}`)
      + bloco('Voltou ao estoque', g('voltou'), p => `• ${nome(p)}`)
      + bloco('Produtos novos', g('novo'), p => `• ${nome(p)}${precoAtual(p) != null ? ' · ' + brl(precoAtual(p)) : ''}`)
      + bloco('Preço atualizado', g('preco'), p => `• ${nome(p)}: ${brl(precoAtual(p))}`)
      + `\nCatálogo completo: ${linkCat}`;
  }
  const precoAtual = p => (p.promo != null && p.promo !== '' && +p.promo < +p.preco && A.promoNoPrazo(p.promoDe, p.promoAte) ? +p.promo : (p.preco == null || p.preco === '' ? null : +p.preco));

  // ================= especificações padrão da categoria (produto novo) =================
  // rótulos que aparecem em pelo menos 40% dos produtos da categoria, na ordem mais comum
  function specsDaCategoria(cat) {
    const l = E.produtos.filter(p => p.categoria === cat);
    if (!l.length) return [];
    const conta = new Map(), pos = new Map();
    l.forEach(p => (p.specs || []).forEach((s, k) => {
      const r = paraPar(s).r; if (!r) return;
      const key = norm(r);
      conta.set(key, (conta.get(key) || 0) + 1);
      if (!pos.has(key)) pos.set(key, { r, soma: 0 });
      pos.get(key).soma += k;
    }));
    return [...conta].filter(([, n]) => n / l.length >= 0.4)
      .sort((a, b) => pos.get(a[0]).soma / a[1] - pos.get(b[0]).soma / b[1])
      .slice(0, MAX_SPECS).map(([k]) => pos.get(k).r);
  }
  function aplicarSpecsPadrao() {
    if (edIdx >= 0) return;
    const atuais = lerPares();
    if (atuais.some(p => p.v)) return; // já começou a preencher: não mexe
    const rotulos = specsDaCategoria($('#eCategoria').value.trim());
    edSpecs = rotulos.length ? rotulos.map(r => ({ r, v: '' })) : [{ r: '', v: '' }];
    desenharSpecsEd();
    $('#edSpecDica').hidden = !rotulos.length;
  }
  $('#eCategoria').addEventListener('change', aplicarSpecsPadrao);

  // ================= ordenar a lista pelo cabeçalho =================
  let ordem = { col: '', dir: 1 };
  const CHAVES_ORD = {
    codigo: p => String(p.codigo || ''), nome: p => A.bonito(p.nome || ''),
    preco: p => (p.preco == null || p.preco === '' ? null : +p.preco), promo: p => (p.promo == null || p.promo === '' ? null : +p.promo),
    pcs: p => pcsNum(p) || null, vcx: p => { const u = precoAtual(p); return u != null && pcsNum(p) ? u * pcsNum(p) : null; },
  };
  function ordenar(l) {
    if (!ordem.col) return l;
    const f = CHAVES_ORD[ordem.col];
    return l.slice().sort((a, b) => {
      const x = f(a.p), y = f(b.p);
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y, 'pt-BR', { numeric: true }) : x - y) * ordem.dir;
    });
  }
  $$('[data-ord]').forEach(b => b.addEventListener('click', () => {
    const c = b.dataset.ord;
    ordem = ordem.col !== c ? { col: c, dir: 1 } : ordem.dir === 1 ? { col: c, dir: -1 } : { col: '', dir: 1 };
    $$('[data-ord]').forEach(x => {
      const on = x.dataset.ord === ordem.col;
      x.closest('th').setAttribute('aria-sort', on ? (ordem.dir === 1 ? 'ascending' : 'descending') : 'none');
      x.dataset.dir = on ? (ordem.dir === 1 ? 'sobe' : 'desce') : '';
    });
    desenharProdutos();
  }));

  // ================= busca rápida (Ctrl+K) =================
  // atalho de teclado: abre e fecha sem animação (é usado muitas vezes)
  let palItens = [], palSel = 0;
  const ACOES_PAL = [
    ['Novo produto', 'Cadastrar um produto', () => { irPara('produtos'); abrirEditor(-1); }],
    ['Gerar PDF', 'Tabela completa ou de novidades', () => $('#btnPdf').click()],
    ['Publicar', 'Revisar e publicar o catálogo', () => $('#btnPublicar').click()],
    ['Resumo para o chefe', 'O que mudou no período', () => abrirResumo()],
    ['Baixar backup', 'Cópia de segurança de tudo', () => { irPara('config'); $('#btnBackup').click(); }],
    ['Organizar tabela', 'Arrastar os produtos como ficam no PDF', () => { irPara('categorias'); abrirOrdemProdutos(''); }],
    ['Lixeira', 'Produtos excluídos nos últimos 30 dias', () => { irPara('produtos'); abrirLixeira(); }],
    ['Ver catálogo', 'Abre o catálogo dos clientes', () => window.open('./', '_blank', 'noopener')],
  ];
  function abrirPaleta() {
    const d = $('#paleta');
    if (d.open) { d.close(); return; }
    $('#palBusca').value = '';
    filtrarPaleta();
    d.showModal();
    $('#palBusca').focus();
  }
  function filtrarPaleta() {
    const t = norm($('#palBusca').value).split(' ').filter(Boolean);
    const bate = s => t.every(x => norm(s).includes(x));
    const telas = $$('#menu [data-aba]').map(b => ({ grupo: 'Telas', tit: b.textContent.trim(), sub: '', faz: () => irPara(b.dataset.aba) }));
    const acoes = ACOES_PAL.map(([tit, sub, faz]) => ({ grupo: 'Ações', tit, sub, faz }));
    const prods = t.length ? E.produtos.map((p, i) => ({ p, i })).filter(({ p }) => bate(p.codigo + ' ' + String(p.codigo).replace(/[-\s]/g, '') + ' ' + p.nome + ' ' + (p.specs || []).join(' '))).slice(0, 8)
      .map(({ p, i }) => ({ grupo: 'Produtos', tit: `${p.codigo} · ${A.bonito(p.nome)}`, sub: `${p.categoria}${p.esgotado ? ' · esgotado' : ''}`, foto: (p.fotos || [])[0], faz: () => { irPara('produtos'); abrirEditor(i); } })) : [];
    palItens = [...telas.filter(x => !t.length || bate(x.tit)), ...acoes.filter(x => !t.length || bate(x.tit + ' ' + x.sub)), ...prods];
    palSel = 0;
    let grupo = '';
    $('#palLista').innerHTML = palItens.length ? palItens.map((x, k) => {
      const cab = x.grupo !== grupo ? `<li class="pal-grupo" role="presentation">${(grupo = x.grupo)}</li>` : '';
      return cab + `<li role="option" id="pal-${k}" data-k="${k}" class="${k === palSel ? 'on' : ''}" aria-selected="${k === palSel}">${x.foto !== undefined ? `<span class="mini">${x.foto ? `<img src="${esc(miniUrl(x.foto))}" alt="">` : ''}</span>` : ''}<span><b>${esc(x.tit)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span></li>`;
    }).join('') : '<li class="pal-vazio">Nada encontrado. Tente o código do produto.</li>';
    $('#palBusca').setAttribute('aria-activedescendant', palItens.length ? 'pal-0' : '');
  }
  function marcarPaleta(k) {
    if (!palItens.length) return;
    palSel = (k + palItens.length) % palItens.length;
    $$('#palLista [data-k]').forEach(li => { const on = +li.dataset.k === palSel; li.classList.toggle('on', on); li.setAttribute('aria-selected', on); });
    const el = $(`#pal-${palSel}`); if (el) el.scrollIntoView({ block: 'nearest' });
    $('#palBusca').setAttribute('aria-activedescendant', 'pal-' + palSel);
  }
  function executarPaleta(k) { const x = palItens[k]; if (!x) return; $('#paleta').close(); x.faz(); }
  $('#palBusca').addEventListener('input', filtrarPaleta);
  $('#palBusca').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); marcarPaleta(palSel + 1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); marcarPaleta(palSel - 1); }
    if (e.key === 'Enter') { e.preventDefault(); executarPaleta(palSel); }
  });
  $('#palLista').addEventListener('click', e => { const li = e.target.closest('[data-k]'); if (li) executarPaleta(+li.dataset.k); });
  $('#palLista').addEventListener('mousemove', e => { const li = e.target.closest('[data-k]'); if (li && +li.dataset.k !== palSel) marcarPaleta(+li.dataset.k); });
  $('#paleta').addEventListener('click', e => { if (e.target === $('#paleta')) $('#paleta').close(); });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !$('#app').hidden) { e.preventDefault(); abrirPaleta(); }
  });
  $('#btnPaleta').addEventListener('click', abrirPaleta);

  // ================= resumo para o chefe =================
  async function abrirResumo() {
    const m = modal(`<h2>Resumo para o chefe</h2>
      <p class="dica" style="margin-top:0">Uma página com o que mudou no catálogo no período: preços, esgotados, produtos que voltaram, novos e removidos.</p>
      <label class="campo">Período<select id="rsPeriodo"><option value="7">Últimos 7 dias</option><option value="15">Últimos 15 dias</option><option value="30">Últimos 30 dias</option><option value="0">Desde a tabela de 14/10</option></select></label>
      <div class="acoes"><button class="btn btn-claro" type="button" data-n>Cancelar</button><button class="btn btn-escuro" type="button" data-s>Gerar resumo</button></div>`);
    $('[data-n]', m).onclick = () => m.close();
    $('[data-s]', m).onclick = async () => {
      const dias = +$('#rsPeriodo', m).value;
      const janela = window.open('', '_blank'); // abre já (o navegador bloqueia janelas abertas depois de esperar)
      if (janela) janela.document.write('<p style="font:16px system-ui;padding:24px">Montando o resumo…</p>');
      $('[data-s]', m).disabled = true; $('[data-s]', m).textContent = 'Montando…';
      try {
        const base = await baseDoResumo(dias);
        const d = compararVersoes(base.produtos, E.produtos);
        m.close();
        const html = htmlResumo(d, base.data);
        if (janela) { janela.document.open(); janela.document.write(html); janela.document.close(); }
        else toast('O navegador bloqueou a janela. Permita janelas deste site e tente de novo.', true);
      } catch (e) { if (janela) janela.close(); toast('Não foi possível montar o resumo: ' + e.message, true); m.close(); }
    };
  }
  // ponto de partida: a última versão publicada antes do período (ou a tabela de 14/10)
  async function baseDoResumo(dias) {
    if (dias) {
      const limite = Date.now() - dias * 864e5;
      const quando = id => { const m = String(id).match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : 0; };
      const l = ((await api('copias')).copias || []).filter(c => c.motivo === 'publicacao').map(c => ({ ...c, t: quando(c.id) })).sort((a, b) => a.t - b.t);
      const antes = l.filter(c => c.t <= limite).pop() || l[0];
      if (antes) {
        const c = await api('copia', { id: antes.id });
        if (c.rascunho && Array.isArray(c.rascunho.produtos)) return { produtos: c.rascunho.produtos, data: new Date(antes.t).toLocaleDateString('pt-BR') };
      }
    }
    await carregarScript('dados/dados-locais.js');
    return { produtos: (window.AIKER_DADOS_LOCAIS || {}).produtos || [], data: '14/10/2026' };
  }
  function htmlResumo(d, desde) {
    const hojeTxt = new Date().toLocaleDateString('pt-BR');
    const vis = E.produtos.filter(p => p.ativo !== false);
    const nome = p => `<b>${esc(p.codigo)}</b> ${esc(A.bonito(p.nome))}`;
    const pct = (a, b) => (a && b != null ? Math.round((b / a - 1) * 1000) / 10 : 0);
    const baixou = d.precos.filter(x => x.de != null && x.para != null && x.para < x.de).sort((a, b) => pct(a.de, a.para) - pct(b.de, b.para));
    const subiu = d.precos.filter(x => x.de != null && x.para != null && x.para > x.de).sort((a, b) => pct(b.de, b.para) - pct(a.de, a.para));
    const tab = (titulo, l, cols, linha) => (l.length ? `<section><h2>${titulo} <span>${l.length}</span></h2><table><thead><tr>${cols.map(c => `<th${/^(Antes|Agora|Variação)$/.test(c) ? ' class="n"' : ''}>${c}</th>`).join('')}</tr></thead><tbody>${l.map(linha).join('')}</tbody></table></section>` : '');
    const precoL = x => `<tr><td>${nome(x.p)}</td><td class="n">${brl(x.de)}</td><td class="n"><b>${brl(x.para)}</b></td><td class="n">${String(pct(x.de, x.para)).replace('.', ',')}%</td></tr>`;
    const simples = p => `<tr><td>${nome(p)}</td><td>${esc(p.categoria || '')}</td></tr>`;
    const nada = !(d.precos.length + d.esgotaram.length + d.voltaram.length + d.novos.length + d.removidos.length);
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Resumo do catálogo ${hojeTxt.replace(/\//g, '-')}</title>
      <link rel="stylesheet" href="${VENDOR}fontes.css">
      <style>
        @page { size: A4; margin: 14mm; }
        * { box-sizing: border-box; } body { margin: 0; font: 13px/1.45 'Barlow', system-ui, sans-serif; color: #1d1b1a; background: #f4f4f3; }
        .folha { max-width: 210mm; margin: 24px auto; background: #fff; padding: 14mm; border: 1px solid #e4e4e1; }
        header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; border-bottom: 3px solid #f16130; padding-bottom: 10px; margin-bottom: 16px; }
        header img { height: 30px; } h1 { margin: 0; font-size: 22px; } header p { margin: 2px 0 0; color: #6f6a67; text-align: right; }
        .nums { display: grid; grid-template-columns: repeat(5, 1fr); border: 1px solid #e4e4e1; border-radius: 8px; margin-bottom: 18px; }
        .nums div { padding: 10px 12px; border-left: 1px solid #eeeeec; } .nums div:first-child { border: 0; }
        .nums span { display: block; color: #6f6a67; font-size: 12px; } .nums b { font-size: 20px; font-variant-numeric: tabular-nums; }
        section { margin-bottom: 16px; break-inside: avoid; } h2 { font-size: 15px; margin: 0 0 6px; } h2 span { color: #c24418; }
        table { width: 100%; border-collapse: collapse; } th { text-align: left; font-size: 12px; color: #6f6a67; font-weight: 600; border-bottom: 1px solid #e4e4e1; padding: 5px 6px; }
        td { padding: 5px 6px; border-bottom: 1px solid #f1f1ef; } .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .nada { color: #6f6a67; } .barra { max-width: 210mm; margin: 16px auto 0; display: flex; justify-content: flex-end; }
        .barra button { font: 600 14px 'Barlow', sans-serif; padding: 10px 16px; border-radius: 8px; border: 0; background: #121110; color: #fff; cursor: pointer; }
        @media print { body { background: #fff; } .folha { margin: 0; border: 0; padding: 0; max-width: none; } .barra { display: none; } }
      </style></head><body>
      <div class="barra"><button onclick="print()">Imprimir ou salvar em PDF</button></div>
      <div class="folha">
        <header><div><img src="${new URL('img/logo-laranja.png', location.href).href}" alt="aiker"><h1>Resumo do catálogo</h1></div><p>De ${esc(desde)} a ${hojeTxt}<br>Situação atual do painel</p></header>
        <div class="nums">
          <div><span>Produtos visíveis</span><b>${vis.length}</b></div>
          <div><span>Disponíveis</span><b>${vis.filter(p => !p.esgotado).length}</b></div>
          <div><span>Esgotados</span><b>${vis.filter(p => p.esgotado).length}</b></div>
          <div><span>Em promoção</span><b>${vis.filter(p => !p.esgotado && precoAtual(p) != null && +p.preco > precoAtual(p)).length}</b></div>
          <div><span>Últimas unidades</span><b>${vis.filter(poucas).length}</b></div>
        </div>
        ${nada ? '<p class="nada">Nenhuma mudança de preço, estoque ou produtos no período.</p>' : ''}
        ${tab('Preço baixou', baixou, ['Produto', 'Antes', 'Agora', 'Variação'], precoL)}
        ${tab('Preço subiu', subiu, ['Produto', 'Antes', 'Agora', 'Variação'], precoL)}
        ${tab('Esgotaram', d.esgotaram, ['Produto', 'Categoria'], simples)}
        ${tab('Voltaram ao estoque', d.voltaram, ['Produto', 'Categoria'], simples)}
        ${tab('Produtos novos', d.novos, ['Produto', 'Categoria'], simples)}
        ${tab('Saíram do catálogo', d.removidos, ['Produto', 'Categoria'], simples)}
      </div></body></html>`;
  }

  // ================= escolher categoria: lista própria (no lugar da sugestão do navegador) =================
  // vale para qualquer campo com data-cat; filtra enquanto digita, mostra foto e quantidade, e permite criar nova
  const combo = { el: null, input: null, itens: [], sel: -1 };
  function comboAbrir(input) {
    if (combo.input === input && combo.el) return comboDesenhar();
    comboFechar();
    const el = document.createElement('div');
    el.className = 'cat-combo';
    el.setAttribute('role', 'listbox');
    el.id = 'catCombo';
    (input.closest('dialog') || document.body).appendChild(el);
    combo.el = el; combo.input = input;
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', 'catCombo');
    el.addEventListener('mousedown', e => e.preventDefault()); // não tira o foco do campo
    el.addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) comboEscolher(+li.dataset.i); });
    el.addEventListener('mousemove', e => { const li = e.target.closest('[data-i]'); if (li && +li.dataset.i !== combo.sel) comboMarcar(+li.dataset.i); });
    comboDesenhar();
    comboPosicionar();
  }
  function comboDesenhar() {
    const t = combo.input.value.trim();
    const n = contagemCat();
    const todas = categorias();
    const achadas = t ? todas.filter(c => norm(c).includes(norm(t))) : todas;
    const exata = todas.some(c => norm(c) === norm(t));
    combo.itens = achadas.map(c => ({ c, novo: false }));
    if (t && !exata) combo.itens.push({ c: t.replace(/\s*\/\s*/g, ' | '), novo: true });
    combo.sel = combo.itens.findIndex(x => !x.novo && norm(x.c) === norm(t));
    if (combo.sel < 0 && t) combo.sel = 0;
    combo.el.innerHTML = combo.itens.length ? combo.itens.map((x, i) => x.novo
      ? `<div class="cc-item cc-novo ${i === combo.sel ? 'on' : ''}" role="option" data-i="${i}" id="cc-${i}"><span class="cc-mais" aria-hidden="true">+</span><span><b>Criar categoria “${esc(x.c)}”</b><small>Nova categoria no fim da lista</small></span></div>`
      : `<div class="cc-item ${i === combo.sel ? 'on' : ''}" role="option" data-i="${i}" id="cc-${i}" aria-selected="${i === combo.sel}"><span class="cc-foto">${fotoCat(x.c) ? `<img src="${esc(fotoCat(x.c))}" alt="">` : ''}</span><span><b>${esc(x.c)}</b><small>${n[x.c] || 0} produto${(n[x.c] || 0) === 1 ? '' : 's'}</small></span></div>`).join('')
      : '<div class="cc-vazio">Digite o nome da categoria</div>';
    if (combo.sel >= 0) { const el = $('#cc-' + combo.sel, combo.el); if (el) el.scrollIntoView({ block: 'nearest' }); }
  }
  function comboPosicionar() {
    if (!combo.el) return;
    const r = combo.input.getBoundingClientRect();
    const baixo = innerHeight - r.bottom, cima = r.top;
    const alto = Math.min(300, Math.max(baixo, cima) - 16);
    combo.el.style.width = r.width + 'px';
    combo.el.style.left = r.left + 'px';
    combo.el.style.maxHeight = alto + 'px';
    if (baixo >= 220 || baixo >= cima) { combo.el.style.top = r.bottom + 6 + 'px'; combo.el.style.bottom = ''; combo.el.dataset.lado = 'baixo'; }
    else { combo.el.style.top = ''; combo.el.style.bottom = innerHeight - r.top + 6 + 'px'; combo.el.dataset.lado = 'cima'; }
  }
  function comboMarcar(i) {
    if (!combo.itens.length) return;
    combo.sel = (i + combo.itens.length) % combo.itens.length;
    $$('.cc-item', combo.el).forEach(el => { const on = +el.dataset.i === combo.sel; el.classList.toggle('on', on); el.setAttribute('aria-selected', on); });
    const el = $('#cc-' + combo.sel, combo.el); if (el) el.scrollIntoView({ block: 'nearest' });
    combo.input.setAttribute('aria-activedescendant', 'cc-' + combo.sel);
  }
  function comboEscolher(i) {
    const x = combo.itens[i]; if (!x) return;
    combo.input.value = x.c;
    const input = combo.input;
    comboFechar();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function comboFechar() {
    if (combo.el) combo.el.remove();
    if (combo.input) { combo.input.setAttribute('aria-expanded', 'false'); combo.input.removeAttribute('aria-activedescendant'); }
    combo.el = null; combo.input = null; combo.itens = []; combo.sel = -1;
  }
  document.addEventListener('focusin', e => { if (e.target.matches && e.target.matches('input[data-cat]')) comboAbrir(e.target); });
  document.addEventListener('focusout', e => { if (combo.input && e.target === combo.input) setTimeout(() => { if (document.activeElement !== combo.input) comboFechar(); }, 0); });
  document.addEventListener('input', e => { if (e.target.matches && e.target.matches('input[data-cat]')) { if (combo.input !== e.target || !combo.el) comboAbrir(e.target); else comboDesenhar(); } });
  document.addEventListener('click', e => { if (e.target.matches && e.target.matches('input[data-cat]') && !combo.el) comboAbrir(e.target); });
  document.addEventListener('keydown', e => {
    if (!(e.target.matches && e.target.matches('input[data-cat]'))) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!combo.el || combo.input !== e.target) comboAbrir(e.target); else comboMarcar(combo.sel + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); comboMarcar(combo.sel - 1); }
    else if (e.key === 'Enter' && combo.el && combo.sel >= 0) { e.preventDefault(); comboEscolher(combo.sel); }
    else if (e.key === 'Escape' && combo.el) { e.preventDefault(); e.stopPropagation(); comboFechar(); }
    else if (e.key === 'Tab') comboFechar();
  }, true);
  addEventListener('resize', comboPosicionar);
  document.addEventListener('scroll', comboPosicionar, true);

  // ================= capas em alta qualidade: JPG, PNG, WEBP ou PDF =================
  const PDFJS = VENDOR + 'pdf.min.js'; // PDF.js 3.11.174
  const PDFJS_WORKER = VENDOR + 'pdf.worker.min.js';
  const ehPdf = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  const lerBase64 = blob => new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => falha(new Error('Não consegui ler o arquivo.')); r.readAsDataURL(blob); });
  const canvasBlob = (cv, tipo, q) => new Promise(ok => cv.toBlob(ok, tipo, q));
  // devolve { base64, ext, tipo, w, h, paginas } pronto para enviar
  async function prepararCapa(arq, max) {
    if (ehPdf(arq)) {
      await carregarScript(PDFJS);
      const lib = window.pdfjsLib;
      lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      const doc = await lib.getDocument({ data: await arq.arrayBuffer() }).promise;
      const pag = await doc.getPage(1);
      const v1 = pag.getViewport({ scale: 1 });
      const escala = max / Math.max(v1.width, v1.height); // lado maior = tamanho de uso (A4 a 300 dpi)
      const vp = pag.getViewport({ scale: escala });
      const cv = document.createElement('canvas');
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const x = cv.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height);
      await pag.render({ canvasContext: x, viewport: vp }).promise;
      const blob = await canvasBlob(cv, 'image/jpeg', 0.95);
      return { base64: await lerBase64(blob), ext: 'jpg', tipo: 'image/jpeg', w: cv.width, h: cv.height, paginas: doc.numPages };
    }
    if (!/^image\/(jpeg|png|webp)$/.test(arq.type) && !/\.(jpe?g|png|webp)$/i.test(arq.name)) throw new Error('Use JPG, PNG, WEBP ou PDF.');
    const url = URL.createObjectURL(arq);
    const img = await new Promise((ok, falha) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => falha(new Error('Não consegui abrir a imagem ' + arq.name)); im.src = url; });
    const w = img.naturalWidth, h = img.naturalHeight;
    const ext = /png/i.test(arq.type) || /\.png$/i.test(arq.name) ? 'png' : /webp/i.test(arq.type) || /\.webp$/i.test(arq.name) ? 'webp' : 'jpg';
    // do tamanho certo (ou pouco maior): vai o arquivo original, sem recomprimir
    if (Math.max(w, h) <= max * 1.15) { URL.revokeObjectURL(url); return { base64: await lerBase64(arq), ext, tipo: arq.type || 'image/' + ext, w, h }; }
    // muito maior que o necessário: reduz para o tamanho de uso mantendo o formato
    const k = max / Math.max(w, h);
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    const x = cv.getContext('2d');
    x.imageSmoothingQuality = 'high';
    if (ext === 'jpg') { x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); }
    x.drawImage(img, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(url);
    const tipo = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const blob = await canvasBlob(cv, tipo, 0.95);
    return { base64: await lerBase64(blob), ext, tipo, w: cv.width, h: cv.height };
  }

  // ================= organizar a tabela: grade livre como a página do PDF =================
  // 3 por linha, 9 por página. Cada casa tem um produto ou fica em branco.
  // Salvo como: ordem dos produtos + "vazioAntes" (quantas casas em branco vêm antes de cada produto).
  const POR_PAG = 9, POR_LINHA = 3;
  const org = { cat: '', casas: [], mudou: false, arrasta: null };
  const entraNaTabela = p => p.ativo !== false && (E.config.pdfEsgotados !== false || !p.esgotado);
  // produtos -> casas (mesma regra da tabela em PDF; "novaLinha" é o formato antigo)
  function montarCasas(lista) {
    const casas = [];
    lista.forEach(p => {
      if (p.novaLinha && casas.length % POR_LINHA) while (casas.length % POR_LINHA) casas.push(null);
      for (let k = 0; k < (p.vazioAntes || 0); k++) casas.push(null);
      casas.push(p);
    });
    return casas;
  }
  const aparar = () => { while (org.casas.length && org.casas[org.casas.length - 1] == null) org.casas.pop(); };
  function abrirOrdemProdutos(cat) {
    const cats = categorias().filter(c => E.produtos.some(p => p.categoria === c && entraNaTabela(p)));
    if (!cats.length) { toast('Nenhum produto visível para organizar.', true); return; }
    $('#orgCat').innerHTML = cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    orgCarregar(cats.includes(cat) ? cat : cats[0]);
    $('#organizar').showModal();
  }
  function orgCarregar(cat) {
    org.cat = cat; org.mudou = false;
    org.casas = montarCasas(E.produtos.filter(p => p.categoria === cat && entraNaTabela(p)));
    $('#orgCat').value = cat;
    orgDesenhar();
  }
  const ICO_LINHA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 7v4H6.8l3.6-3.6L9 6l-6 6 6 6 1.4-1.4L6.8 13H21V7h-2z"/></svg>';
  const ICO_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>';
  function orgDesenhar(antes) {
    const total = org.casas.length;
    const paginas = Math.max(1, Math.ceil((total + 1) / POR_PAG)); // sempre sobra espaço para soltar no fim
    const n = org.casas.filter(Boolean).length;
    const tabPag = Math.max(1, Math.ceil(total / POR_PAG));
    $('#orgInfo').textContent = `${n} produto${n === 1 ? '' : 's'} · ${tabPag} página${tabPag === 1 ? '' : 's'} na tabela`;
    let html = '';
    for (let pg = 0; pg < paginas; pg++) {
      const extra = pg * POR_PAG >= total;
      html += `<section class="org-pag${extra ? ' org-pag-extra' : ''}"><p class="org-pag-n">${extra ? 'Solte aqui para mandar para uma página nova' : 'Página ' + (pg + 1)}</p><div class="org-grade">`;
      for (let k = pg * POR_PAG; k < (pg + 1) * POR_PAG && !(extra && k >= pg * POR_PAG + POR_LINHA); k++) { // página extra: só uma linha para soltar
        const p = org.casas[k];
        if (k >= total) { html += `<div class="org-casa org-livre" data-k="${k}"></div>`; continue; }
        if (!p) { html += `<div class="org-casa org-branco" data-k="${k}"><span>Em branco</span><button type="button" class="org-tira" data-tira="${k}" title="Remover este espaço (os produtos seguintes voltam uma casa)">${ICO_X}<span>Remover espaço</span></button></div>`; continue; }
        const f = (p.fotos || [])[0];
        const nova = k % POR_LINHA === 0 && k > 0 && org.casas[k - 1] == null;
        html += `<div class="org-casa org-card${nova ? ' nova' : ''}" draggable="true" tabindex="0" data-k="${k}" aria-label="${esc(p.codigo)}, casa ${k + 1}. Setas movem, N começa nova linha.">
          <div class="org-foto">${f ? `<img src="${esc(miniUrl(f))}" alt="" draggable="false">` : ''}</div>
          <div class="org-txt"><b>${esc(p.codigo)}</b><span>${esc(A.bonito(p.nome))}</span>${p.esgotado ? '<em>Esgotado</em>' : ''}</div>
          <button type="button" class="org-nl" data-nl="${k}" aria-pressed="${nova}" title="${nova ? 'Voltar o produto para junto dos anteriores' : 'Mandar o produto para o começo da próxima linha'}">${ICO_LINHA}<span>Nova linha</span></button>
        </div>`;
      }
      html += '</div></section>';
    }
    $('#orgPaginas').innerHTML = html;
    $('#orgSalvar').disabled = !org.mudou;
    if (antes) animarTroca(antes);
  }
  // FLIP: cada card desliza da posição antiga para a nova
  function posicoes() { const m = new Map(); $$('#orgPaginas .org-card').forEach(el => m.set(org.casas[+el.dataset.k], el.getBoundingClientRect())); return m; }
  function animarTroca(antes) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    $$('#orgPaginas .org-card').forEach(el => {
      const r0 = antes.get(org.casas[+el.dataset.k]); if (!r0) return;
      const r1 = el.getBoundingClientRect(), dx = r0.left - r1.left, dy = r0.top - r1.top;
      if (!dx && !dy) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    });
  }
  function orgAlterar(fn, foco) {
    const antes = posicoes();
    fn();
    aparar();
    org.mudou = true;
    orgDesenhar(antes);
    if (foco != null) { const el = $(`#orgPaginas .org-card[data-k="${foco}"]`); if (el) el.focus(); }
  }
  // soltar numa casa vazia: o produto vai para lá e a casa de origem fica vazia
  function orgParaCasaVazia(de, k) {
    orgAlterar(() => { const p = org.casas[de]; org.casas[de] = null; while (org.casas.length <= k) org.casas.push(null); org.casas[k] = p; }, null);
  }
  // soltar em cima de outro produto: entra antes/depois dele e empurra os seguintes
  function orgInserir(de, k, depois) {
    orgAlterar(() => { const [p] = org.casas.splice(de, 1); let pos = k + (depois ? 1 : 0); if (pos > de) pos--; org.casas.splice(pos, 0, p); }, null);
  }
  // setas: troca de casa com a vizinha (produto ou vazio)
  function orgTrocar(de, para) {
    if (para < 0) return;
    orgAlterar(() => { while (org.casas.length <= para) org.casas.push(null); [org.casas[de], org.casas[para]] = [org.casas[para], org.casas[de]]; }, para);
  }
  function orgNovaLinha(k) {
    const nova = k % POR_LINHA === 0 && k > 0 && org.casas[k - 1] == null;
    let foco = k;
    orgAlterar(() => {
      if (nova) { let a = k; while (a > 0 && org.casas[a - 1] == null) a--; org.casas.splice(a, k - a); foco = a; }
      else if (k % POR_LINHA) { const falta = POR_LINHA - (k % POR_LINHA); org.casas.splice(k, 0, ...Array(falta).fill(null)); foco = k + falta; }
    }, null);
    const el = $(`#orgPaginas .org-card[data-k="${foco}"]`); if (el) el.focus();
  }
  const orgPag = $('#orgPaginas');
  orgPag.addEventListener('dragstart', e => {
    const c = e.target.closest('.org-card'); if (!c) return;
    org.arrasta = +c.dataset.k; c.classList.add('arrastando');
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.dataset.k);
  });
  const limparAlvo = () => $$('#orgPaginas .antes, #orgPaginas .depois, #orgPaginas .alvo').forEach(x => x.classList.remove('antes', 'depois', 'alvo'));
  orgPag.addEventListener('dragover', e => {
    if (org.arrasta == null) return;
    const c = e.target.closest('.org-casa'); if (!c) return;
    e.preventDefault();
    limparAlvo();
    if (+c.dataset.k === org.arrasta) return;
    if (c.classList.contains('org-card')) { const r = c.getBoundingClientRect(); c.classList.add(e.clientX < r.left + r.width / 2 ? 'antes' : 'depois'); }
    else c.classList.add('alvo');
  });
  orgPag.addEventListener('drop', e => {
    e.preventDefault();
    const c = e.target.closest('.org-casa'), de = org.arrasta;
    org.arrasta = null;
    if (!c || de == null || +c.dataset.k === de) { limparAlvo(); return orgDesenhar(); }
    const k = +c.dataset.k;
    if (c.classList.contains('org-card')) orgInserir(de, k, c.classList.contains('depois'));
    else orgParaCasaVazia(de, k);
  });
  orgPag.addEventListener('dragend', () => { org.arrasta = null; limparAlvo(); $$('#orgPaginas .arrastando').forEach(x => x.classList.remove('arrastando')); });
  orgPag.addEventListener('click', e => {
    const nl = e.target.closest('[data-nl]'); if (nl) return orgNovaLinha(+nl.dataset.nl);
    const t = e.target.closest('[data-tira]'); if (t) orgAlterar(() => org.casas.splice(+t.dataset.tira, 1), null);
  });
  orgPag.addEventListener('keydown', e => {
    const c = e.target.closest('.org-card'); if (!c) return;
    const k = +c.dataset.k;
    const passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -POR_LINHA, ArrowDown: POR_LINHA }[e.key];
    if (passo) { e.preventDefault(); orgTrocar(k, k + passo); }
    if (e.key.toLowerCase() === 'n') { e.preventDefault(); orgNovaLinha(k); }
  });
  $('#orgCat').addEventListener('change', e => {
    if (org.mudou && !confirm('Trocar de categoria sem salvar a ordem desta?')) { e.target.value = org.cat; return; }
    orgCarregar(e.target.value);
  });
  $('#orgFechar').addEventListener('click', () => { if (org.mudou && !confirm('Fechar sem salvar a nova ordem?')) return; $('#organizar').close(); });
  $('#organizar').addEventListener('cancel', e => { if (org.mudou && !confirm('Fechar sem salvar a nova ordem?')) e.preventDefault(); });
  $('#orgSalvar').addEventListener('click', () => {
    // produtos voltam para as mesmas posições da lista geral, na ordem nova (ocultos ficam onde estavam)
    const lugares = E.produtos.map((p, k) => (p.categoria === org.cat && entraNaTabela(p) ? k : -1)).filter(k => k >= 0);
    const itens = []; let vazios = 0;
    org.casas.forEach(p => { if (!p) { vazios++; return; } itens.push({ p, vazios }); vazios = 0; });
    lembrar('Organizar tabela · ' + org.cat);
    // só conta como "alterado" quem mudou de casa (posição ou espaço antes dele)
    const casaAntes = new Map(montarCasas(lugares.map(k => E.produtos[k])).map((p, k) => [p, k]).filter(([p]) => p));
    const mexidos = [];
    let casa = 0;
    itens.forEach(({ p, vazios }, k) => {
      casa += vazios;
      if (casaAntes.get(p) !== casa) mexidos.push(p.codigo);
      casa++;
      delete p.novaLinha;
      if (vazios) p.vazioAntes = vazios; else delete p.vazioAntes;
      E.produtos[lugares[k]] = p;
    });
    org.mudou = false;
    $('#organizar').close();
    desenharProdutos();
    alterado(mexidos);
    toast(`Ordem salva (${mexidos.length} produto${mexidos.length === 1 ? '' : 's'} ${mexidos.length === 1 ? 'mudou' : 'mudaram'} de lugar). Para os clientes verem, clique em Publicar.`);
  });
  $('#orgPdf').addEventListener('click', () => { if (org.mudou) toast('Salve a ordem antes de gerar o PDF.', true); else { $('#organizar').close(); $('#btnPdf').click(); } });
  $('#btnOrganizar').addEventListener('click', () => abrirOrdemProdutos(''));

  // ================= lista: situação em selos + menu "⋯" + densidade =================
  const ICO_ESTRELA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/></svg>';
  function selosSituacao(p) {
    const s = [];
    if (p.esgotado) s.push('<span class="selo s-esg">Esgotado</span>');
    if (p.ativo === false) s.push('<span class="selo s-oculto">Oculto</span>');
    const promo = p.promo != null && p.promo !== '' && +p.promo < +p.preco;
    if (promo && !p.esgotado) s.push(`<span class="selo s-promo${A.promoNoPrazo(p.promoDe, p.promoAte) ? '' : ' fora'}" title="${A.promoNoPrazo(p.promoDe, p.promoAte) ? 'Promoção valendo' : 'Promoção fora do prazo'}">−${Math.round((1 - p.promo / p.preco) * 100)}%</span>`);
    if (p.destaque) s.push(`<span class="selo s-dest">${ICO_ESTRELA}Destaque</span>`);
    if (poucas(p)) s.push('<span class="selo s-poucas">Últimas un.</span>');
    return s.length ? `<div class="selos">${s.join('')}</div>` : '<span class="s-ok">Disponível</span>';
  }
  let menuLinha = null;
  function fecharMenuLinha() { if (menuLinha) { menuLinha.remove(); menuLinha = null; } }
  function abrirMenuLinha(i, btn) {
    fecharMenuLinha();
    const p = E.produtos[i];
    const m = document.createElement('div');
    m.className = 'menu-linha'; m.setAttribute('role', 'menu');
    const item = (campo, rot, on) => `<button type="button" role="menuitemcheckbox" aria-checked="${on}" data-alternar="${campo}"><span class="ml-check" aria-hidden="true">${on ? '✓' : ''}</span>${rot}</button>`;
    m.innerHTML = item('esgotado', 'Esgotado', !!p.esgotado) + item('ativo', 'Visível no catálogo', p.ativo !== false) + item('destaque', 'Destaque', !!p.destaque)
      + '<hr><button type="button" role="menuitem" data-ml="editar">Editar produto</button><button type="button" role="menuitem" data-ml="organizar">Posição na tabela</button>';
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect();
    const alto = m.offsetHeight;
    m.style.left = Math.max(8, r.right - m.offsetWidth) + 'px';
    m.style.top = (r.bottom + 6 + alto > innerHeight ? r.top - alto - 6 : r.bottom + 6) + 'px';
    menuLinha = m;
    m.querySelector('button').focus();
    m.addEventListener('click', e => {
      const a = e.target.closest('[data-alternar]'), o = e.target.closest('[data-ml]');
      if (a) {
        const campo = a.dataset.alternar;
        lembrar(`${p.codigo}: ${({ esgotado: 'esgotado', ativo: 'visível', destaque: 'destaque' })[campo]}`);
        p[campo] = campo === 'ativo' ? p.ativo === false : !p[campo];
        fecharMenuLinha();
        alterado([p.codigo]);
        desenharProdutos();
        requestAnimationFrame(() => { const tr = $(`#linhas tr[data-i="${i}"]`); if (tr) { tr.classList.add('acendeu'); requestAnimationFrame(() => requestAnimationFrame(() => tr.classList.remove('acendeu'))); } });
      }
      if (o) { fecharMenuLinha(); if (o.dataset.ml === 'editar') abrirEditor(i); else { irPara('categorias'); abrirOrdemProdutos(p.categoria); } }
    });
    m.addEventListener('keydown', e => {
      const bs = [...m.querySelectorAll('button')], k = bs.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); bs[(k + 1) % bs.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); bs[(k - 1 + bs.length) % bs.length].focus(); }
      if (e.key === 'Escape') { e.preventDefault(); fecharMenuLinha(); btn.focus(); }
    });
  }
  $('#linhas').addEventListener('click', e => { const b = e.target.closest('[data-mais]'); if (b) { e.stopPropagation(); menuLinha && menuLinha.dataset.de === b.dataset.mais ? fecharMenuLinha() : (abrirMenuLinha(+b.dataset.mais, b), menuLinha.dataset.de = b.dataset.mais); } });
  document.addEventListener('click', e => { if (menuLinha && !menuLinha.contains(e.target)) fecharMenuLinha(); });
  addEventListener('scroll', fecharMenuLinha, true);
  // densidade da lista (lembrada neste computador)
  function aplicarDensidade(d) {
    document.body.classList.toggle('dens-compacta', d === 'comp');
    $$('.seg-dens [data-dens]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dens === d)));
  }
  aplicarDensidade(guarda.ler('aiker-densidade') || 'conf');
  $$('.seg-dens [data-dens]').forEach(b => b.addEventListener('click', () => { guarda.gravar('aiker-densidade', b.dataset.dens); aplicarDensidade(b.dataset.dens); }));

  // ================= navegação =================
  $('#menu').addEventListener('click', e => {
    const b = e.target.closest('[data-aba]');
    if (!b) return;
    $$('#menu button').forEach(x => x.classList.toggle('on', x === b));
    // lista de produtos: redesenha antes de aparecer (só as primeiras linhas na hora, o resto logo depois)
    if (b.dataset.aba === 'produtos' && $('#aba-produtos').hidden) desenharProdutos();
    $$('.aba').forEach(s => { s.hidden = s.id !== 'aba-' + b.dataset.aba; });
    const sec = $('#aba-' + b.dataset.aba);
    sec.classList.remove('entra'); void sec.offsetWidth; sec.classList.add('entra');
    moverIndicador();
    if (b.dataset.aba === 'inicio') { desenharInicio(); contarNumeros(); }
    if (b.dataset.aba === 'link') desenharLink();
    if (b.dataset.aba === 'categorias') desenharCategorias();
    if (b.dataset.aba === 'vendedores') { carregarVendedores(); carregarAtividade(); }
    window.scrollTo(0, 0);
  });

  // ================= desfazer =================
  const historico = [];
  function lembrar(rotulo) {
    historico.push({ rotulo, produtos: JSON.stringify(E.produtos) });
    if (historico.length > 30) historico.shift();
    $('#btnDesfazer').disabled = false;
    $('#btnDesfazer').title = 'Desfazer: ' + rotulo + ' (Ctrl+Z)';
  }
  function desfazer() {
    const h = historico.pop();
    if (!h) return;
    E.produtos = JSON.parse(h.produtos);
    $('#btnDesfazer').disabled = !historico.length;
    $('#btnDesfazer').title = historico.length ? 'Desfazer: ' + historico[historico.length - 1].rotulo + ' (Ctrl+Z)' : 'Nada para desfazer';
    preencherFiltros();
    desenharProdutos();
    alterado([]);
    toast('Desfeito: ' + h.rotulo);
  }
  $('#btnDesfazer').addEventListener('click', desfazer);
  document.addEventListener('keydown', e => {
    const emCampo = !!(e.target.matches && e.target.matches('input, textarea, select, [contenteditable="true"]'));
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !emCampo && !document.querySelector('dialog[open]')) { e.preventDefault(); desfazer(); }
    if (e.key === '/' && !emCampo && !$('#aba-produtos').hidden) { e.preventDefault(); $('#fBusca').focus(); }
  });

  // ================= categorias =================
  // Ordem e lista ficam em E.config.categorias; categorias usadas pelos produtos e ainda não cadastradas entram no fim.
  function categorias() {
    const l = [];
    (E.config.categorias || []).forEach(c => { if (c && !l.includes(c)) l.push(c); });
    E.produtos.forEach(p => { if (p.categoria && !l.includes(p.categoria)) l.push(p.categoria); });
    return l;
  }
  function gravarCategorias(lista) {
    E.config.categorias = lista.slice();
    preencherFiltros();
    desenharCategorias();
    alterado([]);
  }
  function contagemCat() {
    const n = {};
    E.produtos.forEach(p => { n[p.categoria] = (n[p.categoria] || 0) + 1; });
    return n;
  }
  function fotoCat(c) {
    const p = E.produtos.find(x => x.categoria === c && (x.fotos || []).length && !x.esgotado) || E.produtos.find(x => x.categoria === c && (x.fotos || []).length);
    return p ? miniUrl(p.fotos[0]) : '';
  }
  function desenharCategorias() {
    const el = $('#listaCat');
    if (!el) return;
    const cats = categorias();
    const n = contagemCat();
    $('#resumoCat').textContent = `${cats.length} categoria${cats.length === 1 ? '' : 's'} · a ordem abaixo é a ordem do catálogo e da tabela em PDF`;
    el.innerHTML = cats.map((c, k) => {
      const f = fotoCat(c);
      return `<li class="cat-item" data-k="${k}">
        <div class="cat-ordem">
          <button type="button" class="btn-ico-s" data-subir="${k}" ${k ? '' : 'disabled'} aria-label="Subir ${esc(c)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7l6 6-1.4 1.4L12 9.8l-4.6 4.6L6 13z"/></svg></button>
          <button type="button" class="btn-ico-s" data-descer="${k}" ${k < cats.length - 1 ? '' : 'disabled'} aria-label="Descer ${esc(c)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17l-6-6 1.4-1.4 4.6 4.6 4.6-4.6L18 11z"/></svg></button>
        </div>
        <div class="cat-foto">${f ? `<img src="${esc(f)}" alt="" loading="lazy">` : ''}</div>
        <input class="cat-nome" value="${esc(c)}" data-orig="${esc(c)}" aria-label="Nome da categoria ${esc(c)}">
        <span class="cat-n">${n[c] || 0} produto${(n[c] || 0) === 1 ? '' : 's'}</span>
        <button type="button" class="btn btn-claro btn-p" data-ordem="${esc(c)}" ${(n[c] || 0) > 1 ? '' : 'disabled'}>Ordenar produtos</button>
        <button type="button" class="btn btn-claro btn-p" data-ver="${esc(c)}">Ver produtos</button>
        <button type="button" class="btn-texto perigo" data-excluir-cat="${k}">Excluir</button>
      </li>`;
    }).join('') || '<li class="vazio"><strong>Nenhuma categoria ainda</strong><span>Crie a primeira acima.</span></li>';
  }

  $('#formNovaCat').addEventListener('submit', e => {
    e.preventDefault();
    const nome = $('#novaCat').value.trim().replace(/\s*\/\s*/g, ' | ');
    if (!nome) return;
    const cats = categorias();
    if (cats.some(c => norm(c) === norm(nome))) { toast('Essa categoria já existe.', true); return; }
    const pos = $('#novaCatPos').value === 'inicio' ? 0 : cats.length;
    cats.splice(pos, 0, nome);
    gravarCategorias(cats);
    $('#novaCat').value = '';
    toast(`Categoria "${nome}" criada. Agora é só colocar produtos nela.`);
  });

  $('#listaCat').addEventListener('click', e => {
    const cats = categorias();
    const sub = e.target.closest('[data-subir]'), des = e.target.closest('[data-descer]');
    if (sub || des) {
      const k = +(sub || des).dataset[sub ? 'subir' : 'descer'];
      const j = k + (sub ? -1 : 1);
      [cats[k], cats[j]] = [cats[j], cats[k]];
      gravarCategorias(cats);
      const alvo = $(`[data-${sub ? 'subir' : 'descer'}="${j}"]`, $('#listaCat'));
      if (alvo && !alvo.disabled) alvo.focus();
      return;
    }
    const ord = e.target.closest('[data-ordem]');
    if (ord) { abrirOrdemProdutos(ord.dataset.ordem); return; }
    const ver = e.target.closest('[data-ver]');
    if (ver) {
      $('[data-aba="produtos"]').click();
      $('#fCat').value = ver.dataset.ver;
      desenharProdutos();
      return;
    }
    const ex = e.target.closest('[data-excluir-cat]');
    if (ex) excluirCategoria(cats[+ex.dataset.excluirCat]);
  });

  // renomear: troca o nome em todos os produtos da categoria
  $('#listaCat').addEventListener('change', e => {
    if (!e.target.matches('.cat-nome')) return;
    const de = e.target.dataset.orig;
    const para = e.target.value.trim().replace(/\s*\/\s*/g, ' | ');
    if (!para) { e.target.value = de; return; }
    if (para === de) return;
    const cats = categorias();
    if (cats.some(c => c !== de && norm(c) === norm(para))) { toast('Já existe uma categoria com esse nome.', true); e.target.value = de; return; }
    lembrar(`Renomear categoria ${de}`);
    const tocados = [];
    E.produtos.forEach(p => { if (p.categoria === de) { p.categoria = para; tocados.push(p.codigo); } });
    gravarCategorias(cats.map(c => (c === de ? para : c)));
    alterado(tocados);
    toast(`Categoria renomeada${tocados.length ? ` (${tocados.length} produto${tocados.length === 1 ? '' : 's'})` : ''}`);
  });
  $('#listaCat').addEventListener('keydown', e => {
    if (!e.target.matches('.cat-nome')) return;
    if (e.key === 'Enter') e.target.blur();
    if (e.key === 'Escape') { e.target.value = e.target.dataset.orig; e.target.blur(); }
  });

  function excluirCategoria(c) {
    const n = contagemCat()[c] || 0;
    const outras = categorias().filter(x => x !== c);
    if (!n) {
      confirmar('Excluir categoria?', `A categoria <b>${esc(c)}</b> não tem produtos e será removida.`, 'Excluir', () => {
        gravarCategorias(outras);
        toast('Categoria excluída');
      });
      return;
    }
    const m = modal(`<h2>Excluir "${esc(c)}"</h2>
      <p>Esta categoria tem <b>${n} produto${n === 1 ? '' : 's'}</b>. Para onde eles vão?</p>
      <label class="campo">Mover os produtos para<select id="moverPara">${outras.map(o => `<option>${esc(o)}</option>`).join('')}</select></label>
      <div class="acoes"><button class="btn btn-claro" type="button" data-n>Cancelar</button><button class="btn btn-escuro" type="button" data-s ${outras.length ? '' : 'disabled'}>Mover e excluir</button></div>`);
    $('[data-n]', m).onclick = () => m.close();
    $('[data-s]', m).onclick = () => {
      const para = $('#moverPara', m).value;
      m.close();
      lembrar(`Excluir categoria ${c}`);
      const tocados = [];
      E.produtos.forEach(p => { if (p.categoria === c) { p.categoria = para; tocados.push(p.codigo); } });
      gravarCategorias(outras);
      alterado(tocados);
      desenharProdutos();
      toast(`${n} produto${n === 1 ? '' : 's'} movido${n === 1 ? '' : 's'} para ${para}`);
    };
  }

  // ================= produtos =================
  let situacao = '';
  const sel = new Set(); // códigos selecionados
  // ---- estoque, promoção e pendências ----
  const hoje = () => A.hojeISO();
  const poucas = p => {
    const lim = Number(E.config.estoqueAlertaCx ?? 2) || 0;
    return !p.esgotado && lim > 0 && typeof p.estoque === 'number' && p.estoque > 0 && p.estoque <= (pcsNum(p) || 1) * lim;
  };
  const temPromo = p => p.promo != null && p.promo !== '';
  const promoVencida = p => temPromo(p) && !!p.promoAte && hoje() > p.promoAte;
  const promoForaDoPrazo = p => temPromo(p) && !A.promoNoPrazo(p.promoDe, p.promoAte);
  let cacheRepetidos = null;
  function codigosRepetidos() {
    if (cacheRepetidos && cacheRepetidos.n === E.produtos.length) return cacheRepetidos.set;
    const vistos = new Map(); const rep = new Set();
    E.produtos.forEach(p => { const k = norm(p.codigo); if (vistos.has(k)) rep.add(k); vistos.set(k, 1); });
    cacheRepetidos = { n: E.produtos.length, set: rep };
    setTimeout(() => { cacheRepetidos = null; }, 0);
    return rep;
  }
  // foto pequena: mede a primeira foto de cada produto (uma vez) e redesenha quando terminar
  const tamFoto = new Map();
  const fotoPequena = p => { const f = (p.fotos || [])[0]; const t = f && tamFoto.get(f); return !!t && t < 500; };
  let medindo = false;
  function medirFotos() {
    if (medindo) return; medindo = true;
    const fila = [...new Set(E.produtos.map(p => (p.fotos || [])[0]).filter(f => f && !tamFoto.has(f)))];
    if (!fila.length) { medindo = false; return; }
    api('tamanhosFotos', { fotos: fila.map(fotoUrl) }).then(r => {
      fila.forEach(f => tamFoto.set(f, (r.tamanhos || {})[fotoUrl(f)] || 9999));
      medindo = false; desenharInicio();
    }).catch(() => { fila.forEach(f => tamFoto.set(f, 9999)); medindo = false; });
  }
  const PENDENCIAS = [
    ['duplicado', 'Código repetido', 'Dois produtos com o mesmo código confundem o pedido. Troque um deles.'],
    ['promoerrada', 'Promoção maior ou igual ao preço', 'O preço promocional precisa ser menor que o normal; do contrário ele é ignorado.'],
    ['promovencida', 'Promoção vencida', 'A data final já passou: o cliente vê o preço normal. Tire a promoção ou mude a data.'],
    ['sempreco', 'Sem preço', 'Aparece como "Consulte" no catálogo e na tabela.'],
    ['sempcs', 'Sem peças por caixa', 'Sem isso o valor da caixa não é calculado.'],
    ['semfoto', 'Sem foto', 'Produto sem foto vende menos.'],
    ['fotopequena', 'Foto pequena', 'Menos de 500 pixels: fica borrada no catálogo e no PDF. Troque pela original.'],
    ['novos', 'Novos produtos ocultos', 'Criados pela atualização de preços: complete e ligue "Visível".'],
  ];

  const SITUACOES = [
    ['', 'Todos', () => true],
    ['disp', 'Disponíveis', p => !p.esgotado && p.ativo !== false],
    ['esg', 'Esgotados', p => !!p.esgotado],
    ['promo', 'Em promoção', p => p.promo != null && p.promo !== '' && p.promo < p.preco],
    ['dest', 'Destaques', p => !!p.destaque],
    ['oculto', 'Ocultos', p => p.ativo === false],
    ['semfoto', 'Sem foto', p => !(p.fotos || []).length],
    ['sempreco', 'Sem preço', p => p.preco == null || p.preco === ''],
    ['poucas', 'Últimas unidades', p => poucas(p)],
    ['duplicado', 'Código repetido', p => codigosRepetidos().has(norm(p.codigo)), true],
    ['sempcs', 'Sem peças por caixa', p => p.ativo !== false && !pcsNum(p), true],
    ['fotopequena', 'Foto pequena', p => fotoPequena(p), true],
    ['promovencida', 'Promoção vencida', p => promoVencida(p), true],
    ['promoerrada', 'Promoção maior que o preço', p => p.promo != null && p.promo !== '' && p.preco != null && +p.promo >= +p.preco, true],
    ['novos', 'Novos produtos ocultos', p => p.ativo === false && p.categoria === 'Novos produtos', true],
    ['alterados', 'Alterados', p => E.mudou.has(p.codigo)],
  ];

  function preencherFiltros() {
    const atual = $('#fCat').value;
    $('#fCat').innerHTML = '<option value="">Todas as categorias</option>' + categorias().map(c => `<option ${c === atual ? 'selected' : ''}>${esc(c)}</option>`).join('');
    $('#listaCategorias').innerHTML = categorias().map(c => `<option value="${esc(c)}">`).join('');
  }
  function desenharSegmentos() {
    $('#segmentos').innerHTML = SITUACOES.map(([k, rot, f, pend]) => {
      if (pend && k !== situacao) return '';
      const n = E.produtos.filter(f).length;
      if (k && !n && k !== situacao) return '';
      return `<button type="button" role="tab" aria-selected="${k === situacao}" data-sit="${k}" class="${k === situacao ? 'on' : ''}">${rot}<span>${n}</span></button>`;
    }).join('');
  }
  $('#segmentos').addEventListener('click', e => {
    const b = e.target.closest('[data-sit]');
    if (!b) return;
    situacao = b.dataset.sit;
    desenharProdutos();
  });
  ['#fBusca', '#fCat'].forEach(s => $(s).addEventListener('input', desenharProdutos));

  function filtrados() {
    const termos = norm($('#fBusca').value).split(' ').filter(Boolean);
    const cat = $('#fCat').value;
    const fSit = (SITUACOES.find(s => s[0] === situacao) || SITUACOES[0])[2];
    return E.produtos.map((p, i) => ({ p, i })).filter(({ p }) => {
      if (cat && p.categoria !== cat) return false;
      if (!fSit(p)) return false;
      if (termos.length) {
        const alvo = norm(p.codigo + ' ' + String(p.codigo).replace(/[-\s]/g, '') + ' ' + p.nome + ' ' + (p.specs || []).join(' ') + ' ' + (p.categoria || ''));
        return termos.every(t => alvo.includes(t));
      }
      return true;
    });
  }

  const pcsNum = p => parseInt(String(p.pcs || '').match(/\d+/) || '0', 10) || 0;
  const valorCaixa = p => {
    const un = p.promo != null && p.promo !== '' && p.promo < p.preco && A.promoNoPrazo(p.promoDe, p.promoAte) ? p.promo : p.preco;
    return un != null && pcsNum(p) ? brl(un * pcsNum(p)) : '—';
  };

  function desenharProdutos() {
    const l = ordenar(filtrados());
    const total = E.produtos.length;
    const esg = E.produtos.filter(p => p.esgotado).length;
    $('#resumoProdutos').textContent = `${total} produtos · ${esg} esgotados${l.length !== total ? ` · mostrando ${l.length}` : ''}`;
    desenharSegmentos();
    [...sel].forEach(c => { if (!E.produtos.some(p => p.codigo === c)) sel.delete(c); });
    if (!l.length) {
      $('#linhas').innerHTML = `<tr><td colspan="10"><div class="vazio"><strong>Nenhum produto aqui</strong><span>${$('#fBusca').value ? 'Confira o código ou tente outra palavra.' : 'Escolha outra situação ou categoria acima.'}</span></div></td></tr>`;
      atualizarMassa();
      return;
    }
    let ultimaCat = null;
    const agrupar = !$('#fBusca').value && !$('#fCat').value && !ordem.col;
    const partes = l.map(({ p, i }) => {
      let g = '';
      if (agrupar && p.categoria !== ultimaCat) { ultimaCat = p.categoria; g = `<tr class="grupo"><td colspan="10">${esc(p.categoria || 'Sem categoria')}<small>${E.produtos.filter(x => x.categoria === p.categoria).length} produtos</small></td></tr>`; }
      const f = (p.fotos || [])[0];
      const marcado = sel.has(p.codigo);
      const nf = (p.fotos || []).length, ns = (p.specs || []).length;
      return g + `<tr data-i="${i}" class="${p.ativo === false ? 'oculto' : ''} ${E.mudou.has(p.codigo) ? 'mudou' : ''} ${marcado ? 'sel' : ''}">
        <td class="c-sel"><input type="checkbox" data-sel ${marcado ? 'checked' : ''} aria-label="Selecionar ${esc(p.codigo)}"></td>
        <td class="c-foto"><div class="mini">${f ? `<img src="${esc(miniUrl(f))}" alt="" loading="lazy" decoding="async" width="44" height="44">` : '<span class="n">sem foto</span>'}</div></td>
        <td class="c-cod"><span class="cod">${esc(p.codigo)}</span></td>
        <td class="c-nome"><div class="nome">${esc(A.bonito(p.nome))}<small>${nf} foto${nf === 1 ? '' : 's'} · ${ns} especificaç${ns === 1 ? 'ão' : 'ões'}${p.estoque != null ? ` · <span class="${poucas(p) ? 'est-baixo' : ''}">estoque ${p.estoque.toLocaleString('pt-BR')}</span>` : ''}${promoForaDoPrazo(p) ? ' · <span class="est-baixo">promoção fora do prazo</span>' : ''}</small></div></td>
        <td class="c-num c-p"><input data-campo="preco" value="${fmt(p.preco)}" data-orig="${fmt(p.preco)}" inputmode="decimal" aria-label="Preço unitário de ${esc(p.codigo)}"></td>
        <td class="c-num c-pp"><input data-campo="promo" value="${fmt(p.promo)}" data-orig="${fmt(p.promo)}" inputmode="decimal" placeholder="—" aria-label="Preço promocional de ${esc(p.codigo)}"></td>
        <td class="c-num c-cx"><input class="pcs" data-campo="pcs" value="${esc(p.pcs)}" data-orig="${esc(p.pcs)}" aria-label="Peças por caixa de ${esc(p.codigo)}"></td>
        <td class="c-num c-vcx"><span class="vcx">${valorCaixa(p)}</span></td>
        <td class="c-sit">${selosSituacao(p)}</td>
        <td class="c-acao"><div class="acoes-linha"><button class="btn-mais" type="button" data-mais="${i}" aria-haspopup="menu" aria-label="Esgotado, visível e destaque de ${esc(p.codigo)}" title="Esgotado, visível, destaque"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg></button><button class="btn btn-claro btn-ico" type="button" data-editar="${i}" title="Editar ${esc(p.codigo)}" aria-label="Editar ${esc(p.codigo)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17.2V20h2.8L17 9.8 14.2 7 4 17.2zM19.7 7.1a1 1 0 0 0 0-1.4l-1.4-1.4a1 1 0 0 0-1.4 0L15.6 5.6 18.4 8.4l1.3-1.3z"/></svg></button></div></td>
      </tr>`;
    });
    pintarLinhas(partes);
    atualizarMassa();
  }
  // desenha primeiro as linhas que aparecem na tela e o resto no quadro seguinte (lista longa responde na hora)
  let vezPintura = 0;
  function pintarLinhas(partes) {
    const vez = ++vezPintura;
    const PRIMEIRAS = 24;
    $('#linhas').innerHTML = partes.slice(0, PRIMEIRAS).join('');
    if (partes.length <= PRIMEIRAS) return;
    requestAnimationFrame(() => setTimeout(() => {
      if (vez !== vezPintura) return; // já pediram outra lista
      $('#linhas').insertAdjacentHTML('beforeend', partes.slice(PRIMEIRAS).join(''));
      atualizarMassa();
    }, 0));
  }

  $('#linhas').addEventListener('change', e => {
    if (e.target.matches('[data-sel]')) {
      const tr = e.target.closest('tr');
      const c = E.produtos[+tr.dataset.i].codigo;
      e.target.checked ? sel.add(c) : sel.delete(c);
      tr.classList.toggle('sel', e.target.checked);
      atualizarMassa();
      return;
    }
    const campo = e.target.dataset.campo;
    if (!campo) return;
    const tr = e.target.closest('tr');
    const p = E.produtos[+tr.dataset.i];
    lembrar(`${p.codigo}: ${({ preco: 'preço', promo: 'promoção', pcs: 'peças por caixa', esgotado: 'esgotado', ativo: 'visível', destaque: 'destaque' })[campo]}`);
    if (campo === 'preco' || campo === 'promo') {
      const v = parsePreco(e.target.value);
      p[campo] = v;
      e.target.value = fmt(v);
      e.target.dataset.orig = e.target.value;
    } else if (campo === 'pcs') { p.pcs = e.target.value.trim(); e.target.dataset.orig = p.pcs; }
    else if (campo === 'ativo') p.ativo = e.target.checked;
    else p[campo] = e.target.checked;
    $('.vcx', tr).textContent = valorCaixa(p);
    tr.classList.add('mudou', 'acendeu');
    requestAnimationFrame(() => requestAnimationFrame(() => tr.classList.remove('acendeu')));
    tr.classList.toggle('oculto', p.ativo === false);
    alterado([p.codigo]);
    desenharSegmentos();
  });
  // como planilha: Enter desce para o mesmo campo do próximo produto (Shift+Enter sobe), Esc volta o valor
  $('#linhas').addEventListener('keydown', e => {
    if (!e.target.matches('input[data-campo]') || e.target.type === 'checkbox') return;
    if (e.key === 'Escape') { e.target.value = e.target.dataset.orig || ''; e.target.blur(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const campo = e.target.dataset.campo;
    const linhas = $$('#linhas tr[data-i]');
    const atual = e.target.closest('tr');
    const prox = linhas[linhas.indexOf(atual) + (e.shiftKey ? -1 : 1)];
    e.target.blur();
    if (prox) { const alvo = $(`input[data-campo="${campo}"]`, prox); if (alvo) { alvo.focus(); alvo.select(); } }
  });
  $('#linhas').addEventListener('focusin', e => { if (e.target.matches('input[data-campo]') && e.target.type !== 'checkbox') e.target.select(); });
  $('#linhas').addEventListener('click', e => {
    const b = e.target.closest('[data-editar]');
    if (b) abrirEditor(+b.dataset.editar);
  });
  $('#btnNovo').addEventListener('click', () => abrirEditor(-1));

  // ================= seleção e ações em massa =================
  $('#selTodos').addEventListener('change', e => {
    filtrados().forEach(({ p }) => (e.target.checked ? sel.add(p.codigo) : sel.delete(p.codigo)));
    desenharProdutos();
  });
  function atualizarMassa() {
    const n = sel.size;
    $('#massa').hidden = !n;
    $('#massaN').textContent = `${n} selecionado${n === 1 ? '' : 's'}`;
    const vis = filtrados();
    const todos = vis.length > 0 && vis.every(({ p }) => sel.has(p.codigo));
    $('#selTodos').checked = todos;
    $('#selTodos').indeterminate = !todos && vis.some(({ p }) => sel.has(p.codigo));
  }
  $('#massaLimpar').addEventListener('click', () => { sel.clear(); desenharProdutos(); });
  const selecionados = () => E.produtos.filter(p => sel.has(p.codigo));
  function aplicarMassa(rotulo, fn) {
    const l = selecionados();
    lembrar(`${rotulo} (${l.length})`);
    l.forEach(fn);
    desenharProdutos();
    alterado(l.map(p => p.codigo));
    toast(`${rotulo}: ${l.length} produto${l.length === 1 ? '' : 's'}`);
  }
  $('#massa').addEventListener('click', e => {
    const b = e.target.closest('[data-massa]');
    if (!b) return;
    const n = sel.size;
    const acao = b.dataset.massa;
    if (acao === 'esgotar') aplicarMassa('Marcados como esgotados', p => { p.esgotado = true; });
    if (acao === 'disponivel') aplicarMassa('Marcados como disponíveis', p => { p.esgotado = false; });
    if (acao === 'ocultar') aplicarMassa('Ocultados', p => { p.ativo = false; });
    if (acao === 'mostrar') aplicarMassa('Visíveis no catálogo', p => { p.ativo = true; });
    if (acao === 'excluir') confirmar(`Excluir ${n} produto${n === 1 ? '' : 's'}?`, 'Eles saem do catálogo. Dá para desfazer logo em seguida, enquanto você estiver no painel.', 'Excluir', () => {
      lembrar(`Excluídos (${n})`);
      mandarLixeira(E.produtos.filter(p => sel.has(p.codigo)));
      E.produtos = E.produtos.filter(p => !sel.has(p.codigo));
      sel.clear();
      preencherFiltros();
      desenharProdutos();
      alterado([]);
      toast(`${n} produto${n === 1 ? '' : 's'} na lixeira (dá para restaurar por 30 dias)`);
    });
    if (acao === 'categoria') {
      const m = modal(`<h2>Mudar categoria</h2><p>${n} produto${n === 1 ? '' : 's'} selecionado${n === 1 ? '' : 's'}.</p>
        <label class="campo">Nova categoria<input id="mCat" data-cat autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" placeholder="Escolha ou digite uma nova"></label>
        <div class="acoes"><button class="btn btn-claro" type="button" data-n>Cancelar</button><button class="btn btn-escuro" type="button" data-s>Mudar categoria</button></div>`);
      $('#mCat', m).focus();
      $('[data-n]', m).onclick = () => m.close();
      $('[data-s]', m).onclick = () => {
        const c = $('#mCat', m).value.trim();
        if (!c) { $('#mCat', m).focus(); return; }
        m.close();
        aplicarMassa('Categoria alterada', p => { p.categoria = c; });
        preencherFiltros();
      };
    }
    if (acao === 'preco') abrirAjustePreco();
    if (acao === 'promo') abrirPromoMassa();
    if (acao === 'destacar') aplicarMassa('Destacados', p => { p.destaque = true; });
    if (acao === 'tirar-destaque') aplicarMassa('Destaque removido', p => { p.destaque = false; });
    if (acao === 'pcs') {
      const m = modal(`<h2>Peças por caixa</h2><p>${n} produto${n === 1 ? '' : 's'} selecionado${n === 1 ? '' : 's'}.</p>
        <label class="campo">Quantidade por caixa<input id="mPcs" inputmode="numeric" placeholder="Ex.: 50"></label>
        <div class="acoes"><button class="btn btn-claro" type="button" data-n>Cancelar</button><button class="btn btn-escuro" type="button" data-s>Aplicar</button></div>`);
      $('#mPcs', m).focus();
      $('[data-n]', m).onclick = () => m.close();
      $('[data-s]', m).onclick = () => {
        const v = $('#mPcs', m).value.trim();
        if (!v) { $('#mPcs', m).focus(); return; }
        m.close();
        aplicarMassa('Peças por caixa alteradas', p => { p.pcs = v; });
      };
    }
  });

  // promoção em % sobre o preço normal (ou tirar a promoção)
  function abrirPromoMassa() {
    const l = selecionados();
    const m = modal(`<h2>Promoção</h2><p>${l.length} produto${l.length === 1 ? '' : 's'} selecionado${l.length === 1 ? '' : 's'}. O preço promocional é calculado sobre o preço normal.</p>
      <fieldset class="modo">
        <label><input type="radio" name="pmModo" value="pct" checked> <b>Dar desconto</b><span>Ex.: 10 = preço promocional 10% abaixo do normal.</span></label>
        <label><input type="radio" name="pmModo" value="tirar"> <b>Tirar a promoção</b><span>Os produtos voltam a ter só o preço normal.</span></label>
      </fieldset>
      <div id="pmCampo">
        <label class="campo">Desconto (%)<input id="pmValor" inputmode="decimal" placeholder="Ex.: 10"></label>
        <div class="cfg-par"><label class="campo">Começa em (opcional)<input type="date" id="pmDe"></label><label class="campo">Termina em (opcional)<input type="date" id="pmAte"></label></div>
      </div>
      <div class="ajuste-previa" id="pmPrevia"></div>
      <div class="acoes"><button class="btn btn-claro" type="button" data-n>Cancelar</button><button class="btn btn-escuro" type="button" data-s disabled>Aplicar</button></div>`);
    const modo = () => $('input[name="pmModo"]:checked', m).value;
    const calc = p => {
      if (modo() === 'tirar') return null;
      const v = parsePreco($('#pmValor', m).value);
      if (v == null || v <= 0 || v >= 100 || p.preco == null) return undefined;
      return Math.round(p.preco * (1 - v / 100) * 100) / 100;
    };
    const prever = () => {
      $('#pmCampo', m).hidden = modo() === 'tirar';
      const linhas = l.map(p => ({ p, para: calc(p) })).filter(x => x.para !== undefined);
      $('[data-s]', m).disabled = !linhas.length;
      $('#pmPrevia', m).innerHTML = linhas.length
        ? `<table><thead><tr><th>Produto</th><th class="n">Normal</th><th class="n">Promoção</th></tr></thead><tbody>${linhas.slice(0, 40).map(x => `<tr><td><b>${esc(x.p.codigo)}</b> ${esc(A.bonito(x.p.nome))}</td><td class="n">${x.p.preco == null ? '—' : brl(x.p.preco)}</td><td class="n"><b>${x.para == null ? 'sem promoção' : brl(x.para)}</b></td></tr>`).join('')}</tbody></table>${linhas.length > 40 ? `<p class="dica">… e mais ${linhas.length - 40}</p>` : ''}`
        : '<p class="dica">Digite o desconto (entre 1 e 99) para ver os preços antes de aplicar.</p>';
    };
    m.oninput = prever;
    prever();
    $('#pmValor', m).focus();
    $('[data-n]', m).onclick = () => m.close();
    $('[data-s]', m).onclick = () => {
      const novos = new Map(l.map(p => [p.codigo, calc(p)]));
      const rot = modo() === 'tirar' ? 'Promoção removida' : 'Promoção aplicada';
      m.close();
      const de = $('#pmDe', m) ? $('#pmDe', m).value : '', ate = $('#pmAte', m) ? $('#pmAte', m).value : '';
      const tirar = modo() === 'tirar';
      aplicarMassa(rot, p => { const v = novos.get(p.codigo); if (v !== undefined) { p.promo = v; p.promoDe = tirar ? '' : de; p.promoAte = tirar ? '' : ate; } });
    };
  }

  function abrirAjustePreco() {
    const l = selecionados();
    const m = modal(`<h2>Ajustar preço</h2><p>${l.length} produto${l.length === 1 ? '' : 's'} selecionado${l.length === 1 ? '' : 's'}. Para baixar, use número negativo (ex.: -10).</p>
      <div class="ajuste">
        <label class="campo">Aplicar em<select id="ajCampo"><option value="preco">Preço normal</option><option value="promo">Preço promocional</option></select></label>
        <label class="campo">Tipo<select id="ajTipo"><option value="pct">Porcentagem (%)</option><option value="rs">Somar valor (R$)</option><option value="fixo">Definir preço (R$)</option></select></label>
        <label class="campo">Valor<input id="ajValor" inputmode="decimal" placeholder="Ex.: 5 ou -10"></label>
      </div>
      <div class="ajuste-previa" id="ajPrevia"></div>
      <div class="acoes"><button class="btn btn-claro" type="button" data-n>Cancelar</button><button class="btn btn-escuro" type="button" data-s disabled>Aplicar</button></div>`);
    const calc = p => {
      const campo = $('#ajCampo', m).value, tipo = $('#ajTipo', m).value;
      const txt = $('#ajValor', m).value;
      const v = parsePreco(txt.replace(/^\s*[+-]/, ''));
      if (v == null) return null;
      const val = /^\s*-/.test(txt) ? -v : v;
      if (tipo === 'fixo') return Math.max(0, v);
      const base = p[campo];
      if (base == null || base === '') return null;
      const novo = tipo === 'pct' ? base * (1 + val / 100) : base + val;
      return Math.max(0, Math.round(novo * 100) / 100);
    };
    const prever = () => {
      const campo = $('#ajCampo', m).value;
      const linhas = l.map(p => ({ p, de: p[campo], para: calc(p) })).filter(x => x.para != null);
      $('[data-s]', m).disabled = !linhas.length;
      $('#ajPrevia', m).innerHTML = linhas.length
        ? `<table><thead><tr><th>Produto</th><th class="n">Antes</th><th class="n">Depois</th></tr></thead><tbody>${linhas.slice(0, 40).map(x => `<tr><td><b>${esc(x.p.codigo)}</b> ${esc(A.bonito(x.p.nome))}</td><td class="n">${x.de == null || x.de === '' ? '—' : brl(x.de)}</td><td class="n"><b>${brl(x.para)}</b></td></tr>`).join('')}</tbody></table>${linhas.length > 40 ? `<p class="dica">… e mais ${linhas.length - 40}</p>` : ''}`
        : '<p class="dica">Digite o valor para ver como os preços ficam antes de aplicar.</p>';
    };
    ['#ajCampo', '#ajTipo', '#ajValor'].forEach(s => $(s, m).addEventListener('input', prever));
    prever();
    $('#ajValor', m).focus();
    $('[data-n]', m).onclick = () => m.close();
    $('[data-s]', m).onclick = () => {
      const campo = $('#ajCampo', m).value;
      const novos = new Map(l.map(p => [p.codigo, calc(p)]));
      m.close();
      aplicarMassa('Preços ajustados', p => { const v = novos.get(p.codigo); if (v != null) p[campo] = v; });
    };
  }

  // ================= editor de produto =================
  let edIdx = -1, edFotos = [], edSpecs = [];
  function abrirEditor(i, base) {
    edIdx = i;
    const p = base || (i >= 0 ? E.produtos[i] : { codigo: '', categoria: $('#fCat').value || '', nome: '', preco: null, promo: null, pcs: '', esgotado: false, ativo: true, destaque: false, specs: [], fotos: [] });
    $('#edSobre').textContent = i >= 0 ? 'Editar produto' : '';
    $('#edSobre').hidden = i < 0;
    $('#edTitulo').textContent = i >= 0 ? A.bonito(p.nome) || p.codigo : 'Novo produto';
    $('#eCodigo').value = p.codigo || '';
    $('#eCategoria').value = p.categoria || '';
    // mostra o nome como ele aparece no catálogo e no PDF (a planilha antiga veio toda em maiúsculas)
    $('#eNome').value = A.bonito(p.nome || '');
    $('#ePreco').value = fmt(p.preco);
    $('#ePromo').value = fmt(p.promo);
    $('#ePcs').value = p.pcs || '';
    $('#eEstoque').value = p.estoque ?? '';
    $('#ePromoDe').value = p.promoDe || '';
    $('#ePromoAte').value = p.promoAte || '';
    $('#eEsgotado').checked = !!p.esgotado;
    $('#eAtivo').checked = p.ativo !== false;
    $('#eDestaque').checked = !!p.destaque;
    edFotos = (p.fotos || []).slice();
    edSpecs = (p.specs || []).map(paraPar);
    if (!edSpecs.length) edSpecs.push({ r: '', v: '' });
    $('#btnExcluir').hidden = $('#btnDuplicar').hidden = i < 0;
    $('#edFotoStatus').textContent = '';
    desenharFotosEd();
    desenharSpecsEd();
    mostrarHistorico(i >= 0 ? p.codigo : '');
    $('#edSpecDica').hidden = true;
    if (i < 0 && !base) aplicarSpecsPadrao();
    $('#editor').showModal();
    $('.ed-corpo').scrollTop = 0;
  }

  // histórico de preços (gravado a cada publicação)
  async function mostrarHistorico(codigo) {
    const box = $('#edHist');
    box.hidden = true; box.open = false;
    if (!codigo) return;
    let l;
    try { l = (await api('historico', { codigo })).historico || []; } catch (e) { return; }
    if ($('#eCodigo').value !== codigo || !l.length) return;
    const linhas = l.slice().reverse().map((x, k, arr) => {
      const ant = arr[k + 1];
      const un = y => (y.pr != null && y.pr < y.p ? y.pr : y.p);
      const dif = ant ? un(x) - un(ant) : 0;
      return `<tr><td>${esc(x.d)}</td><td class="n">${brl(x.p)}</td><td class="n">${x.pr != null ? brl(x.pr) : '—'}</td><td class="n">${!ant ? '<small>início</small>' : dif ? `<span class="${dif > 0 ? 'sobe' : 'desce'}">${dif > 0 ? '▲' : '▼'} ${Math.abs(Math.round(dif / un(ant) * 100))}%</span>` : '<small>só promoção</small>'}</td></tr>`;
    }).join('');
    $('#edHistN').textContent = '· ' + l.length + (l.length === 1 ? ' registro' : ' registros');
    $('#edHistCorpo').innerHTML = `<table><thead><tr><th>Publicado em</th><th class="n">Preço</th><th class="n">Promoção</th><th class="n">Variação</th></tr></thead><tbody>${linhas}</tbody></table><p class="dica">Um registro a cada publicação em que o preço mudou.</p>`;
    box.hidden = false;
  }

  const lerEstoque = t => { const n = parseInt(String(t).replace(/\D+/g, ''), 10); return String(t).trim() === '' || isNaN(n) ? null : n; };
  function desenharFotosEd() {
    $('#edFotos').innerHTML = edFotos.map((f, k) => `<div class="foto-ed ${k ? '' : 'principal'}" draggable="true" data-k="${k}">
      <img src="${esc(fotoUrl(f))}" alt="">
      ${k ? '' : '<span class="etq">Principal</span>'}
      <div class="acoes">
        ${k ? `<button type="button" data-mover="${k}" data-d="-1" title="Mover para a esquerda">←</button>` : ''}
        ${k < edFotos.length - 1 ? `<button type="button" data-mover="${k}" data-d="1" title="Mover para a direita">→</button>` : ''}
        <button type="button" data-remover="${k}" title="Remover">✕</button>
      </div>
    </div>`).join('');
    $('#soltarFotos').hidden = edFotos.length >= MAX_FOTOS;
  }
  $('#edFotos').addEventListener('click', e => {
    const m = e.target.closest('[data-mover]');
    if (m) { const k = +m.dataset.mover, j = k + +m.dataset.d; [edFotos[k], edFotos[j]] = [edFotos[j], edFotos[k]]; desenharFotosEd(); }
    const r = e.target.closest('[data-remover]');
    if (r) { edFotos.splice(+r.dataset.remover, 1); desenharFotosEd(); }
  });
  // arrastar para reordenar
  let arrastando = null;
  $('#edFotos').addEventListener('dragstart', e => { const f = e.target.closest('.foto-ed'); if (!f) return; arrastando = +f.dataset.k; f.classList.add('arrastando'); e.dataTransfer.effectAllowed = 'move'; });
  $('#edFotos').addEventListener('dragover', e => { const f = e.target.closest('.foto-ed'); if (arrastando == null || !f) return; e.preventDefault(); $$('.foto-ed', $('#edFotos')).forEach(x => x.classList.toggle('alvo', x === f)); });
  $('#edFotos').addEventListener('drop', e => {
    const f = e.target.closest('.foto-ed');
    if (arrastando == null || !f) return;
    e.preventDefault();
    const para = +f.dataset.k;
    const [item] = edFotos.splice(arrastando, 1);
    edFotos.splice(para, 0, item);
    arrastando = null;
    desenharFotosEd();
  });
  $('#edFotos').addEventListener('dragend', () => { arrastando = null; $$('.foto-ed').forEach(x => x.classList.remove('arrastando', 'alvo')); });

  function reduzirImagem(arq, max = 2000, qualidade = .92) {
    return new Promise((ok, falha) => {
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth, h = img.naturalHeight;
        const k = Math.min(1, max / Math.max(w, h));
        w = Math.round(w * k); h = Math.round(h * k);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const x = c.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
        x.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(img.src);
        ok(c.toDataURL('image/jpeg', qualidade).split(',')[1]);
      };
      img.onerror = () => falha(new Error('Não consegui ler a imagem ' + arq.name));
      img.src = URL.createObjectURL(arq);
    });
  }

  async function enviarImagem(arq, prefixo, max) {
    const b64 = await reduzirImagem(arq, max || 2000, .92);
    const nome = (prefixo ? slug(prefixo) + '-' : '') + slug(arq.name.replace(/\.[^.]+$/, '')).slice(0, 40) + '.jpg';
    const r = await api('enviarFoto', { nome, base64: b64, tipo: 'image/jpeg' });
    return r.url;
  }

  async function adicionarFotos(arquivos) {
    const lista = [...arquivos].filter(f => f.type.startsWith('image/'));
    if (!lista.length) return;
    const st = $('#edFotoStatus');
    for (let k = 0; k < lista.length; k++) {
      if (edFotos.length >= MAX_FOTOS) { toast(`Máximo de ${MAX_FOTOS} fotos por produto.`, true); break; }
      st.textContent = `Enviando foto ${k + 1} de ${lista.length}…`;
      try {
        edFotos.push(await enviarImagem(lista[k], $('#eCodigo').value));
        desenharFotosEd();
      } catch (e) { toast(e.message, true); break; }
    }
    st.textContent = '';
  }
  ligarSoltar('#soltarFotos', '#arqFotos', adicionarFotos);

  // enquanto edita, cada especificação é um par {r: rótulo, v: valor} (linhas vazias são mantidas)
  function paraPar(s) {
    const m = String(s || '').match(/^([^:]*):\s*(.*)$/);
    return m ? { r: A.bonito(m[1], 'frase'), v: A.bonito(m[2], 'frase') } : { r: '', v: A.bonito(String(s || ''), 'frase') };
  }
  function desenharSpecsEd() {
    $('#edSpecs').innerHTML = edSpecs.map((p, k) => `<div class="spec-ed" data-k="${k}">
        <input data-parte="r" value="${esc(p.r)}" placeholder="Rótulo (ex.: Tela)">
        <input data-parte="v" value="${esc(p.v)}" placeholder="Valor (ex.: 7&quot; IPS)">
        <button type="button" data-tirar="${k}" aria-label="Remover">✕</button>
      </div>`).join('');
    $('#btnAddSpec').hidden = edSpecs.length >= MAX_SPECS;
  }
  function lerPares() {
    return $$('.spec-ed', $('#edSpecs')).map(d => ({ r: $('[data-parte="r"]', d).value.trim(), v: $('[data-parte="v"]', d).value.trim() }));
  }
  function lerSpecs() {
    return lerPares().map(p => (p.r && p.v ? `${p.r}: ${p.v}` : (p.v || p.r))).filter(Boolean);
  }
  $('#btnAddSpec').addEventListener('click', () => {
    edSpecs = lerPares();
    edSpecs.push({ r: '', v: '' });
    desenharSpecsEd();
    $$('.spec-ed [data-parte="r"]', $('#edSpecs')).slice(-1)[0].focus();
  });
  $('#edSpecs').addEventListener('click', e => { const b = e.target.closest('[data-tirar]'); if (b) { edSpecs = lerPares(); edSpecs.splice(+b.dataset.tirar, 1); if (!edSpecs.length) edSpecs.push({ r: '', v: '' }); desenharSpecsEd(); } });
  // Enter no valor cria a próxima linha
  $('#edSpecs').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.parte) { e.preventDefault(); if (!$('#btnAddSpec').hidden) $('#btnAddSpec').click(); } });

  $('#formEd').addEventListener('submit', e => {
    e.preventDefault();
    const codigo = $('#eCodigo').value.trim();
    let nome = $('#eNome').value.trim();
    // nome igual ao de antes (só mudou maiúscula/minúscula na tela): guarda como estava, para não virar uma "alteração" na revisão
    if (edIdx >= 0 && A.bonito(nome) === A.bonito(E.produtos[edIdx].nome || '')) nome = E.produtos[edIdx].nome;
    const categoria = $('#eCategoria').value.trim();
    if (!codigo || !nome || !categoria) { toast('Preencha código, nome e categoria.', true); return; }
    const dup = E.produtos.findIndex((p, k) => k !== edIdx && norm(p.codigo) === norm(codigo));
    if (dup >= 0) { toast(`Já existe um produto com o código ${codigo}.`, true); return; }
    const antes = edIdx >= 0 ? E.produtos[edIdx] : null;
    lembrar(antes ? 'Edição de ' + antes.codigo : 'Novo produto ' + codigo);
    const p = {
      codigo, categoria, nome,
      preco: parsePreco($('#ePreco').value), promo: parsePreco($('#ePromo').value),
      pcs: $('#ePcs').value.trim(), estoque: lerEstoque($('#eEstoque').value), promoDe: $('#ePromoDe').value || '', promoAte: $('#ePromoAte').value || '',
      esgotado: $('#eEsgotado').checked, ativo: $('#eAtivo').checked, destaque: $('#eDestaque').checked,
      specs: lerSpecs(), fotos: edFotos.slice(),
    };
    if (antes) {
      // nada mudou de verdade (só maiúsculas na tela, ou campos vazios): guarda como estava, sem criar "alteração" na revisão
      if (norm(JSON.stringify(p.specs)) === norm(JSON.stringify(antes.specs || []))) p.specs = antes.specs || [];
      ['estoque', 'promoDe', 'promoAte'].forEach(k => { if ((p[k] == null || p[k] === '') && !(k in antes)) delete p[k]; });
      // mantém o que o editor não mostra (nova linha e espaços do Organizar tabela, por exemplo)
      E.produtos[edIdx] = Object.assign({}, antes, p);
    }
    else {
      // novo: entra no fim da categoria escolhida
      let pos = -1;
      E.produtos.forEach((x, k) => { if (x.categoria === categoria) pos = k; });
      E.produtos.splice(pos >= 0 ? pos + 1 : E.produtos.length, 0, p);
    }
    if (antes && antes.codigo !== codigo) E.mudou.delete(antes.codigo);
    $('#editor').close();
    preencherFiltros();
    desenharProdutos();
    alterado([codigo]);
    toast(antes ? 'Produto salvo' : 'Produto criado');
  });
  $('#btnExcluir').addEventListener('click', () => {
    const p = E.produtos[edIdx];
    confirmar('Excluir produto?', `O produto <b>${esc(p.codigo)}</b> será removido. Se só quiser escondê-lo, desligue "Visível no catálogo".`, 'Excluir', () => {
      lembrar('Exclusão de ' + p.codigo);
      mandarLixeira([p]);
      E.produtos.splice(edIdx, 1);
      $('#editor').close();
      preencherFiltros();
      desenharProdutos();
      alterado([]);
      toast('Produto na lixeira (dá para restaurar por 30 dias)');
    });
  });
  $('#btnDuplicar').addEventListener('click', () => {
    const p = { ...E.produtos[edIdx], codigo: E.produtos[edIdx].codigo + '-COPIA' };
    $('#editor').close();
    abrirEditor(-1, p);
  });
  $$('[data-fechar]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  $$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

  // ================= arrastar e soltar arquivos =================
  function ligarSoltar(zona, input, fn) {
    const z = $(zona), i = $(input);
    i.addEventListener('change', () => { if (i.files.length) fn(i.files); i.value = ''; });
    ['dragenter', 'dragover'].forEach(t => z.addEventListener(t, e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); z.classList.add('arrastando'); } }));
    ['dragleave', 'drop'].forEach(t => z.addEventListener(t, () => z.classList.remove('arrastando')));
    z.addEventListener('drop', e => { if (e.dataTransfer.files.length) { e.preventDefault(); fn(e.dataTransfer.files); } });
  }

  // ================= modal genérico =================
  function modal(html) {
    const m = $('#modal');
    m.oninput = m.onclick = null; // a mesma janela é reaproveitada: limpa os eventos da anterior
    m.innerHTML = html;
    if (!m.open) m.showModal();
    return m;
  }
  function confirmar(titulo, texto, botao, fn, perigo = true) {
    const m = modal(`<h2>${titulo}</h2><p>${texto}</p><div class="acoes"><button class="btn btn-claro" type="button" data-n>Cancelar</button><button class="btn ${perigo ? 'btn-escuro' : 'btn-laranja'}" type="button" data-s>${botao}</button></div>`);
    $('[data-n]', m).onclick = () => m.close();
    $('[data-s]', m).onclick = () => { m.close(); fn(); };
  }

  // ================= atualizar preços =================
  const compacto = s => norm(s).replace(/[^A-Z0-9]/g, '');
  function indiceCodigos() {
    const m = new Map();
    E.produtos.forEach((p, i) => {
      const c = compacto(p.codigo);
      if (c) { m.set(c, i); m.set(c.replace(/O/g, '0'), i); }
    });
    return m;
  }
  // distância entre dois códigos; trocas típicas da leitura de imagem (A/4, S/3/5, V/W, O/0, I/L/1, B/8, Z/2, G/6, M/H/N) custam pouco
  const PARES = ['A4', 'S5', 'S3', 'VW', 'O0', 'D0', 'Q0', 'I1', 'L1', 'IL', 'T1', 'B8', 'Z2', 'G6', 'MH', 'MN', 'HN', 'E3', 'U0', 'J1'];
  const CONF = new Set(PARES.flatMap(p => [p, p[1] + p[0]]));
  function custoTroca(a, b) { return a === b ? 0 : CONF.has(a + b) ? 0.3 : 1; }
  function distancia(a, b) {
    if (a === b) return 0;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custoTroca(a[i - 1], b[j - 1]));
    }
    return Math.round(d[a.length][b.length] * 10) / 10;
  }
  function parecidos(codigo) {
    const c = compacto(codigo);
    if (c.length < 3) return [];
    const lim = c.length <= 6 ? 1.2 : 2;
    return E.produtos.map((p, i) => {
      const k = compacto(p.codigo);
      let dist = distancia(c, k);
      if (dist > lim && (k.startsWith(c) || c.startsWith(k)) && Math.abs(k.length - c.length) <= 4) dist = lim;
      return { i, dist };
    }).filter(x => x.dist <= lim).sort((a, b) => a.dist - b.dist).slice(0, 4);
  }
  // a leitura de imagem às vezes troca 0 por "o" e 1 por "l"
  const limparNum = t => t.replace(/^[oOQ]$/, '0').replace(/^[lI|]$/, '1').replace(/(\d)[oO]/g, '$10');
  const ehNumero = t => /^-?[\d.,]+$/.test(limparNum(t).replace(/^R\$/i, '')) && /\d/.test(t);

  // corrige erros típicos da leitura de imagem: antes do traço o código só tem letras; depois, "O" entre números é zero
  function arrumarCodigo(cod) {
    cod = cod.toUpperCase();
    const i = cod.indexOf('-');
    if (i <= 0) return cod;
    const L = { 4: 'A', 0: 'O', 5: 'S', 1: 'I', 8: 'B', 6: 'G', 2: 'Z', 7: 'T' };
    let pre = cod.slice(0, i).replace(/[0-9]/g, d => L[d] || d);
    let pos = cod.slice(i);
    for (let k = 0; k < 3; k++) pos = pos.replace(/(\d)O|O(\d)/g, (m, x, y) => (x ? x + '0' : '0' + y));
    return pre + pos;
  }

  function analisarTexto(texto, primeiro) {
    const m = indiceCodigos();
    const achados = new Map();
    const novos = new Map();
    let ignoradas = 0;
    texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(linha => {
      if (/^(c[oó]d|produto|pre[cç]o|estoque|qtd|total)\b/i.test(linha)) return;
      const toks = linha.replace(/R\$\s*/gi, ' ').split(/[\s;|\t]+/).filter(Boolean);
      // números do fim da linha = estoque e preço; o resto é o código (pode ter espaço, ex.: "ASU-001 ROXO")
      const nums = [];
      while (toks.length > 1 && nums.length < 2 && ehNumero(toks[toks.length - 1])) nums.unshift(parsePreco(limparNum(toks.pop())));
      if (!toks.length || !/[a-z]/i.test(toks.join(''))) { ignoradas++; return; }
      const codigo = arrumarCodigo(toks.join(' '));
      let estoque = null, preco = null;
      if (primeiro === 'preco') { preco = nums[0] ?? null; estoque = nums[1] ?? null; } else { estoque = nums[0] ?? null; preco = nums[1] ?? null; }
      const k = compacto(codigo);
      let i = m.has(k) ? m.get(k) : m.get(k.replace(/O/g, '0'));
      // tenta também só parte da linha (quando vem texto extra junto)
      if (i == null) {
        for (let a = 0; a < toks.length && i == null; a++) for (let n = toks.length - a; n >= 1 && i == null; n--) {
          const kk = compacto(toks.slice(a, a + n).join(''));
          if (kk.length >= 4) i = m.has(kk) ? m.get(kk) : m.get(kk.replace(/O/g, '0'));
        }
      }
      if (i != null) achados.set(i, { i, preco, estoque, lido: codigo });
      else novos.set(k, { codigo: codigo.toUpperCase(), preco, estoque, sugestoes: parecidos(codigo) });
    });
    return { itens: [...achados.values()], naoEncontrados: [...novos.values()], ignoradas };
  }

  // lembrar a ordem das colunas que o chefe usa
  $('#colNum1').value = guarda.ler('aiker-colunas') || 'estoque';
  $('#colNum1').addEventListener('change', e => guarda.gravar('aiker-colunas', e.target.value));

  let previaPrecos = [], previaNovos = [];
  function calcMudanca(x, p) {
    const novoEsg = x.estoque == null ? !!p.esgotado : x.estoque <= 0;
    const novoPreco = x.preco == null ? p.preco : x.preco;
    const muda = novoEsg !== !!p.esgotado || (novoPreco != null && Math.abs((p.preco ?? -1) - novoPreco) > 0.001) || (x.estoque != null && x.estoque !== p.estoque);
    // preço que mudou demais costuma ser erro de leitura do print (ex.: 15,00 lido como 150,0)
    const variacao = p.preco > 0 && novoPreco != null && Math.abs(p.preco - novoPreco) > 0.001 ? novoPreco / p.preco - 1 : 0;
    const estranho = (novoPreco != null && novoPreco <= 0) || variacao >= 0.5 || variacao <= -0.4;
    return { novoEsg, novoPreco, muda, variacao, estranho };
  }
  $('#btnAnalisar').addEventListener('click', () => {
    const t = $('#txtPrecos').value;
    if (!t.trim()) { toast('Cole o texto ou envie o print primeiro.', true); return; }
    const { itens, naoEncontrados } = analisarTexto(t, $('#colNum1').value);
    previaPrecos = itens.map(x => { const p = E.produtos[x.i]; const c = calcMudanca(x, p); return { ...x, p, ...c, marcado: c.muda && !c.estranho }; });
    // sem código igual: sugere o mais parecido (se houver), senão deixa para decidir
    previaNovos = naoEncontrados.map(x => {
      const [s1, s2] = x.sugestoes;
      const certeza = s1 && s1.dist <= 0.7 && (!s2 || s2.dist - s1.dist >= 0.5);
      return { ...x, certeza, acao: certeza ? 'p' + s1.i : 'ignorar' };
    });
    desenharPrevia();
    const pv = $('#previa').getBoundingClientRect();
    if (pv.top < 64 || pv.top > innerHeight - 120) $('#previa').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#previa').animate([{ opacity: .4 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' });
  });

  function linhaNovo(x, k) {
    const opcoes = [
      ...x.sugestoes.map(s => `<option value="p${s.i}" ${x.acao === 'p' + s.i ? 'selected' : ''}>É o ${esc(E.produtos[s.i].codigo)} (${esc(A.bonito(E.produtos[s.i].nome))})</option>`),
      `<option value="novo" ${x.acao === 'novo' ? 'selected' : ''}>Criar produto novo</option>`,
      `<option value="ignorar" ${x.acao === 'ignorar' ? 'selected' : ''}>Ignorar esta linha</option>`,
    ].join('');
    return `<tr>
      <td><b>${esc(x.codigo)}</b><br><small>${x.certeza ? 'diferença só de leitura, conferir' : x.sugestoes.length ? 'código parecido no catálogo' : 'não existe no catálogo'}</small></td>
      <td>${x.preco != null ? brl(x.preco) : '—'}</td>
      <td>${x.estoque != null ? x.estoque : '—'}</td>
      <td><select class="sel-novo" data-n="${k}" aria-label="O que fazer com ${esc(x.codigo)}">${opcoes}</select></td>
    </tr>`;
  }

  function desenharPrevia() {
    const contaAplicar = () => previaPrecos.filter(x => x.marcado).length + previaNovos.filter(x => x.acao !== 'ignorar').length;
    const muda = previaPrecos.filter(x => x.muda).length;
    const esg = previaPrecos.filter(x => x.muda && x.novoEsg && !x.p.esgotado).length;
    const volta = previaPrecos.filter(x => x.muda && !x.novoEsg && x.p.esgotado).length;
    const estranhos = previaPrecos.filter(x => x.estranho).length;
    if (!previaPrecos.length && !previaNovos.length) {
      $('#previa').innerHTML = '<p class="vazio-txt">Não encontrei nenhuma linha com código e números. Confira o texto.</p>';
      return;
    }
    $('#previa').innerHTML = `
      <div class="resumo">
        <span class="chip ok">${previaPrecos.length} encontrados</span>
        <span class="chip">${muda} com mudança</span>
        ${esg ? `<span class="chip esg">${esg} vão esgotar</span>` : ''}
        ${volta ? `<span class="chip ok">${volta} voltam ao estoque</span>` : ''}
        ${previaNovos.length ? `<span class="chip ruim">${previaNovos.length} não encontrados</span>` : ''}
        ${estranhos ? `<span class="chip ruim">${estranhos} preço${estranhos === 1 ? '' : 's'} para conferir</span>` : ''}
      </div>
      ${estranhos ? `<p class="aviso-estranho"><b>Atenção:</b> ${estranhos === 1 ? 'um preço mudou' : estranhos + ' preços mudaram'} muito em relação ao atual (destacado${estranhos === 1 ? '' : 's'} em vermelho). Pode ser erro de leitura do print. ${estranhos === 1 ? 'Ele ficou desmarcado' : 'Eles ficaram desmarcados'}: confira e marque só se estiver certo.</p>` : ''}
      ${previaNovos.length ? `<div class="bloco-novos">
        <p class="bloco-tit">Códigos que não estão iguais no catálogo</p>
        <p class="dica">Pode ser produto novo ou o código escrito um pouco diferente (espaço, traço, letra). Escolha o que fazer com cada um.</p>
        <p><button type="button" class="btn btn-claro btn-p" id="todosNovos">Marcar os que não existem como produto novo</button></p>
        <div class="rolagem"><table><thead><tr><th>Código recebido</th><th>Preço</th><th>Estoque</th><th>O que fazer</th></tr></thead>
        <tbody>${previaNovos.map(linhaNovo).join('')}</tbody></table></div>
      </div>` : ''}
      ${previaPrecos.length ? `<p class="bloco-tit">Produtos encontrados</p><div class="rolagem"><table>
        <thead><tr><th></th><th>Produto</th><th>Preço</th><th>Situação</th></tr></thead>
        <tbody>${previaPrecos.map((x, k) => {
          const dp = x.novoPreco != null && Math.abs((x.p.preco ?? -1) - x.novoPreco) > 0.001;
          return `<tr class="${x.muda ? '' : 'igual'}${x.estranho ? ' estranho' : ''}">
            <td><input type="checkbox" data-k="${k}" ${x.marcado ? 'checked' : ''} ${x.muda ? '' : 'disabled'}></td>
            <td><b>${esc(x.p.codigo)}</b><br><small>${esc(A.bonito(x.p.nome))}</small></td>
            <td>${dp ? `<span class="de">${brl(x.p.preco)}</span><span class="para ${x.novoPreco > (x.p.preco || 0) ? 'sobe' : 'desce'}">${brl(x.novoPreco)}</span>${x.estranho ? `<br><span class="chip ruim">Confira: ${x.novoPreco <= 0 ? 'preço zerado' : (x.variacao > 0 ? '+' : '') + Math.round(x.variacao * 100) + '%'}</span>` : ''}` : brl(x.p.preco)}</td>
            <td>${x.novoEsg !== !!x.p.esgotado ? (x.novoEsg ? '<span class="chip esg">Vai esgotar</span>' : '<span class="chip ok">Volta ao estoque</span>') : (x.novoEsg ? 'Esgotado' : 'Disponível')}${x.estoque != null ? `<br><small>estoque ${x.estoque}</small>` : ''}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : ''}
      <button class="btn btn-escuro largo" type="button" id="btnAplicar"></button>`;
    const contar = () => { const n = contaAplicar(); const b = $('#btnAplicar'); b.disabled = !n; b.textContent = `Aplicar ${n} alteraç${n === 1 ? 'ão' : 'ões'}`; };
    contar();
    const bt = $('#todosNovos');
    if (bt) bt.onclick = () => { previaNovos.forEach(x => { if (!x.sugestoes.length) x.acao = 'novo'; }); $$('.sel-novo').forEach(s => { const x = previaNovos[+s.dataset.n]; s.value = x.acao; }); contar(); };
    $('#previa').onchange = e => {
      const k = e.target.dataset.k, n = e.target.dataset.n;
      if (k != null) previaPrecos[+k].marcado = e.target.checked;
      if (n != null) previaNovos[+n].acao = e.target.value;
      contar();
    };
    $('#btnAplicar').onclick = () => {
      const sel = previaPrecos.filter(x => x.marcado);
      const vinc = previaNovos.filter(x => x.acao.startsWith('p'));
      const criar = previaNovos.filter(x => x.acao === 'novo');
      lembrar('Atualização de preços (' + (sel.length + vinc.length + criar.length) + ')');
      const tocados = [];
      sel.forEach(x => { x.p.preco = x.novoPreco; x.p.esgotado = x.novoEsg; if (x.estoque != null) x.p.estoque = x.estoque; tocados.push(x.p.codigo); });
      vinc.forEach(x => { const p = E.produtos[+x.acao.slice(1)]; const c = calcMudanca(x, p); p.preco = c.novoPreco; p.esgotado = c.novoEsg; if (x.estoque != null) p.estoque = x.estoque; tocados.push(p.codigo); });
      const existentes = new Set(E.produtos.map(p => compacto(p.codigo)));
      let criados = 0;
      criar.forEach(x => {
        if (existentes.has(compacto(x.codigo))) return;
        E.produtos.push({ codigo: x.codigo, categoria: 'Novos produtos', nome: x.codigo, preco: x.preco, promo: null, pcs: '', esgotado: x.estoque != null && x.estoque <= 0, estoque: x.estoque, ativo: false, destaque: false, specs: [], fotos: [] });
        existentes.add(compacto(x.codigo));
        tocados.push(x.codigo);
        criados++;
      });
      alterado(tocados);
      preencherFiltros();
      desenharProdutos();
      desenharCategorias();
      const n = sel.length + vinc.length;
      $('#previa').innerHTML = `<div class="feito">${ICO_OK}<p><b>${n} produto${n === 1 ? '' : 's'} atualizado${n === 1 ? '' : 's'}${criados ? ` e ${criados} produto${criados === 1 ? '' : 's'} novo${criados === 1 ? '' : 's'} criado${criados === 1 ? '' : 's'}` : ''}.</b> Eles aparecem em amarelo na lista de produtos.${criados ? ' Os novos ficam <b>ocultos</b> na categoria <b>Novos produtos</b>: complete nome, foto, caixa e categoria e ligue "Visível".' : ''} Quando terminar, clique em <b>Publicar</b>.</p></div>`;
      $('#txtPrecos').value = '';
      toast(`${n} atualizado${n === 1 ? '' : 's'}${criados ? `, ${criados} novo${criados === 1 ? '' : 's'}` : ''}`);
    };
  }

  // OCR do print
  // prepara a imagem: aumenta 3x, tons de cinza e contraste alto (melhora muito fontes pequenas/serifadas)
  function prepararImagem(arq) {
    return new Promise((ok, falha) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.max(1, Math.min(3, 2400 / Math.max(img.naturalWidth, img.naturalHeight)));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        const x = c.getContext('2d');
        x.imageSmoothingQuality = 'high';
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, 0, 0, c.width, c.height);
        const d = x.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < d.data.length; i += 4) {
          const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
          const v = g < 165 ? 0 : 255;
          d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
        }
        x.putImageData(d, 0, 0);
        URL.revokeObjectURL(img.src);
        ok(c);
      };
      img.onerror = () => falha(new Error('não consegui abrir a imagem'));
      img.src = URL.createObjectURL(arq);
    });
  }
  async function lerPrint(arq) {
    const st = $('#ocrStatus');
    st.innerHTML = 'Preparando a leitura do print…<div class="barra-prog"><i style="width:5%"></i></div>';
    let worker;
    try {
      await carregarScript(OCR_URL);
      const barra = () => $('.barra-prog i', st);
      const imagem = await prepararImagem(arq);
      worker = await window.Tesseract.createWorker('eng', 1, {
        workerPath: VENDOR + 'ocr/worker.min.js', corePath: VENDOR + 'ocr/', langPath: VENDOR + 'ocr/',
        logger: m => { if (m.status === 'recognizing text' && barra()) { barra().style.width = Math.round(10 + m.progress * 90) + '%'; st.firstChild.textContent = 'Lendo o print… '; } },
      });
      // só os caracteres que aparecem em códigos e números; uma linha por produto
      await worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.,/ ', tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
      const res = await worker.recognize(imagem);
      const texto = res.data.text.split('\n').map(l => l.trim()).filter(Boolean).join('\n');
      $('#txtPrecos').value = ($('#txtPrecos').value ? $('#txtPrecos').value + '\n' : '') + texto;
      st.textContent = 'Pronto. Confira o texto abaixo (a leitura automática pode errar) e clique em Analisar.';
    } catch (e) {
      st.textContent = 'Não consegui ler o print: ' + e.message;
    } finally {
      if (worker) worker.terminate();
    }
  }
  ligarSoltar('#soltarPrint', '#arqPrint', fs => lerPrint(fs[0]));
  document.addEventListener('paste', e => {
    if ($('#aba-precos').hidden) return;
    const img = [...(e.clipboardData || {}).items || []].find(i => i.type.startsWith('image/'));
    if (img) { e.preventDefault(); lerPrint(img.getAsFile()); }
  });

  // ================= planilha =================
  // datas da planilha: AAAA-MM-DD <-> DD/MM/AAAA (também aceita a data "número" do Excel)
  const dataBR = iso => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('/') : '');
  function dataISO(v) {
    if (v == null || String(v).trim() === '') return '';
    if (typeof v === 'number' && v > 20000) { const d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 10); }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (m) { const ano = m[3].length === 2 ? '20' + m[3] : m[3]; return ano + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
    return '';
  }
  const COLS = ['CODIGO', 'CATEGORIA', 'NOME', 'PRECO', 'PRECO PROMO', 'PROMO INICIO', 'PROMO FIM', 'PCS/CX', 'ESGOTADO', 'ESTOQUE', 'ATIVO', 'DESTAQUE'];
  function montarPlanilha(semPreco) {
      const cab = [...COLS, ...Array.from({ length: MAX_SPECS }, (_, k) => 'ESPEC ' + (k + 1)), ...Array.from({ length: MAX_FOTOS }, (_, k) => 'FOTO ' + (k + 1))];
      const linhas = E.produtos.map(p => [
        p.codigo, p.categoria, p.nome, p.preco ?? '', p.promo ?? '', dataBR(p.promoDe), dataBR(p.promoAte), p.pcs ?? '', p.esgotado ? 'SIM' : 'NÃO', p.estoque ?? '', p.ativo === false ? 'NÃO' : 'SIM', p.destaque ? 'SIM' : 'NÃO',
        ...Array.from({ length: MAX_SPECS }, (_, k) => (p.specs || [])[k] || ''), ...Array.from({ length: MAX_FOTOS }, (_, k) => (p.fotos || [])[k] || ''),
      ]);
      // "sem preços": tira as colunas de valor (se a planilha voltar, os preços do painel não mudam)
      const fica = cab.map((h, k) => (semPreco && /^(PRECO|PRECO PROMO|PROMO INICIO|PROMO FIM)$/.test(h) ? -1 : k)).filter(k => k >= 0);
      const cab2 = fica.map(k => cab[k]);
      const ws = XLSX.utils.aoa_to_sheet([cab2, ...linhas.map(l => fica.map(k => l[k]))]);
      ws['!cols'] = cab2.map(h => ({ wch: h === 'NOME' ? 42 : h.startsWith('ESPEC') ? 34 : h.startsWith('FOTO') ? 24 : h === 'CATEGORIA' ? 26 : 12 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'PRODUTOS');
      return wb;
  }
  $('#btnExportar').addEventListener('click', async () => {
    try {
      await carregarScript(XLSX_URL);
      const semPreco = $('#expSemPreco').checked;
      XLSX.writeFile(montarPlanilha(semPreco), `catalogo-aiker-${semPreco ? 'sem-precos-' : ''}${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`);
    } catch (e) { toast(e.message, true); }
  });

  let importacao = null;
  ligarSoltar('#soltarPlanilha', '#arqPlanilha', fs => lerPlanilha(fs[0]));
  $$('input[name="modo"]').forEach(r => r.addEventListener('change', () => { if (importacao) previaImport(); }));

  async function lerPlanilha(arq) {
    $('#previaImport').innerHTML = '<p class="ocr">Lendo a planilha…</p>';
    try {
      await carregarScript(XLSX_URL);
      const wb = XLSX.read(await arq.arrayBuffer(), { type: 'array' });
      const nomeAba = wb.SheetNames.find(n => norm(n) === 'PRODUTOS') || wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { header: 1, raw: true, defval: '' });
      // acha a linha do cabeçalho (a primeira que tem CODIGO)
      const iCab = rows.findIndex(r => r.some(c => norm(c) === 'CODIGO' || norm(c) === 'COD' || norm(c) === 'CÓDIGO'));
      if (iCab < 0) throw new Error('Não encontrei a coluna CODIGO na planilha.');
      const cab = rows[iCab].map(h => norm(h).replace(/^COD$/, 'CODIGO').replace(/^PRECO UNITARIO$|^PRECO UN\.?$|^VALOR$/, 'PRECO').replace(/^PROMO(CAO)?$|^PRECO PROMOCIONAL$/, 'PRECO PROMO').replace(/^PCS ?CX$|^PCS$|^QTD ?CX$|^CAIXA$/, 'PCS/CX').replace(/^(PROMO(CAO)? )?(INICIO|DE|COMECA)( PROMO(CAO)?)?$/, 'PROMO INICIO').replace(/^(PROMO(CAO)? )?(FIM|ATE|TERMINA)( PROMO(CAO)?)?$/, 'PROMO FIM'));
      const linhas = rows.slice(iCab + 1).filter(r => String(r[cab.indexOf('CODIGO')] || '').trim());
      importacao = { cab, linhas, nomeArq: arq.name };
      previaImport();
    } catch (e) {
      $('#previaImport').innerHTML = `<p class="erro">${esc(e.message)}</p>`;
    }
  }

  function simNao(v) { const s = norm(v); if (!s) return null; if (/^(S|SIM|X|1|TRUE|VERDADEIRO|Y|YES)$/.test(s)) return true; if (/^(N|NAO|0|FALSE|FALSO|NO)$/.test(s)) return false; return null; }

  function linhaParaParcial(cab, r) {
    const o = {}; const col = n => cab.indexOf(n);
    const v = n => (col(n) >= 0 ? r[col(n)] : undefined);
    o.codigo = String(v('CODIGO')).trim();
    if (v('CATEGORIA') !== undefined && String(v('CATEGORIA')).trim()) o.categoria = String(v('CATEGORIA')).trim();
    if (v('NOME') !== undefined && String(v('NOME')).trim()) o.nome = String(v('NOME')).trim();
    if (v('PRECO') !== undefined && String(v('PRECO')).trim() !== '') o.preco = typeof v('PRECO') === 'number' ? v('PRECO') : parsePreco(v('PRECO'));
    if (v('PRECO PROMO') !== undefined) { const t = String(v('PRECO PROMO')).trim(); o.promo = t === '' ? null : (typeof v('PRECO PROMO') === 'number' ? v('PRECO PROMO') : parsePreco(t)); }
    if (v('PROMO INICIO') !== undefined) o.promoDe = dataISO(v('PROMO INICIO'));
    if (v('PROMO FIM') !== undefined) o.promoAte = dataISO(v('PROMO FIM'));
    if (v('PCS/CX') !== undefined && String(v('PCS/CX')).trim() !== '') o.pcs = String(v('PCS/CX')).trim();
    ['ESGOTADO', 'ATIVO', 'DESTAQUE'].forEach(h => { const b = simNao(v(h)); if (b != null) o[h.toLowerCase()] = b; });
    if (v('ESTOQUE') !== undefined && String(v('ESTOQUE')).trim() !== '') { const n = parsePreco(v('ESTOQUE')); if (n != null) { o.esgotado = n <= 0; o.estoque = Math.round(n); } }
    const specs = []; let temSpec = false;
    for (let k = 1; k <= MAX_SPECS; k++) if (col('ESPEC ' + k) >= 0) { temSpec = true; const s = String(v('ESPEC ' + k)).trim(); if (s) specs.push(s); }
    if (temSpec) o.specs = specs;
    const fotos = []; let temFoto = false;
    for (let k = 1; k <= 12; k++) if (col('FOTO ' + k) >= 0) { temFoto = true; const s = String(v('FOTO ' + k)).trim(); if (s) fotos.push(s); }
    if (temFoto) o.fotos = fotos;
    return o;
  }

  function previaImport() {
    const { cab, linhas, nomeArq } = importacao;
    const modo = $('input[name="modo"]:checked').value;
    const porCod = new Map(E.produtos.map((p, i) => [norm(p.codigo), i]));
    const parciais = linhas.map(r => linhaParaParcial(cab, r));
    let novos = 0, alterados = 0, iguais = 0;
    const semNome = [];
    parciais.forEach(o => {
      const i = porCod.get(norm(o.codigo));
      if (i == null) { novos++; if (!o.nome) semNome.push(o.codigo); return; }
      const p = E.produtos[i];
      const vazio = v => (v === undefined || v === null || v === '' ? null : v); // "sem data" e "célula vazia" são a mesma coisa
      const muda = Object.keys(o).some(k => k !== 'codigo' && JSON.stringify(vazio(o[k])) !== JSON.stringify(vazio(p[k])));
      muda ? alterados++ : iguais++;
    });
    const naPlanilha = new Set(parciais.map(o => norm(o.codigo)));
    const removidos = modo === 'substituir' ? E.produtos.filter(p => !naPlanilha.has(norm(p.codigo))).length : 0;
    const usadas = cab.filter(h => COLS.includes(h) || h === 'ESTOQUE' || /^(ESPEC|FOTO) \d+$/.test(h));
    $('#previaImport').innerHTML = `
      <div class="previa"><div class="resumo">
        <span class="chip">${esc(nomeArq)}</span>
        <span class="chip">${parciais.length} linhas</span>
        <span class="chip ok">${alterados} alterados</span>
        <span class="chip ok">${novos} novos</span>
        <span class="chip">${iguais} sem mudança</span>
        ${removidos ? `<span class="chip ruim">${removidos} serão removidos</span>` : ''}
      </div></div>
      <p class="dica">Colunas usadas: ${usadas.map(esc).join(', ') || 'nenhuma'}.</p>
      ${semNome.length ? `<p class="erro">Produtos novos sem NOME não serão criados: ${semNome.slice(0, 10).map(esc).join(', ')}${semNome.length > 10 ? '…' : ''}</p>` : ''}
      <button class="btn btn-escuro largo" type="button" id="btnImportar" ${alterados + novos + removidos ? '' : 'disabled'}>Aplicar planilha</button>`;
    $('#btnImportar').onclick = () => {
      const fazer = () => {
        lembrar('Planilha ' + nomeArq);
        const tocados = [];
        if (modo === 'substituir') {
          E.produtos = parciais.filter(o => o.nome || porCod.has(norm(o.codigo))).map(o => {
            const i = porCod.get(norm(o.codigo));
            const base = i != null ? E.produtos[i] : { preco: null, promo: null, pcs: '', esgotado: false, ativo: true, destaque: false, specs: [], fotos: [], categoria: 'Outros' };
            tocados.push(o.codigo);
            return { ...base, ...o };
          });
        } else {
          parciais.forEach(o => {
            const i = porCod.get(norm(o.codigo));
            if (i != null) { Object.assign(E.produtos[i], o); tocados.push(o.codigo); } else if (o.nome) {
              E.produtos.push({ preco: null, promo: null, pcs: '', esgotado: false, ativo: true, destaque: false, specs: [], fotos: [], categoria: 'Outros', ...o });
              tocados.push(o.codigo);
            }
          });
        }
        importacao = null;
        preencherFiltros();
        desenharProdutos();
        alterado(tocados);
        $('#previaImport').innerHTML = `<div class="feito">${ICO_OK}<p><b>Planilha aplicada (${tocados.length} produtos).</b> Confira na aba Produtos e depois clique em <b>Publicar</b>.</p></div>`;
        toast('Planilha aplicada');
      };
      if (modo === 'substituir') confirmar('Substituir o catálogo inteiro?', `${removidos} produto(s) que não estão na planilha serão removidos.`, 'Substituir', fazer);
      else fazer();
    };
  }

  // ================= link do catálogo =================
  function desenharLink() {
    $('#linkCatalogo').value = urlCatalogo();
    $('#btnAbrirLink').href = urlCatalogo();
    atualizarMsgGrupo();
  }
  function atualizarMsgGrupo() {
    const data = E.publicadoEm ? E.publicadoEm.split(' ')[0] : new Date().toLocaleDateString('pt-BR');
    $('#msgGrupo').value = `*Catálogo Aiker atualizado em ${data}*

${urlCatalogo()}`;
  }
  $('#btnCopiarLink').addEventListener('click', async () => toast(await copiar(urlCatalogo()) ? 'Link copiado' : 'Não foi possível copiar', false));
  $('#btnCopiarMsg').addEventListener('click', async () => toast(await copiar($('#msgGrupo').value) ? 'Mensagem copiada. Cole no grupo dos vendedores.' : 'Não foi possível copiar'));

  // ================= fotos em lote (o nome do arquivo diz o produto) =================
  // aceita: ACV-120.jpg, ACV-120-2.jpg, ACV-120_2.png, "ACV-120 (2).jpg", "acv120 3.webp"
  function produtoDoArquivo(nome) {
    const base = nome.replace(/\.[^.]+$/, '').trim();
    const m = new Map(E.produtos.map((p, i) => [compacto(p.codigo), i]));
    const tenta = s => { const k = compacto(s); return m.has(k) ? m.get(k) : null; };
    let i = tenta(base);
    let ordem = 1;
    if (i == null) {
      const mm = base.match(/^(.*?)[\s_\-(]*\(?(\d{1,2})\)?$/);
      if (mm && (i = tenta(mm[1])) != null) ordem = +mm[2];
    }
    return i == null ? null : { i, ordem };
  }
  function abrirLote(arquivos) {
    const lista = [...arquivos].filter(f => f.type.startsWith('image/'));
    const grupos = new Map(); const sem = [];
    lista.forEach(f => {
      const r = produtoDoArquivo(f.name);
      if (!r) { sem.push(f.name); return; }
      if (!grupos.has(r.i)) grupos.set(r.i, []);
      grupos.get(r.i).push({ f, ordem: r.ordem });
    });
    grupos.forEach(l => l.sort((a, b) => a.ordem - b.ordem || a.f.name.localeCompare(b.f.name)));
    const m = modal(`<h2>Fotos em lote</h2>
      <p><b>${lista.length}</b> imagem(ns) · <b>${grupos.size}</b> produto(s) reconhecido(s)${sem.length ? ` · <b>${sem.length}</b> sem produto` : ''}.</p>
      <div class="ajuste-previa"><table><thead><tr><th>Produto</th><th class="n">Fotos</th></tr></thead><tbody>
        ${[...grupos].map(([i, l]) => `<tr><td><b>${esc(E.produtos[i].codigo)}</b> ${esc(A.bonito(E.produtos[i].nome))}</td><td class="n">${l.length}</td></tr>`).join('')}
        ${sem.map(n => `<tr><td colspan="2" class="erro" style="margin:0">${esc(n)}: nome não corresponde a nenhum código</td></tr>`).join('')}
      </tbody></table></div>
      <fieldset class="modo" style="margin-top:12px">
        <label><input type="radio" name="loteModo" value="trocar" checked> <b>Substituir as fotos atuais</b><span>Recomendado para trocar as fotos pequenas por originais em alta resolução.</span></label>
        <label><input type="radio" name="loteModo" value="somar"> <b>Adicionar às fotos atuais</b><span>Mantém as fotos que já existem e coloca as novas depois.</span></label>
      </fieldset>
      <p class="ocr" id="loteStatus"></p>
      <div class="acoes"><button class="btn btn-claro" type="button" data-n>Cancelar</button><button class="btn btn-escuro" type="button" data-s ${grupos.size ? '' : 'disabled'}>Enviar fotos</button></div>`);
    $('[data-n]', m).onclick = () => m.close();
    $('[data-s]', m).onclick = async () => {
      const b = $('[data-s]', m); b.disabled = true; $('[data-n]', m).disabled = true;
      const trocar = $('input[name="loteModo"]:checked', m).value === 'trocar';
      lembrar('Fotos em lote (' + grupos.size + ' produtos)');
      const total = lista.length - sem.length; let feito = 0; const tocados = [];
      try {
        for (const [i, l] of grupos) {
          const p = E.produtos[i];
          const urls = [];
          for (const { f } of l) {
            $('#loteStatus', m).textContent = `Enviando ${++feito} de ${total}… (${p.codigo})`;
            urls.push(await enviarImagem(f, p.codigo, 2000));
          }
          p.fotos = (trocar ? urls : [...(p.fotos || []), ...urls]).slice(0, MAX_FOTOS);
          tocados.push(p.codigo);
        }
        m.close();
        alterado(tocados);
        desenharProdutos();
        toast(`Fotos enviadas para ${tocados.length} produto(s)`);
      } catch (e) {
        $('#loteStatus', m).textContent = 'Parou com erro: ' + e.message + '. O que já foi enviado foi mantido.';
        if (tocados.length) { alterado(tocados); desenharProdutos(); }
        $('[data-n]', m).disabled = false; $('[data-n]', m).textContent = 'Fechar';
      }
    };
  }
  $('#arqLote').addEventListener('change', e => { if (e.target.files.length) abrirLote(e.target.files); e.target.value = ''; });

  // ================= vendedores (login da área do vendedor) =================
  let vendedores = [];
  async function carregarVendedores() {
    try { vendedores = (await api('vendedores')).vendedores || []; desenharVendedores(); } catch (e) { toast(e.message, true); }
  }
  function desenharVendedores() {
    const url = new URL('vendedor.html', location.href).href;
    $('#linkVendedor').value = url;
    $('#listaVend').innerHTML = vendedores.length ? vendedores.map(v => `<li class="vend-item">
        <span class="vend-av">${esc((v.nome.trim()[0] || '?').toUpperCase())}</span>
        <div class="vend-info"><b>${esc(v.nome)}</b><small>usuário <code>${esc(v.login)}</code>${v.contato ? ' · ' + esc(v.contato) : ''}${v.email ? ' · ' + esc(v.email) : ''}</small></div>
        <button type="button" class="btn btn-claro btn-p" data-editar-vend="${esc(v.id)}">Editar</button>
        <button type="button" class="btn-texto perigo" data-remover-vend="${esc(v.id)}">Remover</button>
      </li>`).join('') : '<li class="vazio"><strong>Nenhum vendedor cadastrado</strong><span>Cadastre o primeiro acima.</span></li>';
  }
  function formVendedor(v) {
    const novo = !v;
    v = v || { nome: '', login: '', contato: '', email: '' };
    const m = modal(`<h2>${novo ? 'Novo vendedor' : 'Editar vendedor'}</h2>
      <div class="grade2">
        <label class="campo inteiro">Nome<input id="vNome" value="${esc(v.nome)}" autocomplete="off"></label>
        <label class="campo">Usuário (para entrar)<input id="vLogin" value="${esc(v.login)}" autocomplete="off" placeholder="ex.: ana"></label>
        <label class="campo">${novo ? 'Senha' : 'Nova senha (deixe vazio para manter)'}<input id="vSenha" type="password" autocomplete="new-password"></label>
        <label class="campo">Telefone / WhatsApp<input id="vContato" value="${esc(v.contato)}" inputmode="tel"></label>
        <label class="campo">E-mail<input id="vEmail" value="${esc(v.email)}" type="email"></label>
      </div>
      <p class="dica">O nome, telefone e e-mail saem na proposta comercial que o vendedor gerar.</p>
      <p class="erro" id="vErro"></p>
      <div class="acoes"><button class="btn btn-claro" type="button" data-n>Cancelar</button><button class="btn btn-escuro" type="button" data-s>${novo ? 'Cadastrar' : 'Salvar'}</button></div>`);
    $('#vNome', m).focus();
    $('#vNome', m).addEventListener('input', e => { if (novo && !$('#vLogin', m).dataset.mexido) $('#vLogin', m).value = slug(e.target.value.split(' ')[0]); });
    $('#vLogin', m).addEventListener('input', e => { e.target.dataset.mexido = '1'; });
    $('[data-n]', m).onclick = () => m.close();
    $('[data-s]', m).onclick = async () => {
      const b = $('[data-s]', m);
      b.disabled = true;
      try {
        const r = await api('salvarVendedor', { vendedor: { id: v.id, nome: $('#vNome', m).value, login: $('#vLogin', m).value, contato: $('#vContato', m).value, email: $('#vEmail', m).value, novaSenha: $('#vSenha', m).value } });
        vendedores = r.vendedores;
        desenharVendedores();
        m.close();
        toast(novo ? 'Vendedor cadastrado' : 'Vendedor salvo');
      } catch (e) { $('#vErro', m).textContent = e.message; b.disabled = false; }
    };
  }
  $('#btnNovoVend').addEventListener('click', () => formVendedor());
  $('#listaVend').addEventListener('click', e => {
    const ed = e.target.closest('[data-editar-vend]');
    if (ed) formVendedor(vendedores.find(v => v.id === ed.dataset.editarVend));
    const rm = e.target.closest('[data-remover-vend]');
    if (rm) {
      const v = vendedores.find(x => x.id === rm.dataset.removerVend);
      confirmar('Remover vendedor?', `<b>${esc(v.nome)}</b> não vai mais conseguir entrar na área do vendedor.`, 'Remover', async () => {
        try { vendedores = (await api('removerVendedor', { id: v.id })).vendedores; desenharVendedores(); toast('Vendedor removido'); } catch (err) { toast(err.message, true); }
      });
    }
  });
  $('#btnCopiarLinkVend').addEventListener('click', async () => toast(await copiar($('#linkVendedor').value) ? 'Link da área do vendedor copiado' : 'Não foi possível copiar'));

  // ================= configurações =================
  const CAMPOS_CFG = { cPromoAtiva: 'promoAtiva', cPromoTitulo: 'promoTitulo', cPromoTexto: 'promoTexto', cPromoObs: 'promoObs', cPromoValidade: 'promoValidade', cTelefone: 'telefone', cEmail: 'email', cHeroTitulo: 'heroTitulo', cHeroTexto: 'heroTexto', cPdfPromo: 'pdfPromo', cPdfEsgotados: 'pdfEsgotados', cPromoInicio: 'promoInicio', cPromoFim: 'promoFim', cEstoqueAlertaCx: 'estoqueAlertaCx' };
  function preencherConfig() {
    Object.entries(CAMPOS_CFG).forEach(([id, k]) => {
      const el = $('#' + id);
      if (el.type === 'checkbox') el.checked = /^pdf/.test(k) ? E.config[k] !== false : !!E.config[k];
      else if (k === 'estoqueAlertaCx') el.value = String(E.config[k] ?? 2);
      else el.value = E.config[k] || '';
    });
    desenharCapas();
  }
  const CAPAS = [
    { campo: 'capaPromoPdf', titulo: 'Capa da promoção', onde: '1ª página do PDF (aparece quando "Capa da promoção" está marcada)', padrao: 'img/capa-promo.webp', forma: 'a4', max: 3508, tam: '2480 × 3508 pixels (A4 em pé)', prop: 210 / 297 },
    { campo: 'capaNovidadesPdf', titulo: 'Capa das novidades', onde: '1ª página da tabela de novidades. Sem imagem, usa a capa automática com o resumo das mudanças', padrao: '', forma: 'a4', max: 3508, tam: '2480 × 3508 pixels (A4 em pé)', prop: 210 / 297 },
    { campo: 'capaPdf', titulo: 'Capa do catálogo', onde: 'Página de abertura do PDF', padrao: 'img/capa.webp', forma: 'a4', max: 3508, tam: '2480 × 3508 pixels (A4 em pé)', prop: 210 / 297 },
    { campo: 'heroImg', titulo: 'Imagem do topo do site', onde: 'Lado direito do topo do catálogo (fundo escuro combina melhor)', padrao: 'img/hero.webp', forma: 'larga', max: 2200, tam: '1800 × 1200 pixels (deitada)', prop: 3 / 2 },
  ];
  function desenharCapas() {
    $('#capas').innerHTML = CAPAS.map(c => {
      const atual = E.config[c.campo];
      return `<div class="capa-slot">
        <div class="capa-img ${c.forma}">${atual || c.padrao ? `<img src="${esc(fotoUrl(atual || c.padrao))}" alt="${esc(c.titulo)}">` : '<span class="capa-auto">Capa automática</span>'}</div>
        <div class="capa-info"><b>${c.titulo}</b><small>${c.onde}</small><span class="capa-tam">Tamanho ideal: <b>${c.tam}</b></span>
          <div class="capa-btns"><label class="btn btn-claro btn-p">Trocar imagem<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf" data-capa="${c.campo}" hidden></label>
          ${atual ? `<button type="button" class="btn-texto" data-padrao="${c.campo}">${c.padrao ? 'Voltar à original' : 'Usar capa automática'}</button>` : ''}</div></div>
      </div>`;
    }).join('');
  }
  $('#capas').addEventListener('change', async e => {
    const inp = e.target.closest('[data-capa]');
    if (!inp || !inp.files[0]) return;
    const c = CAPAS.find(x => x.campo === inp.dataset.capa);
    const arq = inp.files[0]; inp.value = '';
    let cap;
    try { toast(ehPdf(arq) ? 'Lendo o PDF…' : 'Preparando a imagem…'); cap = await prepararCapa(arq, c.max); }
    catch (err) { toast(err.message, true); return; }
    const dim = [cap.w, cap.h];
    {
      const fora = Math.abs(dim[0] / dim[1] - c.prop) / c.prop > 0.04;
      const pequena = Math.max(...dim) < c.max * 0.6;
      if ((fora || pequena) && !confirm([(cap.paginas ? 'A 1ª página do PDF vira imagem de ' : 'A imagem tem ') + dim[0] + ' × ' + dim[1] + ' pixels.', fora ? 'O formato é diferente do ideal e as bordas podem ser cortadas.' : '', pequena ? 'Ela é pequena e pode sair sem nitidez.' : '', 'Tamanho ideal: ' + c.tam + '.', '', 'Usar mesmo assim?'].filter((x, k) => x || k === 4).join(String.fromCharCode(10)))) return;
    }
    try {
      toast('Enviando em alta qualidade…');
      const nome = slug(c.campo) + '-' + slug(arq.name.replace(/.[^.]+$/, '')).slice(0, 40) + '.' + cap.ext;
      E.config[c.campo] = (await api('enviarFoto', { nome, base64: cap.base64, tipo: cap.tipo })).url;
      desenharCapas(); alterado([]);
      toast(c.titulo + ' trocada' + (cap.paginas > 1 ? ' (usada a 1ª página do PDF)' : '') + '. Clique em Publicar para aplicar.');
    } catch (err) { toast(err.message, true); }
  });
  $('#capas').addEventListener('click', e => {
    const b = e.target.closest('[data-padrao]');
    if (!b) return;
    delete E.config[b.dataset.padrao];
    desenharCapas(); alterado([]);
  });
  Object.entries(CAMPOS_CFG).forEach(([id, k]) => $('#' + id).addEventListener('input', e => {
    E.config[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    alterado([]);
  }));
  $('#btnSenha').addEventListener('click', async () => {
    const n = $('#novaSenha').value;
    if (n.length < 6) { toast('A senha precisa ter pelo menos 6 caracteres.', true); return; }
    try {
      guardarChave((await api('trocarSenha', { novaSenha: n })).token);
      $('#novaSenha').value = '';
      toast('Senha trocada');
    } catch (e) { toast(e.message, true); }
  });
  // ainda com a senha que veio de fábrica: pede uma nova antes de continuar
  function exigirNovaSenha() {
    const m = modal(`<h2>Crie a sua senha</h2>
      <p>O painel ainda usa a senha que veio de fábrica, que outras pessoas podem conhecer. Escolha uma senha só sua para proteger preços e produtos.</p>
      <label class="campo">Nova senha<input type="password" id="ns1" autocomplete="new-password" minlength="6"></label>
      <label class="campo">Repita a nova senha<input type="password" id="ns2" autocomplete="new-password"></label>
      <p class="dica">Pelo menos 6 caracteres. Anote num lugar seguro: sem ela não dá para entrar no painel.</p>
      <p class="erro-txt" id="nsErro" role="alert"></p>
      <div class="acoes"><button class="btn btn-laranja" type="button" data-s>Salvar senha</button></div>`);
    m.oncancel = e => e.preventDefault(); // não fecha com Esc
    const erro = t => { $('#nsErro', m).textContent = t; };
    $('#ns1', m).focus();
    $('[data-s]', m).onclick = async () => {
      const a = $('#ns1', m).value, b = $('#ns2', m).value;
      if (a.length < 6) return erro('A senha precisa ter pelo menos 6 caracteres.');
      if (a !== b) return erro('As duas senhas estão diferentes.');
      try {
        guardarChave((await api('trocarSenha', { novaSenha: a })).token);
        m.oncancel = null; m.close();
        toast('Senha criada. Use ela da próxima vez que entrar.');
      } catch (e) { erro(e.message); }
    };
    m.onkeydown = e => { if (e.key === 'Enter') $('[data-s]', m).click(); };
  }

  // ================= desfazer publicação (versões guardadas a cada publicação) =================
  const MOTIVOS = { publicacao: 'Publicação', 'antes-de-restaurar': 'Antes de restaurar um backup', 'antes-de-voltar': 'Antes de voltar uma versão' };
  async function abrirVersoes() {
    const m = modal('<h2>Versões anteriores</h2><p class="carregando-txt">Carregando…</p>');
    let l;
    try { l = (await api('copias')).copias || []; } catch (e) { m.close(); toast(e.message, true); return; }
    let marcouAtual = false;
    const itens = l.map(c => {
      const atual = c.igualAoAtual && !marcouAtual; if (atual) marcouAtual = true;
      return `<li class="versao ${atual ? 'atual' : ''}">
        <div><b>${esc(c.feitaEm || c.publicadoEm || c.id)}</b><small>${esc(MOTIVOS[c.motivo] || c.motivo)}${c.por ? ' por ' + esc(c.por) : ''} · ${c.produtos} produtos${c.esgotados ? ' · ' + c.esgotados + ' esgotados' : ''}</small></div>
        ${atual ? '<span class="chip ok">No ar agora</span>' : `<button class="btn btn-claro btn-p" type="button" data-voltar="${esc(c.id)}">Voltar para esta</button>`}
      </li>`;
    }).join('');
    m.innerHTML = `<h2>Versões anteriores</h2>
      ${l.length ? `<p class="dica" style="margin-top:0">O sistema guarda as 30 últimas. Ao voltar, o catálogo e o painel ficam exatamente como estavam naquela versão (o estado de agora também é guardado, então dá para desfazer).</p><ul class="versoes">${itens}</ul>` : '<p>Ainda não há versões guardadas. Elas começam a ser guardadas na próxima vez que você publicar.</p>'}
      <div class="acoes"><button class="btn btn-claro" type="button" data-n>Fechar</button></div>`;
    $('[data-n]', m).onclick = () => m.close();
    m.onclick = async e => {
      const b = e.target.closest('[data-voltar]');
      if (!b) return;
      if (!confirm('Voltar o catálogo e o painel para esta versão? O catálogo dos clientes muda na hora.')) return;
      b.disabled = true; b.textContent = 'Voltando…';
      try {
        clearTimeout(tSalvar);
        await api('voltarCopia', { id: b.dataset.voltar });
        E.mudou.clear(); guarda.gravar('aiker-mudou', '[]');
        m.close(); toast('Pronto: voltou para a versão escolhida');
        setTimeout(() => location.reload(), 900);
      } catch (err) { toast('Não foi possível voltar: ' + err.message, true); b.disabled = false; b.textContent = 'Voltar para esta'; }
    };
  }
  $('#btnVersoes').addEventListener('click', abrirVersoes);

  // ================= backup automático (feito pelo servidor uma vez por dia) =================
  E.backupAuto = null;
  function mostrarBackupAuto(c) {
    E.backupAuto = c;
    $('#baAtivo').checked = !!c.ativo;
    $('#baPasta').value = c.pasta || '';
    $('#baStatus').textContent = c.erro ? 'Problema no último backup automático: ' + c.erro
      : c.ativo ? (c.ultimo ? `Último backup automático: ${c.ultimo}.` : 'Ligado. O primeiro backup automático é feito hoje.')
      : 'Desligado. Lembre de baixar o backup de vez em quando.';
    $('#baStatus').classList.toggle('erro-txt', !!c.erro);
  }
  async function carregarBackupAuto() { try { mostrarBackupAuto(await api('backupAuto')); } catch (e) { /* servidor antigo */ } }
  $('#baSalvar').addEventListener('click', async () => {
    const b = $('#baSalvar'); b.disabled = true; b.textContent = 'Gravando…';
    try { const c = await api('backupAutoSalvar', { ativo: $('#baAtivo').checked, pasta: $('#baPasta').value }); mostrarBackupAuto(c); toast(c.ativo ? 'Backup gravado em ' + c.pasta : 'Backup automático desligado'); }
    catch (e) { toast(e.message, true); }
    b.disabled = false; b.textContent = 'Salvar e fazer um agora';
    desenharInicio();
  });

  // ================= pasta da atualização (criada a cada Publicar) =================
  E.pastaAtu = null;
  function mostrarPastaAtu(c) {
    E.pastaAtu = c;
    $('#paAtivo').checked = !!c.ativo;
    $('#paBase').value = c.base || '';
    $('#paPrevia').innerHTML = c.previa ? 'Hoje fica em <code>' + esc(c.previa) + '</code>' : '';
    $('#paStatus').textContent = c.erro ? 'Última vez, faltou: ' + c.erro
      : c.ultimo ? `Última pasta criada em ${c.ultimo}, com ${(c.arquivos || []).length} arquivos.`
      : c.ativo ? 'Ligado. A pasta é criada na próxima vez que você publicar.' : 'Desligado.';
    $('#paStatus').classList.toggle('erro-txt', !!c.erro);
  }
  async function carregarPastaAtu() { try { mostrarPastaAtu(await api('pastaAtualizacao')); } catch (e) { /* servidor antigo */ } }
  $('#paSalvar').addEventListener('click', async () => {
    const b = $('#paSalvar'); b.disabled = true;
    try { mostrarPastaAtu(await api('pastaAtualizacaoSalvar', { ativo: $('#paAtivo').checked, base: $('#paBase').value })); toast($('#paAtivo').checked ? 'Pronto: ao publicar, a pasta do dia é criada' : 'Pasta da atualização desligada'); }
    catch (e) { toast(e.message, true); }
    b.disabled = false;
  });
  $('#paAbrir').addEventListener('click', () => api('abrirPastaAtualizacao').catch(e => toast(e.message, true)));

  // a tabela de novidades do dia compara com a base de antes da 1ª publicação do dia;
  // depois de arquivar, a base passa a ser a tabela publicada (a próxima atualização mostra só o que mudar dali em diante)
  async function arquivarAtualizacao() {
    const hoje = new Date().toLocaleDateString('pt-BR');
    let base = await baseNovidades();
    if (base.auto && base.data === hoje && base.anterior) base = base.anterior;
    const nov = calcularNovidades(base);
    const atualizadoEm = new Date().toLocaleString('pt-BR');
    const novidades = nov.length ? { produtos: nov, config: Object.assign({}, E.config, { novidadesBase: null, atualizadoEm, modoNovidades: true, novidadesDesde: base.data }), vendedores: [] } : null;
    let xlsx = '';
    try { await carregarScript(XLSX_URL); xlsx = XLSX.write(montarPlanilha(false), { type: 'base64', bookType: 'xlsx' }); } catch (e) { /* segue sem a planilha */ }
    const c = await api('arquivarAtualizacao', { novidades, xlsx });
    const { anterior, ...semAnterior } = base;
    E.config.novidadesBase = Object.assign(fotografar(E.produtos), { auto: true, anterior: semAnterior });
    alterado([]);
    mostrarPastaAtu(Object.assign({}, E.pastaAtu, c));
    return { c, nov: nov.length };
  }

  // ================= cópia de segurança =================
  $('#btnBackup').addEventListener('click', async () => {
    const b = $('#btnBackup'); b.disabled = true; b.textContent = 'Preparando…';
    try {
      clearTimeout(tSalvar); await salvar();
      const r = await api('backup');
      const d = new Date(); const z = n => String(n).padStart(2, '0');
      const blob = new Blob([JSON.stringify(r.backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const el = document.createElement('a');
      el.href = url; el.download = `backup-catalogo-aiker-${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}.json`;
      document.body.appendChild(el); el.click(); el.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      guarda.gravar('aiker-ultimo-backup', new Date().toLocaleString('pt-BR'));
      infoBackup();
      toast('Backup baixado');
    } catch (e) { toast('Não foi possível gerar o backup: ' + e.message, true); }
    b.disabled = false; b.textContent = 'Baixar backup';
  });
  function infoBackup() {
    const u = guarda.ler('aiker-ultimo-backup');
    $('#backupInfo').textContent = u ? 'Último backup baixado neste computador: ' + u.replace(',', ' às') + '.' : 'Você ainda não baixou nenhum backup neste computador.';
  }
  infoBackup();
  $('#btnRestaurar').addEventListener('click', () => $('#arqBackup').click());
  $('#arqBackup').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    let b;
    try { b = JSON.parse(await f.text()); } catch (err) { toast('Arquivo inválido.', true); return; }
    if (!b || b.tipo !== 'backup-catalogo-aiker') { toast('Este arquivo não é um backup do catálogo.', true); return; }
    const m = modal(`<h2>Restaurar backup?</h2>
      <p>Backup de <b>${esc(b.geradoEm || '?')}</b> com <b>${(b.rascunho.produtos || []).length}</b> produtos.</p>
      <p class="dica">Tudo o que está no painel agora será trocado pelo conteúdo do backup (produtos, configurações, vendedores e o catálogo publicado). Antes de trocar, o sistema guarda uma cópia do estado atual na pasta <code>dados-dev/copias</code>.</p>
      <div class="acoes"><button class="btn btn-claro" type="button" data-n>Cancelar</button><button class="btn btn-escuro" type="button" data-s>Restaurar</button></div>`);
    $('[data-n]', m).onclick = () => m.close();
    $('[data-s]', m).onclick = async () => {
      const bt = $('[data-s]', m); bt.disabled = true; bt.textContent = 'Restaurando…';
      try {
        clearTimeout(tSalvar);
        const r = await api('restaurar', { backup: b });
        m.close();
        toast(`Backup restaurado: ${r.produtos} produtos`);
        setTimeout(() => location.reload(), 900);
      } catch (err) { m.close(); toast('Não foi possível restaurar: ' + err.message, true); }
    };
  });

  // ================= publicar (com revisão do que muda) =================
  async function versaoPublicada() {
    try {
      const r = await fetch(API + (API.includes('?') ? '&' : '?') + 'acao=catalogo&_=' + Date.now(), { cache: 'no-store' });
      const j = await r.json();
      return Array.isArray(j.produtos) ? j : null;
    } catch (e) { return null; }
  }

  // produtos como estavam na última publicação (cópia completa guardada ao publicar)
  let baseCache = null;
  async function baseUltimaPublicacao() {
    if (baseCache && baseCache.publicadoEm === E.publicadoEm) return baseCache.produtos;
    try {
      const c = ((await api('copias')).copias || []).find(x => x.motivo === 'publicacao' && x.igualAoAtual) || null;
      if (c) { const k = await api('copia', { id: c.id }); if (k.rascunho && Array.isArray(k.rascunho.produtos)) { baseCache = { publicadoEm: E.publicadoEm, produtos: k.rascunho.produtos }; return baseCache.produtos; } }
    } catch (e) { /* segue com o publicado */ }
    const pub = await versaoPublicada();
    return pub ? pub.produtos : null;
  }
  function compararVersoes(antes, depois) {
    const vis = l => (l || []).filter(p => p && p.codigo && p.ativo !== false);
    const mapa = new Map(vis(antes).map(p => [norm(p.codigo), p]));
    const temAnonimos = vis(antes).some(p => p.anonimo);
    const d = { novos: [], removidos: [], precos: [], esgotaram: [], voltaram: [], outros: [] };
    const atuais = vis(depois);
    atuais.forEach(p => {
      const a = mapa.get(norm(p.codigo));
      if (!a) { if (!(p.esgotado && temAnonimos)) d.novos.push(p); return; }
      const un = x => (x.promo != null && x.promo !== '' && x.promo < x.preco ? x.promo : x.preco);
      if ((un(a) ?? -1) !== (un(p) ?? -1)) d.precos.push({ p, de: un(a), para: un(p) });
      if (!a.esgotado && p.esgotado) d.esgotaram.push(p);
      if (a.esgotado && !p.esgotado) d.voltaram.push(p);
      const resto = x => JSON.stringify([x.nome, x.categoria, x.pcs, x.specs, x.fotos, x.destaque, x.preco, x.promo]);
      if (resto(a) !== resto(p) && !d.precos.some(x => x.p === p)) d.outros.push(p);
    });
    const codAtuais = new Set(atuais.map(p => norm(p.codigo)));
    vis(antes).forEach(p => { if (!p.anonimo && !codAtuais.has(norm(p.codigo))) d.removidos.push(p); });
    return d;
  }

  function listaMudancas(titulo, itens, linha) {
    if (!itens.length) return '';
    return `<details class="mud" ${itens.length <= 6 ? 'open' : ''}><summary>${titulo}<span>${itens.length}</span></summary><ul>${itens.slice(0, 60).map(linha).join('')}${itens.length > 60 ? `<li class="mais">… e mais ${itens.length - 60}</li>` : ''}</ul></details>`;
  }

  const ICO_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z"/></svg>';

  $('#btnPublicar').addEventListener('click', async () => {
    clearTimeout(tSalvar);
    if ($('#status').classList.contains('salvando') || salvando) await salvar();
    const m = modal('<h2>Revisar e publicar</h2><p class="carregando-txt">Comparando com a versão que os clientes veem agora…</p>');
    const baseProd = await baseUltimaPublicacao();
    const pub = baseProd ? { produtos: baseProd } : null;
    const avisos = [];
    const vistos = new Map();
    E.produtos.forEach(p => {
      if (p.ativo === false) return;
      const k = norm(p.codigo);
      if (vistos.has(k)) avisos.push(`Código repetido: <b>${esc(p.codigo)}</b>`);
      vistos.set(k, 1);
      if (p.preco == null) avisos.push(`Sem preço: <b>${esc(p.codigo)}</b>`);
      if (!(p.fotos || []).length) avisos.push(`Sem foto: <b>${esc(p.codigo)}</b>`);
    });
    const ativos = E.produtos.filter(p => p.ativo !== false);
    const d = pub ? compararVersoes(pub.produtos, E.produtos) : null;
    const total = d ? d.novos.length + d.removidos.length + d.precos.length + d.esgotaram.length + d.voltaram.length + d.outros.length : 0;
    const nome = p => `<span class="nm"><b>${esc(p.codigo)}</b> ${esc(A.bonito(p.nome))}</span>`;
    const resumoMud = !d ? '<p class="dica">Não consegui ler a versão publicada agora. Você ainda pode publicar.</p>'
      : !total ? '<p class="dica">Nenhuma diferença nos produtos em relação à versão publicada.</p>'
      : `<div class="mudancas">
          ${listaMudancas('Preço alterado', d.precos, x => `<li>${nome(x.p)}<span class="n"><s>${x.de == null ? '—' : brl(x.de)}</s> ${x.para == null ? '—' : brl(x.para)}</span></li>`)}
          ${listaMudancas('Vão aparecer como esgotados', d.esgotaram, p => `<li>${nome(p)}</li>`)}
          ${listaMudancas('Voltam ao estoque', d.voltaram, p => `<li>${nome(p)}</li>`)}
          ${listaMudancas('Produtos novos', d.novos, p => `<li>${nome(p)}</li>`)}
          ${listaMudancas('Saem do catálogo', d.removidos, p => `<li>${nome(p)}</li>`)}
          ${listaMudancas('Outras alterações (nome, fotos, especificações…)', d.outros, p => `<li>${nome(p)}</li>`)}
        </div>`;
    m.innerHTML = `<h2>Revisar e publicar</h2>
      <p>${ativos.length} produtos ficam visíveis (${ativos.filter(p => p.esgotado).length} esgotados).${d && total ? ` <b>${total} mudança${total === 1 ? '' : 's'}</b> em relação ao que os clientes veem hoje:` : ''}</p>
      ${resumoMud}
      ${avisos.length ? `<details class="mud aviso"><summary>Para conferir<span>${avisos.length}</span></summary><ul>${avisos.slice(0, 40).map(a => `<li>${a}</li>`).join('')}</ul></details>` : ''}
      <div class="acoes"><button class="btn btn-claro" type="button" data-n>Voltar</button><button class="btn btn-laranja" type="button" data-s>Publicar agora</button></div>`;
    $('[data-n]', m).onclick = () => m.close();
    $('[data-s]', m).onclick = async () => {
      const b = $('[data-s]', m);
      b.disabled = true;
      b.textContent = 'Publicando…';
      try {
        const r = await api('publicar');
        E.publicadoEm = r.publicadoEm;
        E.pendente = false;
        E.mudou.clear();
        guarda.gravar('aiker-mudou', '[]');
        mostrarStatus();
        desenharProdutos();
        atualizarMsgGrupo();
        const m2 = modal(`<div class="selo-ok">${ICO_OK}</div><h2>Catálogo publicado</h2>
          <p>Publicado em ${esc(r.publicadoEm)}. O link do catálogo já mostra esta versão.</p>
          <textarea rows="5" readonly>${esc($('#msgGrupo').value)}</textarea>
          ${E.pastaAtu && E.pastaAtu.ativo ? '<p class="pasta-atu" data-pa><span class="girando"></span> Salvando a tabela, as novidades, a planilha e o backup na pasta do dia…</p>' : ''}
          <div class="acoes"><button class="btn btn-claro" type="button" data-n>Fechar</button><button class="btn btn-escuro" type="button" data-s>Copiar mensagem para o grupo</button></div>`);
        $('[data-n]', m2).onclick = () => m2.close();
        $('[data-s]', m2).onclick = async () => { toast(await copiar($('#msgGrupo').value) ? 'Mensagem copiada' : 'Não foi possível copiar'); };
        const pa = $('[data-pa]', m2);
        if (pa) {
          arquivarAtualizacao().then(({ c, nov }) => {
            pa.innerHTML = `<b>${c.erro ? 'Pasta do dia criada, mas faltou algo' : 'Arquivos salvos na pasta do dia'}</b><code>${esc(c.pasta)}</code>`
              + `<span>${(c.arquivos || []).map(esc).join(' · ')}${nov ? '' : ' · sem novidades hoje, então não há PDF de novidades'}</span>`
              + (c.erro ? `<span class="erro-txt">${esc(c.erro)}</span>` : '')
              + '<button class="btn btn-claro" type="button" data-abrir>Abrir pasta</button>';
            pa.classList.toggle('com-erro', !!c.erro);
            $('[data-abrir]', pa).onclick = () => api('abrirPastaAtualizacao').catch(e => toast(e.message, true));
          }).catch(e => { pa.classList.add('com-erro'); pa.textContent = 'Não foi possível criar a pasta do dia: ' + e.message; });
        }
      } catch (e) {
        m.close();
        toast('Não foi possível publicar: ' + e.message, true);
      }
    };
  });
})();
