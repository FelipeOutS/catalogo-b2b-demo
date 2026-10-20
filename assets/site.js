(function () {
  const { brl, esc, norm, slug } = window.Aiker;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const ICO_ADD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>';
  const ICO_LISTA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8l4-4zm2 2v3a1 1 0 0 1-1 1H6v9h12V6h-8zm-1 6h6v2H9v-2zm0 3h6v2H9v-2z"/></svg>';
  const ICO_FOTO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v8.6l4-4 3 3 2-2 5 5V7H5zm11 2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/></svg>';
  const DUR = 3600; // tempo de cada foto no carrossel (ms)

  const guarda = {
    ler(k, padrao) { try { const v = localStorage.getItem(k); return v == null ? padrao : JSON.parse(v); } catch (e) { return padrao; } },
    gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } },
  };

  const estado = {
    produtos: [], categorias: [], config: { vendedores: [] }, porId: {},
    cat: '', busca: '', soPromo: false, soDisp: false, ordem: 'cat',
    lista: guarda.ler('aiker-lista', {}),
    consultor: null,
  };

  // ================= início =================
  window.Aiker.carregarTudo().then(d => {
    // esgotados não aparecem no catálogo (não revelar o que vende mais)
    const disp = d.produtos.filter(p => !p.esgotado);
    Object.assign(estado, { produtos: disp, categorias: d.categorias.filter(c => disp.some(p => p.categoria === c)), config: d.config });
    d.produtos.forEach(p => { estado.porId[p.id] = p; });
    Object.keys(estado.lista).forEach(id => { if (!estado.porId[id] || estado.porId[id].esgotado) delete estado.lista[id]; });
    montarCabecalho();
    montarPromo();
    montarCategorias();
    montarTiles();
    montarDestaques();
    aplicarVisao();
    desenhar();
    atualizarContador();
    abrirPeloHash();
  }).catch(e => {
    console.error(e);
    $('#contagem').textContent = 'Não foi possível carregar os produtos. Atualize a página.';
  });

  function iniciais(n) {
    const p = String(n).trim().split(/\s+/);
    return ((p[0] || '')[0] || '') + (p.length > 1 ? (p[p.length - 1][0] || '') : '');
  }

  function contatoHtml(c) {
    c = String(c || '').trim();
    if (!c) return '';
    if (c.includes('@')) return `<a href="mailto:${esc(c)}">${esc(c)}</a>`;
    const d = c.replace(/\D/g, '');
    if (d.length >= 8) return `<a href="tel:+${d.length <= 11 ? '55' + d : d}">${esc(c)}</a>`;
    return esc(c);
  }

  // ================= cabeçalho / números =================
  function montarCabecalho() {
    const c = estado.config;
    if (c.heroImg) $('.hero-midia img').src = c.heroImg;
    if (c.heroTitulo) $('.hero h1').textContent = c.heroTitulo;
    if (c.heroTexto) $('.hero-p').textContent = c.heroTexto;
    const data = c.atualizadoEm;
    $('#atualizado').textContent = data ? `Catálogo atualizado em ${data}` : 'Catálogo de produtos';
    const disp = estado.produtos.filter(p => !p.esgotado).length;
    $('#heroAtual').innerHTML = `<i aria-hidden="true"></i>${disp} produtos disponíveis${data ? ` · atualizado em ${esc(data.split(' ')[0])}` : ''}`;
    const contatos = [];
    if (estado.consultor) contatos.push(`<p>Seu consultor: <strong style="color:#fff">${esc(estado.consultor.nome)}</strong>${estado.consultor.contato ? '<br>' + contatoHtml(estado.consultor.contato) : ''}</p>`);
    if (c.telefone) contatos.push(`<p>${contatoHtml(c.telefone)}</p>`);
    if (c.email) contatos.push(`<p>${contatoHtml(c.email)}</p>`);
    if (contatos.length) $('#rodapeContato').innerHTML = contatos.join('');
    $('#rodapeData').textContent = data ? `Atualizado em ${data}` : '';
  }

  // ================= promoção =================
  function montarPromo() {
    const p = estado.config.promo;
    const el = $('#promo');
    if (!p || !(p.titulo || p.texto)) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<div class="w promo-in">
      ${p.titulo ? `<span class="promo-tit">${esc(p.titulo)}</span>` : ''}
      <div class="promo-txt"><p>${esc(p.texto)}</p>${p.obs ? `<p class="obs">${esc(p.obs)}</p>` : ''}</div>
      ${p.validade ? `<span class="promo-val">${esc(p.validade)}</span>` : ''}
    </div>`;
  }

  // ================= categorias =================
  function montarCategorias() {
    const cont = {};
    estado.produtos.forEach(p => { cont[p.categoria] = (cont[p.categoria] || 0) + 1; });
    const itens = [{ c: '', n: 'Todos os produtos', q: estado.produtos.length }, ...estado.categorias.map(c => ({ c, n: c, q: cont[c] }))];
    $('#listaCats').innerHTML = itens.map(i => `<button type="button" data-cat="${esc(i.c)}" class="${i.c === estado.cat ? 'ativa' : ''}">${esc(i.n)}<span>${i.q}</span></button>`).join('');
    $('#chips').innerHTML = itens.map(i => `<button type="button" data-cat="${esc(i.c)}" class="${i.c === estado.cat ? 'ativa' : ''}">${esc(i.c ? i.n : 'Todos')}</button>`).join('');
  }

  function montarTiles() {
    const cont = {};
    estado.produtos.forEach(p => { cont[p.categoria] = (cont[p.categoria] || 0) + 1; });
    $('#tiles').innerHTML = estado.categorias.map(c => {
      const doGrupo = estado.produtos.filter(p => p.categoria === c && p.fotos.length);
      const foto = (doGrupo.find(p => p.destaque && !p.esgotado) || doGrupo.find(p => !p.esgotado) || doGrupo[0] || {}).fotos;
      return `<button type="button" class="tile" data-cat="${esc(c)}">
        <span class="tile-img">${foto ? `<img src="${esc(foto[0])}" alt="" loading="lazy">` : ''}</span>
        <span class="tile-nome">${esc(c)}</span><span class="tile-n">${cont[c]} produto${cont[c] === 1 ? '' : 's'}</span>
      </button>`;
    }).join('');
  }

  function escolherCategoria(c) {
    estado.cat = c;
    $$('[data-cat]').forEach(b => b.classList.toggle('ativa', b.dataset.cat === c));
    const chip = $(`#chips [data-cat="${CSS.escape(c)}"]`);
    if (chip) chip.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    desenhar();
    rolarParaCatalogo();
  }

  function rolarParaCatalogo() {
    const alvo = $('.conteudo');
    const topo = $('.topo').offsetHeight + ($('#chips').offsetHeight || 0);
    const y = alvo.getBoundingClientRect().top + window.scrollY - topo - 12;
    if (Math.abs(window.scrollY - y) > 40) window.scrollTo({ top: y, behavior: 'smooth' });
  }

  // ================= destaques =================
  function montarDestaques() {
    const d = estado.produtos.filter(p => p.destaque && !p.esgotado);
    $('#destaquesSec').hidden = !d.length;
    $('#destaques').innerHTML = d.map(card).join('');
  }

  // ================= filtros =================
  let tBusca;
  $('#busca').addEventListener('input', e => {
    clearTimeout(tBusca);
    tBusca = setTimeout(() => {
      estado.busca = e.target.value;
      desenhar();
      if (estado.busca.length > 1) rolarParaCatalogo();
    }, 180);
  });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); $('#busca').focus(); }
  });

  function ligarFiltro(idA, idB, chave) {
    [idA, idB].forEach(id => $(id).addEventListener('change', e => {
      estado[chave] = e.target.checked;
      $(idA).checked = $(idB).checked = e.target.checked;
      $('#abrirFiltros').classList.toggle('ativo', estado.soPromo || estado.soDisp);
      desenhar();
    }));
  }
  ligarFiltro('#fPromo', '#mPromo', 'soPromo');
  ligarFiltro('#fDisp', '#mDisp', 'soDisp');
  $('#ordem').addEventListener('change', e => { estado.ordem = e.target.value; desenhar(); });
  estado.visao = guarda.ler('aiker-visao', 'grade');
  function aplicarVisao() {
    $('#lista').classList.toggle('modo-lista', estado.visao === 'lista');
    $$('[data-visao]').forEach(b => { const on = b.dataset.visao === estado.visao; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  }
  $('.visao').addEventListener('click', e => {
    const b = e.target.closest('[data-visao]');
    if (!b) return;
    estado.visao = b.dataset.visao;
    guarda.gravar('aiker-visao', estado.visao);
    aplicarVisao();
  });
  $('#abrirFiltros').addEventListener('click', () => $('#modalFiltros').showModal());

  function filtrar() {
    const termos = norm(estado.busca).split(' ').filter(Boolean);
    const l = estado.produtos.filter(p => {
      if (estado.cat && p.categoria !== estado.cat) return false;
      if (estado.soPromo && p.promo == null) return false;
      if (estado.soDisp && p.esgotado) return false;
      if (termos.length) {
        const alvo = norm([p.codigo, p.codigo.replace(/[-\s]/g, ''), p.nome, p.categoria, ...p.specs.map(s => s.rotulo + ' ' + s.valor)].join(' '));
        return termos.every(t => alvo.includes(t));
      }
      return true;
    });
    const o = estado.ordem;
    if (o === 'menor') l.sort((a, b) => (a.precoFinal ?? 1e12) - (b.precoFinal ?? 1e12));
    else if (o === 'maior') l.sort((a, b) => (b.precoFinal ?? -1) - (a.precoFinal ?? -1));
    else if (o === 'cod') l.sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
    else if (o === 'nome') l.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    l.sort((a, b) => (a.esgotado === b.esgotado ? 0 : a.esgotado ? 1 : -1));
    return l;
  }

  // ================= lista de produtos =================
  function desenhar() {
    const l = filtrar();
    const n = l.length;
    const esg = l.filter(p => p.esgotado).length;
    $('#tituloCat').textContent = estado.busca ? `Resultados para “${estado.busca}”` : (estado.cat || 'Todos os produtos');
    $('#contagem').textContent = n ? `${n} produto${n > 1 ? 's' : ''}${esg ? ` · ${esg} esgotado${esg > 1 ? 's' : ''}` : ''}` : 'Nenhum produto';
    const lista = $('#lista');
    if (!n) {
      lista.innerHTML = '<div class="vazio"><strong>Nenhum produto encontrado</strong>Tente buscar por outro código ou nome, ou limpe os filtros.</div>';
    } else if (estado.ordem === 'cat' && !estado.cat && !estado.busca) {
      const g = {};
      l.forEach(p => (g[p.categoria] = g[p.categoria] || []).push(p));
      lista.innerHTML = estado.categorias.filter(c => g[c]).map(c => `
        <section id="cat-${slug(c)}">
          <h3 class="grupo-tit">${esc(c)} <span>${g[c].length}</span></h3>
          <div class="grade">${g[c].map(card).join('')}</div>
        </section>`).join('');
    } else {
      lista.innerHTML = `<div class="grade">${l.map(card).join('')}</div>`;
    }
    observarCarrosseis();
  }

  const desconto = p => (p.promo != null && p.preco ? Math.round((1 - p.promo / p.preco) * 100) : 0);
  const valorCaixa = p => (p.precoFinal != null ? brl(p.precoFinal * p.pcs) : '');
  function caixaHtml(p) {
    return `<span class="caixa">Caixa com ${esc(p.pcsTxt || p.pcs)} un.${p.precoFinal != null ? ` · <b>${valorCaixa(p)}</b>` : ''}</span>`;
  }

  function precoHtml(p) {
    if (p.preco == null && p.promo == null) return '<div class="preco"><span class="consulte">Preço sob consulta</span></div>';
    if (p.promo != null) return `<div class="preco em-promo"><span class="de">${brl(p.preco)}</span><span class="valor">${brl(p.promo)}</span><span class="un">/ un.</span></div>`;
    return `<div class="preco"><span class="valor">${brl(p.preco)}</span><span class="un">/ un.</span></div>`;
  }

  // até 4 especificações no card; se tiver mais, link para ver todas
  const SPECS_CARD = 4;
  function specsCard(p) {
    if (!p.specs.length) return '';
    const extra = p.specs.length - SPECS_CARD;
    return `<ul class="produto-specs">${p.specs.slice(0, SPECS_CARD).map(s => `<li>${s.rotulo ? `<span>${esc(s.rotulo)}</span>` : ''}<b>${esc(s.valor)}</b></li>`).join('')}</ul>` +
      (extra > 0 ? `<button class="ver-specs" type="button" data-abrir="${p.id}">Ver todas as especificações (+${extra})</button>` : '');
  }

  function acaoHtml(p) {
    if (p.esgotado) return '<button class="add" type="button" disabled>Indisponível no momento</button>';
    const q = estado.lista[p.id];
    if (q) {
      return `<div class="passo" data-passo="${p.id}">
        <button type="button" data-menos aria-label="Diminuir">−</button>
        <label><input type="number" inputmode="numeric" min="0" value="${q}" aria-label="Quantidade de caixas"><span>${q > 1 ? 'caixas' : 'caixa'}</span></label>
        <button type="button" data-mais aria-label="Aumentar">+</button>
      </div>`;
    }
    return `<button class="add" type="button" data-add="${p.id}">${ICO_ADD}<span>Adicionar<span class="longo"> à lista</span></span></button>`;
  }

  function card(p) {
    const multi = p.fotos.length > 1;
    const fotos = p.fotos.length
      ? p.fotos.map((f, i) => `<img src="${esc(window.Aiker.medioUrl(f))}" alt="${i ? '' : esc(p.nome)}" loading="lazy" decoding="async" class="${i ? '' : 'on'}" onerror="this.remove()">`).join('')
      : '<span class="sem-foto">Imagem indisponível</span>';
    return `<article class="produto${p.esgotado ? ' esg' : ''}" data-id="${p.id}">
      <button class="produto-midia" type="button" data-abrir="${p.id}" ${multi ? 'data-carrossel' : ''} aria-label="Ver detalhes de ${esc(p.nome)}">
        <div class="slides">${fotos}</div>
        <div class="selos">${p.esgotado ? '<span class="selo esg">Esgotado</span>' : desconto(p) > 0 ? `<span class="selo promo">−${desconto(p)}%</span>` : ''}${p.poucas ? '<span class="selo poucas">Últimas unidades</span>' : ''}</div>
        ${multi ? `<span class="n-fotos">${ICO_FOTO}${p.fotos.length}</span><div class="barras">${p.fotos.map(() => '<i></i>').join('')}</div>` : ''}
        <span class="ver">Ver detalhes</span>
      </button>
      <div class="produto-corpo">
        <div class="produto-topo"><span class="produto-cod">${esc(p.codigo)}</span>${p.esgotado ? '<span class="estoque fora">Esgotado</span>' : '<span class="estoque"><i aria-hidden="true"></i>Em estoque</span>'}</div>
        <h4 class="produto-nome" data-abrir="${p.id}">${esc(p.nome)}</h4>
        ${specsCard(p)}
      </div>
      <div class="preco-bloco">${precoHtml(p)}${caixaHtml(p)}</div>
      <div class="produto-acao">${acaoHtml(p)}</div>
    </article>`;
  }

  function redesenharAcoes(id) {
    const p = estado.porId[id];
    $$(`.produto[data-id="${CSS.escape(id)}"] .produto-acao`).forEach(el => { el.innerHTML = acaoHtml(p); });
    const m = $('#modalProd');
    if (m.open && m.dataset.id === id) $('.det-acao', m).innerHTML = acaoHtml(p);
  }

  // ================= carrossel automático =================
  const ativos = new Map(); // elemento -> { idx, proximo, resta }
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(ents => {
    ents.forEach(e => {
      if (e.isIntersecting) {
        if (!ativos.has(e.target)) { ativos.set(e.target, { idx: indiceAtual(e.target), proximo: 0, resta: 0 }); iniciarBarra(e.target, 600 + Math.random() * 1400); }
      } else ativos.delete(e.target);
    });
  }, { threshold: .55 }) : null;

  function indiceAtual(el) { return Math.max(0, $$('.slides img', el).findIndex(i => i.classList.contains('on'))); }

  function observarCarrosseis() {
    if (!io) return;
    io.disconnect();
    ativos.clear();
    $$('[data-carrossel]').forEach(el => io.observe(el));
  }

  function iniciarBarra(el, extra = 0) {
    const st = ativos.get(el);
    if (!st) return;
    const dur = DUR + extra;
    st.proximo = performance.now() + dur;
    st.resta = 0;
    const barras = $$('.barras i', el);
    barras.forEach((b, i) => { b.className = i < st.idx ? 'feito' : ''; });
    const b = barras[st.idx];
    if (b) { b.style.setProperty('--dur', dur + 'ms'); void b.offsetWidth; b.className = 'on'; }
  }

  function irPara(el, idx) {
    const imgs = $$('.slides img', el);
    if (imgs.length < 2) return;
    idx = (idx + imgs.length) % imgs.length;
    imgs.forEach((im, i) => im.classList.toggle('on', i === idx));
    const st = ativos.get(el);
    if (st) { st.idx = idx; iniciarBarra(el); }
  }

  (function laco() {
    const agora = performance.now();
    if (!document.hidden) {
      ativos.forEach((st, el) => {
        if (el.classList.contains('pausado')) { if (!st.resta) st.resta = Math.max(200, st.proximo - agora); return; }
        if (st.resta) { st.proximo = agora + st.resta; st.resta = 0; }
        if (agora >= st.proximo) irPara(el, st.idx + 1);
      });
    }
    setTimeout(laco, 120);
  })();

  // pausa enquanto o mouse está em cima
  document.addEventListener('pointerover', e => { const el = e.target.closest('[data-carrossel]'); if (el && e.pointerType === 'mouse') el.classList.add('pausado'); });
  document.addEventListener('pointerout', e => { const el = e.target.closest('[data-carrossel]'); if (el && !el.contains(e.relatedTarget)) el.classList.remove('pausado'); });

  // ================= cliques =================
  document.addEventListener('click', e => {
    const t = e.target;
    const add = t.closest('[data-add]');
    if (add) { mudarQtd(add.dataset.add, 1); return; }
    const passo = t.closest('[data-passo]');
    if (passo && t.closest('[data-mais]')) { mudarQtd(passo.dataset.passo, (estado.lista[passo.dataset.passo] || 0) + 1); return; }
    if (passo && t.closest('[data-menos]')) { mudarQtd(passo.dataset.passo, (estado.lista[passo.dataset.passo] || 0) - 1); return; }
    const abrir = t.closest('[data-abrir]');
    if (abrir) { location.hash = 'p/' + abrir.dataset.abrir; return; }
    const cat = t.closest('[data-cat]');
    if (cat) { escolherCategoria(cat.dataset.cat); return; }
    const rolar = t.closest('[data-rolar]');
    if (rolar) { const f = $('#destaques'); f.scrollBy({ left: +rolar.dataset.rolar * f.clientWidth * .8, behavior: 'smooth' }); return; }
    if (t.closest('[data-inicio]')) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (t.closest('[data-fechar]')) { t.closest('dialog').close(); }
  });

  document.addEventListener('change', e => {
    const passo = e.target.closest('[data-passo]');
    if (passo && e.target.matches('input')) mudarQtd(passo.dataset.passo, parseInt(e.target.value, 10) || 0);
  });

  // fechar diálogos clicando fora
  $$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

  // ================= lista de orçamento =================
  function mudarQtd(id, q) {
    const p = estado.porId[id];
    if (!p || p.esgotado) return;
    q = Math.max(0, Math.min(9999, q | 0));
    const antes = estado.lista[id] || 0;
    if (q) estado.lista[id] = q; else delete estado.lista[id];
    guarda.gravar('aiker-lista', estado.lista);
    redesenharAcoes(id);
    atualizarContador(!antes && q);
    if ($('#gaveta').open) desenharLista();
    if (!antes && q) aviso(`${p.codigo} adicionado à lista`);
  }

  function itens() {
    return Object.entries(estado.lista).map(([id, q]) => ({ p: estado.porId[id], q })).filter(x => x.p);
  }

  function totais() {
    let total = 0, caixas = 0, unidades = 0;
    const its = itens();
    its.forEach(({ p, q }) => { caixas += q; unidades += q * p.pcs; if (p.precoFinal != null) total += q * p.pcs * p.precoFinal; });
    return { total, caixas, unidades, n: its.length };
  }

  function atualizarContador(pulsar) {
    const n = itens().length;
    const c = $('#contLista');
    c.hidden = !n;
    c.textContent = n;
    if (pulsar) { const b = $('#abrirLista'); b.classList.remove('pulsa'); void b.offsetWidth; b.classList.add('pulsa'); }
  }

  $('#abrirLista').addEventListener('click', () => { desenharLista(); $('#gaveta').showModal(); });

  function desenharLista() {
    const its = itens();
    const t = totais();
    $('#gavetaPe').hidden = !its.length;
    $('#listaResumo').textContent = its.length ? `${t.n} produto${t.n > 1 ? 's' : ''} · ${t.caixas} caixa${t.caixas > 1 ? 's' : ''} · ${t.unidades.toLocaleString('pt-BR')} unidades` : 'Nenhum item';
    if (!its.length) {
      $('#itens').innerHTML = `<div class="lista-vazia"><div class="icone">${ICO_LISTA}</div><strong>Sua lista está vazia</strong>Adicione produtos do catálogo para montar seu orçamento.</div>`;
      return;
    }
    $('#itens').innerHTML = its.map(({ p, q }) => {
      const sub = p.precoFinal != null ? q * p.pcs * p.precoFinal : null;
      return `<div class="item">
        <div class="item-img">${p.fotos[0] ? `<img src="${esc(window.Aiker.miniUrl(p.fotos[0]))}" alt="">` : ''}</div>
        <div>
          <div class="item-cod">${esc(p.codigo)}</div>
          <p class="item-nome">${esc(p.nome)}</p>
          <div class="item-linha">
            <div class="passo" data-passo="${p.id}">
              <button type="button" data-menos aria-label="Diminuir">−</button>
              <label><input type="number" inputmode="numeric" min="0" value="${q}" aria-label="Caixas"> cx</label>
              <button type="button" data-mais aria-label="Aumentar">+</button>
            </div>
            <div class="item-sub">${sub != null ? brl(sub) : 'Sob consulta'}<small>${(q * p.pcs).toLocaleString('pt-BR')} un. × ${p.precoFinal != null ? brl(p.precoFinal) : '—'}</small></div>
          </div>
          <button class="item-rem" type="button" data-remover="${p.id}">Remover</button>
        </div>
      </div>`;
    }).join('');
    $('#total').textContent = brl(t.total);
    const c = estado.consultor;
    $('#paraConsultor').textContent = 'Envie esta lista para o vendedor que te passou o catálogo.';
  }

  $('#itens').addEventListener('click', e => {
    const r = e.target.closest('[data-remover]');
    if (r) mudarQtd(r.dataset.remover, 0);
  });

  $('#limpar').addEventListener('click', () => {
    if (!confirm('Remover todos os itens da lista?')) return;
    const ids = Object.keys(estado.lista);
    estado.lista = {};
    guarda.gravar('aiker-lista', estado.lista);
    ids.forEach(redesenharAcoes);
    atualizarContador();
    desenharLista();
  });

  // dados do cliente lembrados neste aparelho
  const CAMPOS = ['cNome', 'cEmpresa', 'cCnpj', 'cCidade', 'cObs'];
  const cli = guarda.ler('aiker-cliente', {});
  CAMPOS.forEach(id => { $('#' + id).value = cli[id] || ''; $('#' + id).addEventListener('input', salvarCliente); });
  function salvarCliente() { const o = {}; CAMPOS.forEach(id => { o[id] = $('#' + id).value; }); guarda.gravar('aiker-cliente', o); }
  function cliente() { const o = {}; CAMPOS.forEach(id => { o[id] = $('#' + id).value.trim(); }); return o; }

  function textoLista() {
    const c = cliente();
    const t = totais();
    const hoje = new Date().toLocaleDateString('pt-BR');
    const cab = [
      'LISTA DE ORÇAMENTO - AIKER',
      estado.consultor && `Consultor: ${estado.consultor.nome}`,
      c.cNome && `Cliente: ${c.cNome}`,
      c.cEmpresa && `Empresa: ${c.cEmpresa}`,
      c.cCnpj && `CNPJ: ${c.cCnpj}`,
      c.cCidade && `Cidade: ${c.cCidade}`,
    ].filter(Boolean);
    const linhas = itens().map(({ p, q }, i) => {
      const un = q * p.pcs;
      const preco = p.precoFinal != null ? `${brl(p.precoFinal)}/un = ${brl(un * p.precoFinal)}` : 'preço sob consulta';
      return `${i + 1}) ${p.codigo} - ${p.nome}\n    ${q} cx x ${p.pcs} un = ${un.toLocaleString('pt-BR')} un | ${preco}`;
    });
    return [
      ...cab, '',
      ...linhas, '',
      `Total estimado: ${brl(t.total)}`,
      `${t.n} produto(s), ${t.caixas} caixa(s), ${t.unidades.toLocaleString('pt-BR')} unidades`,
      ...(c.cObs ? ['', `Observações: ${c.cObs}`] : []),
      '',
      `Lista gerada em ${hoje} pelo catálogo online Aiker. Valores de tabela, sujeitos à confirmação.`,
      '',
      `Vendedor: abra a lista pronta aqui → ${linkVendedor()}`,
    ].join('\n');
  }

  // link que abre a lista pronta na área do vendedor
  function linkVendedor() {
    const c = cliente();
    const dados = { i: itens().map(({ p, q }) => [p.codigo, q]), c: { nome: c.cNome, empresa: c.cEmpresa, cnpj: c.cCnpj, cidade: c.cCidade, obs: c.cObs } };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(dados)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return new URL('vendedor.html', location.href).href + '#lista=' + b64;
  }

  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (er) { /* sem cópia */ }
      ta.remove();
      return ok;
    }
  }

  $('#copiar').addEventListener('click', async () => {
    aviso(await copiar(textoLista()) ? 'Lista copiada. Cole na conversa com o seu vendedor.' : 'Não foi possível copiar.');
  });

  $('#compartilhar').addEventListener('click', async () => {
    const texto = textoLista();
    if (navigator.share) {
      try { await navigator.share({ title: 'Lista de orçamento Aiker', text: texto }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    aviso(await copiar(texto) ? 'Lista copiada. Cole na conversa com o seu vendedor.' : 'Não foi possível copiar.');
  });

  $('#baixarPdf').addEventListener('click', () => {
    const c = cliente();
    const t = totais();
    const hoje = new Date().toLocaleDateString('pt-BR');
    $('#impressao').innerHTML = `
      <div class="imp-cab"><img src="img/logo-laranja.png" alt="aiker"><div><h1>Lista de orçamento</h1><p>${hoje}${estado.consultor ? ' · Consultor: ' + esc(estado.consultor.nome) : ''}</p></div></div>
      <div class="imp-cli">${[['Cliente', c.cNome], ['Empresa', c.cEmpresa], ['CNPJ', c.cCnpj], ['Cidade', c.cCidade]].filter(x => x[1]).map(x => `<div><b>${x[0]}:</b> ${esc(x[1])}</div>`).join('')}</div>
      <table>
        <thead><tr><th></th><th>Código</th><th>Produto</th><th class="num">Caixas</th><th class="num">Unidades</th><th class="num">Preço un.</th><th class="num">Subtotal</th></tr></thead>
        <tbody>${itens().map(({ p, q }) => `<tr>
          <td>${p.fotos[0] ? `<img src="${esc(p.fotos[0])}" alt="">` : ''}</td>
          <td>${esc(p.codigo)}</td><td>${esc(p.nome)}</td>
          <td class="num">${q}</td><td class="num">${(q * p.pcs).toLocaleString('pt-BR')}</td>
          <td class="num">${p.precoFinal != null ? brl(p.precoFinal) : '—'}</td>
          <td class="num">${p.precoFinal != null ? brl(q * p.pcs * p.precoFinal) : 'Sob consulta'}</td></tr>`).join('')}</tbody>
      </table>
      <div class="imp-total"><span>${t.caixas} caixas · ${t.unidades.toLocaleString('pt-BR')} unidades</span><strong>Total estimado: ${brl(t.total)}</strong></div>
      ${c.cObs ? `<p class="imp-nota"><b>Observações:</b> ${esc(c.cObs)}</p>` : ''}
      <p class="imp-nota">Valores de tabela, sem descontos de campanha. Preços, condições e disponibilidade sujeitos à confirmação do vendedor. Imagens meramente ilustrativas.</p>`;
    const titulo = document.title;
    document.title = `Lista de orçamento Aiker ${hoje.replace(/\//g, '-')}`;
    document.body.classList.add('imprimir-lista');
    const fim = () => { document.body.classList.remove('imprimir-lista'); document.title = titulo; window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim);
    setTimeout(() => window.print(), 300);
  });

  // ================= detalhe do produto =================
  function abrirPeloHash() {
    const m = location.hash.match(/^#p\/(.+)$/);
    const modal = $('#modalProd');
    const p = m && estado.porId[decodeURIComponent(m[1])];
    if (p) abrirProduto(p);
    else if (modal.open) modal.close();
  }
  window.addEventListener('hashchange', abrirPeloHash);

  function abrirProduto(p) {
    const m = $('#modalProd');
    m.dataset.id = p.id;
    const multi = p.fotos.length > 1;
    m.innerHTML = `<button class="fechar" type="button" data-fechar aria-label="Fechar">×</button>
    <div class="det">
      <div class="det-galeria">
        <div class="palco">
          <div class="palco-trilho" id="palco">${p.fotos.length ? p.fotos.map((f, i) => `<figure><img src="${esc(f)}" alt="${esc(p.nome)}, foto ${i + 1}" ${p.esgotado ? 'style="filter:grayscale(1);opacity:.55"' : ''}></figure>`).join('') : '<figure><span class="sem-foto">Imagem indisponível</span></figure>'}</div>
          ${multi ? `<button class="seta esq" type="button" data-seta="-1" aria-label="Foto anterior">‹</button><button class="seta dir" type="button" data-seta="1" aria-label="Próxima foto">›</button><span class="contador" id="contadorFoto">1 / ${p.fotos.length}</span>` : ''}
        </div>
        ${multi ? `<div class="miniaturas">${p.fotos.map((f, i) => `<button type="button" data-mini="${i}" class="${i ? '' : 'on'}" aria-label="Foto ${i + 1}"><img src="${esc(f)}" alt=""></button>`).join('')}</div>` : ''}
      </div>
      <div class="det-info">
        <div>
          <p class="migalha">${esc(p.categoria)}</p>
          <h2 class="det-nome">${esc(p.nome)}</h2>
          <div class="det-cod">Código <b>${esc(p.codigo)}</b>${p.esgotado ? '<span class="estoque fora">Esgotado</span>' : '<span class="estoque"><i aria-hidden="true"></i>Em estoque</span>'}${desconto(p) > 0 && !p.esgotado ? `<span class="selo promo">−${desconto(p)}%</span>` : ''}</div>
        </div>
        <div class="det-preco">
          ${precoHtml(p)}
          <div class="det-caixa"><span>Caixa com <b>${esc(p.pcsTxt || p.pcs)}</b> unidades</span>${p.precoFinal != null ? `<span><b>${valorCaixa(p)}</b> a caixa</span>` : ''}</div>
          <div class="det-acao">${acaoHtml(p)}</div>
        </div>
        ${p.specs.length ? `<div class="ficha"><p class="ficha-tit">Especificações</p><dl>${p.specs.map(s => `<div><dt>${esc(s.rotulo || 'Detalhe')}</dt><dd>${esc(s.valor)}</dd></div>`).join('')}</dl></div>` : ''}
        <p class="det-nota">Imagens meramente ilustrativas. Dúvidas sobre especificações e funcionalidades, fale com o seu vendedor.</p>
      </div>
    </div>`;
    if (!m.open) m.showModal();
    const palco = $('#palco', m);
    palco.addEventListener('scroll', () => {
      const i = Math.round(palco.scrollLeft / palco.clientWidth);
      $$('[data-mini]', m).forEach((b, k) => b.classList.toggle('on', k === i));
      const c = $('#contadorFoto', m);
      if (c) c.textContent = `${i + 1} / ${p.fotos.length}`;
    }, { passive: true });
  }

  $('#modalProd').addEventListener('click', e => {
    const palco = $('#palco', e.currentTarget);
    if (!palco) return;
    const n = palco.children.length;
    const seta = e.target.closest('[data-seta]');
    if (seta) {
      const i = Math.round(palco.scrollLeft / palco.clientWidth);
      palco.scrollTo({ left: ((i + +seta.dataset.seta + n) % n) * palco.clientWidth, behavior: 'smooth' });
    }
    const mini = e.target.closest('[data-mini]');
    if (mini) palco.scrollTo({ left: +mini.dataset.mini * palco.clientWidth, behavior: 'smooth' });
  });

  $('#modalProd').addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const b = $(`[data-seta="${e.key === 'ArrowLeft' ? -1 : 1}"]`, e.currentTarget);
    if (b) b.click();
  });

  $('#modalProd').addEventListener('close', () => {
    if (location.hash.startsWith('#p/')) history.replaceState(null, '', location.pathname + location.search);
  });

  // ================= aviso =================
  let tAviso;
  const avisoEl = document.getElementById('toast'); // guardado: sobrevive se a janela em que estava for redesenhada
  function aviso(t) {
    const a = avisoEl;
    (document.querySelector('dialog[open]') || document.body).appendChild(a);
    a.textContent = t;
    a.classList.add('on');
    clearTimeout(tAviso);
    tAviso = setTimeout(() => a.classList.remove('on'), 2400);
  }
})();
