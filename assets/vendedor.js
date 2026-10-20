(function () {
  const A = window.Aiker;
  const { esc, norm, parsePreco, brl } = A;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const API = (window.AIKER_CONFIG || {}).api;

  const guarda = {
    ler(k, p) { try { const v = localStorage.getItem(k); return v == null ? p : JSON.parse(v); } catch (e) { return p; } },
    gravar(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ } },
  };
  const num2 = n => (Math.round(n * 100) / 100);
  const pct = v => { const n = parsePreco(v); return n == null ? 0 : Math.min(100, Math.max(0, n)); };
  const fmtPct = n => (n ? String(n).replace('.', ',') : '');

  let vendedor = null;
  let produtos = [], porCodigo = new Map(), categorias = [];
  let P = novaProposta();

  function novaProposta() {
    return { id: '', numero: '', criadaEm: '', cliente: { empresa: '', doc: '', cidade: '', contato: '', email: '' }, itens: [], descPedido: 0, pagamento: '', validade: 7, obs: '' };
  }

  // ================= util =================
  function toast(t, erro) {
    const el = $('#toast');
    (document.querySelector('dialog[open]') || document.body).appendChild(el);
    el.textContent = t; el.className = 'toast on' + (erro ? ' erro' : '');
    clearTimeout(toast.t); toast.t = setTimeout(() => { el.className = 'toast'; }, erro ? 4000 : 2400);
  }
  function modal(html) { const m = $('#modal'); m.innerHTML = html; if (!m.open) m.showModal(); return m; }
  async function copiar(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (er) { /* */ } ta.remove(); return ok;
    }
  }
  $$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-fechar]')) d.close(); }));

  // ================= login =================
  $('#formLogin').addEventListener('submit', async e => {
    e.preventDefault();
    $('#btnEntrar').disabled = true; $('#erroLogin').textContent = '';
    try {
      if (!API) throw new Error('O endereço do servidor não está configurado.');
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ acao: 'vendedorEntrar', login: $('#lUsuario').value, senhaVendedor: $('#lSenha').value }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro === 'login' ? 'Usuário ou senha incorretos.' : (j.erro || 'Não foi possível entrar.'));
      vendedor = j.vendedor;
      guarda.gravar('aiker-vendedor', vendedor);
      await iniciar();
    } catch (err) { $('#erroLogin').textContent = err.message; } finally { $('#btnEntrar').disabled = false; }
  });
  $('#btnSair').addEventListener('click', () => { guarda.gravar('aiker-vendedor', null); location.reload(); });

  (async function auto() {
    vendedor = guarda.ler('aiker-vendedor', null);
    if (vendedor && !vendedor.token) { guarda.gravar('aiker-vendedor', null); vendedor = null; $('#erroLogin').textContent = 'Entre novamente para continuar (atualização do sistema).'; }
    if (vendedor) await iniciar();
  })();

  async function iniciar() {
    $('#telaLogin').hidden = true;
    $('#app').hidden = false;
    $('#nomeVend').textContent = vendedor.nome;
    $('#avVend').textContent = (vendedor.nome.trim()[0] || '?').toUpperCase();
    const d = await A.carregarTudo();
    produtos = d.produtos.filter(p => !p.esgotado); categorias = d.categorias.filter(c => produtos.some(p => p.categoria === c));
    porCodigo = new Map(produtos.map(p => [norm(p.codigo), p]));
    $('#fCat').innerHTML = '<option value="">Todas as categorias</option>' + categorias.map(c => `<option>${esc(c)}</option>`).join('');
    const rasc = guarda.ler(chave('rascunho'), null);
    if (rasc && rasc.itens) P = rasc;
    preencherForm();
    desenharProdutos();
    desenhar();
    contarPropostas();
    importarDoLink();
  }
  const chave = k => `aiker-${k}-${vendedor.login}`;

  // ================= produtos =================
  ['#busca', '#fCat'].forEach(s => $(s).addEventListener('input', desenharProdutos));
  document.addEventListener('keydown', e => { if (e.key === '/' && !e.target.matches('input, textarea, select')) { e.preventDefault(); $('#busca').focus(); } });

  function desenharProdutos() {
    const termos = norm($('#busca').value).split(' ').filter(Boolean);
    const cat = $('#fCat').value;
    const na = new Set(P.itens.map(i => norm(i.codigo)));
    let ultima = null;
    const l = produtos.filter(p => (!cat || p.categoria === cat) && (!termos.length || termos.every(t => norm(p.codigo + ' ' + p.codigo.replace(/[-\s]/g, '') + ' ' + p.nome).includes(t))));
    $('#listaProd').innerHTML = l.map(p => {
      let sep = '';
      if (!termos.length && !cat && p.categoria !== ultima) { ultima = p.categoria; sep = `<li class="cat-sep">${esc(p.categoria)}</li>`; }
      const dentro = na.has(norm(p.codigo));
      return sep + `<li class="prod ${p.esgotado ? 'esg' : ''}">
        <div class="prod-foto">${p.fotos[0] ? `<img src="${esc(A.miniUrl(p.fotos[0]))}" alt="" loading="lazy" decoding="async">` : ''}</div>
        <div class="prod-info"><b>${esc(p.codigo)}</b><span>${esc(p.nome)}</span></div>
        <div class="prod-preco"><span class="${p.promo != null ? 'promo' : ''}">${p.precoFinal != null ? brl(p.precoFinal) : '—'}</span><small>cx ${esc(p.pcsTxt || p.pcs)} un.</small>${p.poucas ? '<em class="poucas">Últimas unidades</em>' : ''}</div>
        <button class="add ${dentro ? 'na' : ''}" type="button" data-add="${esc(p.codigo)}" ${p.esgotado ? 'disabled title="Esgotado"' : ''} aria-label="${dentro ? 'Já na proposta' : 'Adicionar ' + esc(p.codigo)}">${dentro ? '✓' : '+'}</button>
      </li>`;
    }).join('') || '<li class="vazio"><strong>Nenhum produto encontrado</strong></li>';
  }
  $('#listaProd').addEventListener('click', e => {
    const b = e.target.closest('[data-add]');
    if (!b || b.disabled) return;
    const cod = b.dataset.add;
    const ja = P.itens.find(i => norm(i.codigo) === norm(cod));
    if (ja) { ja.qtd += 1; toast(`${cod}: +1 ${ja.modo === 'cx' ? 'caixa' : 'unidade'}`); }
    else { P.itens.push({ codigo: cod, modo: 'cx', qtd: 1, desc: 0 }); toast(`${cod} adicionado`); }
    mudou();
  });

  // ================= cálculo =================
  function calcItem(i) {
    const p = porCodigo.get(norm(i.codigo));
    const base = p && p.precoFinal != null ? p.precoFinal : 0;
    const pcs = p ? p.pcs : 1;
    const unidades = i.modo === 'cx' ? i.qtd * pcs : i.qtd;
    const unFinal = num2(base * (1 - (i.desc || 0) / 100));
    return { p, base, pcs, unidades, unFinal, tabela: num2(unidades * base), total: num2(unidades * unFinal) };
  }
  function calcTotais() {
    const linhas = P.itens.map(calcItem);
    const tabela = num2(linhas.reduce((s, x) => s + x.tabela, 0));
    const aposItens = num2(linhas.reduce((s, x) => s + x.total, 0));
    const descPedidoValor = num2(aposItens * (P.descPedido || 0) / 100);
    const total = num2(aposItens - descPedidoValor);
    return { linhas, tabela, descItens: num2(tabela - aposItens), aposItens, descPedidoValor, total, economia: num2(tabela - total), unidades: linhas.reduce((s, x) => s + x.unidades, 0) };
  }

  // ================= proposta (tela) =================
  function desenhar() {
    const t = calcTotais();
    $('#semItens').hidden = P.itens.length > 0;
    $('#numProposta').textContent = P.numero ? '· ' + P.numero : '';
    $('#statusProposta').textContent = P.id ? `Salva · ${P.salvaEm || ''}` : (P.itens.length ? 'Não salva' : 'Nova proposta');
    $('#itens').innerHTML = P.itens.map((i, k) => {
      const c = t.linhas[k];
      const p = c.p;
      return `<tr data-k="${k}">
        <td class="i-prod"><div class="item-p"><div class="prod-foto">${p && p.fotos[0] ? `<img src="${esc(A.miniUrl(p.fotos[0]))}" alt="">` : ''}</div><div><b>${esc(i.codigo)}</b><span>${esc(p ? p.nome : 'Produto não encontrado no catálogo')}</span></div></div></td>
        <td><div class="seg" role="group" aria-label="Vender por"><button type="button" data-modo="cx" class="${i.modo === 'cx' ? 'on' : ''}">Caixa</button><button type="button" data-modo="un" class="${i.modo === 'un' ? 'on' : ''}">Unid.</button></div></td>
        <td><div class="qtd"><button type="button" data-menos aria-label="Diminuir">−</button><input data-qtd value="${i.qtd}" inputmode="numeric" aria-label="Quantidade"><button type="button" data-mais aria-label="Aumentar">+</button></div>
          <span class="qtd-un">${i.modo === 'cx' ? `${c.unidades.toLocaleString('pt-BR')} un. (cx ${c.pcs})` : `${i.qtd === 1 ? 'unidade' : 'unidades'}`}</span></td>
        <td class="n preco-un">${i.desc ? `<s>${brl(c.base)}</s><b class="novo">${brl(c.unFinal)}</b>` : `<b>${brl(c.base)}</b>`}</td>
        <td class="n"><span class="pct ${i.desc ? 'ativo' : ''}"><input data-desc value="${fmtPct(i.desc)}" inputmode="decimal" placeholder="0" aria-label="Desconto do item em %"><i>%</i></span></td>
        <td class="n tot-linha">${brl(c.total)}</td>
        <td class="i-rem"><button class="remover" type="button" data-remover aria-label="Remover ${esc(i.codigo)}">×</button></td>
      </tr>`;
    }).join('');
    $('#totais').innerHTML = `
      <div><dt>${P.itens.length} produto${P.itens.length === 1 ? '' : 's'} · ${t.unidades.toLocaleString('pt-BR')} un.</dt><dd></dd></div>
      <div><dt>Valor de tabela</dt><dd>${brl(t.tabela)}</dd></div>
      ${t.descItens ? `<div class="desc"><dt>Descontos nos produtos</dt><dd>− ${brl(t.descItens)}</dd></div>` : ''}
      ${t.descPedidoValor ? `<div class="desc"><dt>Desconto no pedido (${fmtPct(P.descPedido)}%)</dt><dd>− ${brl(t.descPedidoValor)}</dd></div>` : ''}
      <div class="total"><dt>Total</dt><dd>${brl(t.total)}</dd></div>
      ${t.economia > 0 ? `<div class="eco">Cliente economiza ${brl(t.economia)} (${fmtPct(num2(t.economia / t.tabela * 100))}%)</div>` : ''}`;
    $('.pct', $('.condicoes')).classList.toggle('ativo', !!P.descPedido);
    const c = P.cliente;
    $('#resumoCliente').textContent = c.empresa ? [c.empresa, c.cidade].filter(Boolean).join(' · ') : 'Preencha os dados do cliente';
  }

  function mudou() {
    guarda.gravar(chave('rascunho'), P);
    desenhar();
    desenharProdutos();
  }

  $('#itens').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-k]');
    if (!tr) return;
    const i = P.itens[+tr.dataset.k];
    const modo = e.target.closest('[data-modo]');
    if (modo && modo.dataset.modo !== i.modo) {
      // troca mantendo a mesma quantidade de peças quando possível
      const c = calcItem(i);
      i.modo = modo.dataset.modo;
      i.qtd = i.modo === 'un' ? c.unidades : Math.max(1, Math.round(c.unidades / (c.pcs || 1)));
      mudou();
    }
    if (e.target.closest('[data-mais]')) { i.qtd += 1; mudou(); }
    if (e.target.closest('[data-menos]')) { i.qtd = Math.max(1, i.qtd - 1); mudou(); }
    if (e.target.closest('[data-remover]')) { P.itens.splice(+tr.dataset.k, 1); mudou(); }
  });
  $('#itens').addEventListener('change', e => {
    const tr = e.target.closest('tr[data-k]');
    if (!tr) return;
    const i = P.itens[+tr.dataset.k];
    if (e.target.matches('[data-qtd]')) i.qtd = Math.max(1, parseInt(e.target.value, 10) || 1);
    if (e.target.matches('[data-desc]')) i.desc = pct(e.target.value);
    mudou();
  });
  $('#itens').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  $('#itens').addEventListener('focusin', e => { if (e.target.matches('input')) e.target.select(); });

  // dados do cliente e condições
  const CAMPOS_CLI = { cEmpresa: 'empresa', cDoc: 'doc', cCidade: 'cidade', cContato: 'contato', cEmail: 'email' };
  function preencherForm() {
    Object.entries(CAMPOS_CLI).forEach(([id, k]) => { $('#' + id).value = P.cliente[k] || ''; });
    $('#descPedido').value = fmtPct(P.descPedido);
    $('#pagamento').value = P.pagamento || '';
    $('#validade').value = String(P.validade || 7);
    $('#obs').value = P.obs || '';
  }
  Object.entries(CAMPOS_CLI).forEach(([id, k]) => $('#' + id).addEventListener('input', e => { P.cliente[k] = e.target.value; guarda.gravar(chave('rascunho'), P); desenhar(); }));
  $('#descPedido').addEventListener('change', e => { P.descPedido = pct(e.target.value); e.target.value = fmtPct(P.descPedido); mudou(); });
  $('#pagamento').addEventListener('input', e => { P.pagamento = e.target.value; guarda.gravar(chave('rascunho'), P); });
  $('#validade').addEventListener('change', e => { P.validade = +e.target.value; guarda.gravar(chave('rascunho'), P); });
  $('#obs').addEventListener('input', e => { P.obs = e.target.value; guarda.gravar(chave('rascunho'), P); });

  // ================= salvar / minhas propostas =================
  function gerarNumero() {
    const d = new Date(); const z = n => String(n).padStart(2, '0');
    const ini = vendedor.nome.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
    return `AIK-${String(d.getFullYear()).slice(2)}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}-${ini}`;
  }
  function registrar(pdf) {
    if (!API || !vendedor || !vendedor.token || !P.id) return;
    const t = calcTotais();
    const proposta = {
      id: P.id, numero: P.numero, cliente: P.cliente.empresa, cidade: P.cliente.cidade, tabela: t.tabela, total: t.total, descPedido: P.descPedido, pdf,
      itens: P.itens.map((i, k) => ({ codigo: i.codigo, qtd: i.qtd, modo: i.modo, unidades: (t.linhas[k] || {}).unidades || 0, desc: i.desc || 0 })),
    };
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ acao: 'registrarProposta', login: vendedor.login, token: vendedor.token, proposta }) })
      .then(x => x.json()).then(j => { if (!j.ok && j.erro === 'token') { guarda.gravar('aiker-vendedor', null); toast('Sua senha mudou. Entre novamente.', true); setTimeout(() => location.reload(), 2500); } })
      .catch(() => {});
  }
  function salvar(silencioso, pdf) {
    if (!P.itens.length) { toast('Adicione produtos antes de salvar.', true); return false; }
    if (!P.id) { P.id = String(Date.now()); P.numero = gerarNumero(); P.criadaEm = new Date().toLocaleDateString('pt-BR'); }
    P.salvaEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const lista = guarda.ler(chave('propostas'), []).filter(x => x.id !== P.id);
    lista.unshift({ ...JSON.parse(JSON.stringify(P)), total: calcTotais().total });
    guarda.gravar(chave('propostas'), lista.slice(0, 200));
    guarda.gravar(chave('rascunho'), P);
    registrar(!!pdf);
    desenhar(); contarPropostas();
    if (!silencioso) toast('Proposta salva');
    return true;
  }
  $('#btnSalvar').addEventListener('click', () => salvar());
  $('#btnNova').addEventListener('click', () => {
    if (P.itens.length && !P.id && !confirm('Começar uma nova proposta? Os itens desta (não salva) serão descartados.')) return;
    P = novaProposta(); preencherForm(); mudou();
    $('#blocoCliente').open = true; $('#cEmpresa').focus();
  });
  function contarPropostas() {
    const n = guarda.ler(chave('propostas'), []).length;
    $('#contPropostas').hidden = !n; $('#contPropostas').textContent = n;
  }
  $('#btnPropostas').addEventListener('click', () => {
    const lista = guarda.ler(chave('propostas'), []);
    $('#listaPropostas').innerHTML = lista.length ? lista.map(x => `<li>
        <div><b>${esc(x.cliente.empresa || 'Cliente não informado')}</b><br><small>${esc(x.numero)} · ${esc(x.salvaEm || x.criadaEm)} · ${x.itens.length} produto${x.itens.length === 1 ? '' : 's'}</small></div>
        <div class="valor">${brl(x.total)}</div>
        <div class="acoes"><button class="btn-texto" type="button" data-abrir="${x.id}">Abrir</button><button class="btn-texto" type="button" data-duplicar="${x.id}">Duplicar</button><button class="btn-texto" type="button" data-apagar="${x.id}">Apagar</button></div>
      </li>`).join('') : '<li class="vazio"><strong>Nenhuma proposta salva</strong><span>As propostas que você salvar ficam aqui, neste aparelho.</span></li>';
    $('#gavetaPropostas').showModal();
  });
  $('#listaPropostas').addEventListener('click', e => {
    const lista = guarda.ler(chave('propostas'), []);
    const ab = e.target.closest('[data-abrir]'), du = e.target.closest('[data-duplicar]'), ap = e.target.closest('[data-apagar]');
    if (ab || du) {
      const x = lista.find(y => y.id === (ab || du).dataset[ab ? 'abrir' : 'duplicar']);
      P = JSON.parse(JSON.stringify(x)); delete P.total;
      if (du) { P.id = ''; P.numero = ''; P.salvaEm = ''; }
      preencherForm(); mudou(); $('#gavetaPropostas').close();
      toast(du ? 'Proposta duplicada: ajuste e salve' : 'Proposta aberta');
    }
    if (ap && confirm('Apagar esta proposta?')) {
      guarda.gravar(chave('propostas'), lista.filter(y => y.id !== ap.dataset.apagar));
      ap.closest('li').remove(); contarPropostas();
    }
  });

  // ================= resumo em texto =================
  function textoResumo() {
    const t = calcTotais();
    const linhas = P.itens.map((i, k) => {
      const c = t.linhas[k];
      const qtd = i.modo === 'cx' ? `${i.qtd} cx (${c.unidades} un)` : `${i.qtd} un`;
      return `• ${i.codigo} – ${c.p ? c.p.nome : ''}\n   ${qtd} × ${brl(c.unFinal)}${i.desc ? ` (−${fmtPct(i.desc)}%)` : ''} = ${brl(c.total)}`;
    });
    return [
      `*Proposta Aiker${P.numero ? ' ' + P.numero : ''}*`,
      P.cliente.empresa ? `Cliente: ${P.cliente.empresa}` : '',
      '',
      ...linhas,
      '',
      t.descItens || t.descPedidoValor ? `Valor de tabela: ${brl(t.tabela)}` : '',
      t.descPedidoValor ? `Desconto no pedido (${fmtPct(P.descPedido)}%): −${brl(t.descPedidoValor)}` : '',
      `*Total: ${brl(t.total)}*`,
      P.pagamento ? `Pagamento: ${P.pagamento}` : '',
      `Validade: ${P.validade} dias`,
      P.obs ? `Obs.: ${P.obs}` : '',
      '',
      `${vendedor.nome}${vendedor.contato ? ' · ' + vendedor.contato : ''}`,
    ].filter((l, k, a) => l !== '' || (a[k - 1] !== '' && k > 0)).join('\n');
  }
  $('#btnCopiar').addEventListener('click', async () => {
    if (!P.itens.length) { toast('A proposta está vazia.', true); return; }
    toast(await copiar(textoResumo()) ? 'Resumo copiado. Cole na conversa com o cliente.' : 'Não foi possível copiar', false);
  });

  // ================= PDF da proposta =================
  $('#btnPdf').addEventListener('click', () => {
    if (!P.itens.length) { toast('Adicione produtos à proposta.', true); return; }
    if (!P.cliente.empresa) { $('#blocoCliente').open = true; $('#cEmpresa').focus(); toast('Informe o nome do cliente para a proposta.', true); return; }
    salvar(true, true);
    const t = calcTotais();
    const hoje = new Date();
    const ate = new Date(hoje.getTime() + (P.validade || 7) * 864e5);
    const dt = d => d.toLocaleDateString('pt-BR');
    const c = P.cliente;
    $('#impressao').innerHTML = `
      <header class="pp-cab"><img src="img/logo-laranja.png" alt="aiker">
        <div class="pp-titulo"><h1>PROPOSTA COMERCIAL</h1><p>Nº ${esc(P.numero)} · Emitida em ${dt(hoje)} · Válida até ${dt(ate)}</p></div></header>
      <section class="pp-blocos">
        <div class="pp-bloco"><h3>Cliente</h3><p><b>${esc(c.empresa)}</b></p>${c.doc ? `<p>CNPJ/CPF: ${esc(c.doc)}</p>` : ''}${c.cidade ? `<p>${esc(c.cidade)}</p>` : ''}${c.contato ? `<p>${esc(c.contato)}</p>` : ''}${c.email ? `<p>${esc(c.email)}</p>` : ''}</div>
        <div class="pp-bloco"><h3>Vendedor</h3><p><b>${esc(vendedor.nome)}</b></p>${vendedor.contato ? `<p>${esc(vendedor.contato)}</p>` : ''}${vendedor.email ? `<p>${esc(vendedor.email)}</p>` : ''}<p>Aiker · Tecnologia automotiva</p></div>
      </section>
      <table class="pp-tab">
        <thead><tr><th></th><th>Código</th><th>Produto</th><th class="n">Quantidade</th><th class="n">Preço un.</th><th class="n">Desc.</th><th class="n">Preço final un.</th><th class="n">Total</th></tr></thead>
        <tbody>${P.itens.map((i, k) => { const x = t.linhas[k]; return `<tr>
          <td class="f">${x.p && x.p.fotos[0] ? `<img src="${esc(A.medioUrl(x.p.fotos[0]))}" alt="">` : ''}</td>
          <td class="cod">${esc(i.codigo)}</td>
          <td>${esc(x.p ? x.p.nome : '')}</td>
          <td class="n">${i.modo === 'cx' ? `${i.qtd} cx<small>${x.unidades.toLocaleString('pt-BR')} unidades</small>` : `${i.qtd} un.`}</td>
          <td class="n">${brl(x.base)}</td>
          <td class="n ${i.desc ? 'desc-v' : ''}">${i.desc ? fmtPct(i.desc) + '%' : '—'}</td>
          <td class="n">${brl(x.unFinal)}</td>
          <td class="n"><b>${brl(x.total)}</b></td></tr>`; }).join('')}</tbody>
      </table>
      <section class="pp-rodape">
        <div class="pp-cond">
          ${P.pagamento ? `<p><b>Pagamento:</b> ${esc(P.pagamento)}</p>` : ''}
          <p><b>Validade:</b> ${P.validade} dias (até ${dt(ate)})</p>
          ${P.obs ? `<p><b>Observações:</b> ${esc(P.obs)}</p>` : ''}
        </div>
        <div class="pp-tot">
          <div><span>Valor de tabela</span><span>${brl(t.tabela)}</span></div>
          ${t.descItens ? `<div class="d"><span>Descontos nos produtos</span><span>− ${brl(t.descItens)}</span></div>` : ''}
          ${t.descPedidoValor ? `<div class="d"><span>Desconto no pedido (${fmtPct(P.descPedido)}%)</span><span>− ${brl(t.descPedidoValor)}</span></div>` : ''}
          <div class="t"><span>Total</span><span>${brl(t.total)}</span></div>
        </div>
      </section>
      <p class="pp-nota">Preços em reais, sujeitos à disponibilidade de estoque na data do pedido. Imagens meramente ilustrativas. ${P.itens.length} produto(s), ${t.unidades.toLocaleString('pt-BR')} unidade(s).</p>`;
    const titulo = document.title;
    document.title = `Proposta ${P.numero} - ${c.empresa}`.replace(/[\\/:*?"<>|]/g, '');
    const fim = () => { document.title = titulo; window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim);
    const imgs = $$('#impressao img');
    Promise.all(imgs.map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))).then(() => setTimeout(() => window.print(), 100));
  });

  // ================= importar a lista do cliente =================
  // formato do link (gerado pelo catálogo): vendedor.html#lista=<base64 de JSON {i:[[código,qtd],...], c:{...}}>
  function decodificarLista(txt) {
    const m = String(txt).match(/lista=([A-Za-z0-9_\-+/=%]+)/);
    if (!m) return null;
    try {
      const b64 = decodeURIComponent(m[1]).replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch (e) { return null; }
  }
  function linhasTexto(txt) {
    // aceita o texto que o cliente copia do catálogo: "1) ACV-120 - ...\n    2 cx x 50 un ..."
    const itens = [];
    const ls = String(txt).split(/\r?\n/);
    ls.forEach((l, k) => {
      const m = l.match(/^\s*\d+\)\s*(.+?)\s+-\s+/);
      if (!m) return;
      const q = (ls[k + 1] || '').match(/(\d+)\s*cx/i);
      itens.push([m[1].trim(), q ? +q[1] : 1]);
    });
    return itens.length ? { i: itens } : null;
  }
  function aplicarLista(dados) {
    let n = 0; const faltam = [];
    (dados.i || []).forEach(([cod, q]) => {
      if (!porCodigo.has(norm(cod))) { faltam.push(cod); return; }
      const ja = P.itens.find(x => norm(x.codigo) === norm(cod));
      if (ja) ja.qtd = Math.max(ja.qtd, q); else P.itens.push({ codigo: porCodigo.get(norm(cod)).codigo, modo: 'cx', qtd: Math.max(1, q | 0), desc: 0 });
      n++;
    });
    if (dados.c) {
      const c = dados.c;
      P.cliente.empresa = P.cliente.empresa || c.empresa || c.nome || '';
      P.cliente.doc = P.cliente.doc || c.cnpj || '';
      P.cliente.cidade = P.cliente.cidade || c.cidade || '';
      P.cliente.contato = P.cliente.contato || (c.empresa ? c.nome : '') || '';
      if (c.obs) P.obs = P.obs ? P.obs : c.obs;
    }
    preencherForm(); mudou();
    toast(`${n} produto${n === 1 ? '' : 's'} importado${n === 1 ? '' : 's'}${faltam.length ? ` · não encontrados: ${faltam.join(', ')}` : ''}`, !!faltam.length && !n);
  }
  function importarDoLink() {
    const d = decodificarLista(location.hash);
    if (!d) return;
    history.replaceState(null, '', location.pathname);
    if (P.itens.length) {
      const m = modal(`<h2>Lista do cliente recebida</h2><p>Você já tem uma proposta aberta. O que fazer com a lista que chegou (${(d.i || []).length} produtos)?</p>
        <div class="acoes"><button class="btn btn-claro" type="button" data-juntar>Juntar com a atual</button><button class="btn btn-escuro" type="button" data-nova>Abrir em proposta nova</button></div>`);
      $('[data-juntar]', m).onclick = () => { m.close(); aplicarLista(d); };
      $('[data-nova]', m).onclick = () => { m.close(); if (!P.id) salvar(true); P = novaProposta(); aplicarLista(d); };
    } else aplicarLista(d);
  }
  $('#btnImportar').addEventListener('click', () => {
    const m = modal(`<h2>Importar lista do cliente</h2>
      <p>Cole o <b>link</b> ou o <b>texto</b> da lista de orçamento que o cliente enviou pelo catálogo.</p>
      <textarea id="txtImport" rows="7" placeholder="https://…/vendedor.html#lista=…  ou  1) ACV-120 - Câmera…"></textarea>
      <div class="acoes"><button class="btn btn-claro" type="button" data-n>Cancelar</button><button class="btn btn-escuro" type="button" data-s>Importar</button></div>`);
    $('#txtImport', m).focus();
    $('[data-n]', m).onclick = () => m.close();
    $('[data-s]', m).onclick = () => {
      const txt = $('#txtImport', m).value;
      const d = decodificarLista(txt) || linhasTexto(txt);
      if (!d) { toast('Não reconheci a lista. Cole o link ou o texto completo.', true); return; }
      m.close(); aplicarLista(d);
    };
  });
  window.addEventListener('hashchange', importarDoLink);
})();
