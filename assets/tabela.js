(function () {
  const { brl, esc, slug } = window.Aiker;
  const POR_PAGINA = 9;
  let dados;

  const num = n => (n == null ? '' : 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
  const hoje = new Date().toLocaleDateString('pt-BR');

  window.Aiker.carregarTudo().then(d => { dados = d; montar(); });

  document.getElementById('gerar').addEventListener('click', () => window.print());
  window.addEventListener('resize', ajustarZoom);

  // card no modelo da Proposta D: produto em destaque, preço un. + valor da caixa
  const pcsN = p => p.pcs || 1;
  const desconto = p => (p.promo != null && p.preco ? Math.round((1 - p.promo / p.preco) * 100) : 0);
  // foto mais leve para o PDF (800 px = 300 dpi no tamanho do card); se não existir, usa a original
  function fotoPdf(u) {
    if (/googleusercontent\.com/.test(u)) return u.replace(/=w\d+$/, '=w800');
    if (/^fotos\/[^/]+$/.test(u)) return u.replace(/^fotos\//, 'fotos/pdf/');
    return u;
  }
  function card(p) {
    // esgotado: mantém o espaço, mas sem nada que identifique o produto
    if (p.esgotado) return `<div class="d-c d-anon"><div class="d-anon-in">
      <img src="img/icone.png" alt="" class="d-anon-marca">
      <span class="d-anon-tag">Esgotado</span>
      <small>Reposição: consulte seu vendedor</small></div></div>`;
    const cfg = dados.config;
    // desconto em todos os produtos (opção do Gerar PDF): sobre o preço de hoje
    if (cfg.descontoGeral > 0 && p.precoFinal != null) p = { ...p, precoFinal: Math.round(p.precoFinal * (1 - cfg.descontoGeral / 100) * 100) / 100 };
    const o = cfg.semPreco ? 0 : cfg.descontoGeral > 0 ? (p.preco && p.precoFinal < p.preco ? Math.round((1 - p.precoFinal / p.preco) * 100) : 0) : desconto(p);
    const nv = p.novidade;
    const specs = p.specs.slice(0, 4).map(s => `<div><dt>${esc(s.rotulo || 'Detalhe')}</dt><dd>${esc(s.valor)}</dd></div>`).join('');
    const preco = cfg.semPreco ? '<div><span class="d-valor d-consulte">Consulte seu vendedor</span></div>'
      : p.precoFinal == null
      ? '<div><span class="d-valor">Consulte</span></div>'
      : `<div>${o ? `<span class="d-de">${num(p.preco)}</span>` : nv && nv.de ? `<span class="d-de">${num(nv.de)}</span>` : ''}<span class="d-valor">${num(p.precoFinal)}<small>/un.</small></span></div>`;
    const caixa = cfg.semPreco || p.precoFinal == null ? `<div class="d-cx">Caixa c/ ${esc(p.pcsTxt || pcsN(p))} un.</div>` : `<div class="d-cx">Caixa c/ ${esc(p.pcsTxt || pcsN(p))} un.<b>${num(p.precoFinal * pcsN(p))}</b></div>`;
    return `<div class="d-c ${p.esgotado ? 'esg' : ''}">
      <div class="d-img">${p.fotos[0] ? `<img src="${esc(fotoPdf(p.fotos[0]))}" data-orig="${esc(p.fotos[0])}" onerror="if(this.dataset.orig&&this.src.indexOf(this.dataset.orig)<0)this.src=this.dataset.orig" alt="">` : ''}<span class="d-cod">${esc(p.codigo)}</span>${o && !p.esgotado ? `<span class="d-off">−${o}%</span>` : ''}${p.esgotado ? '<span class="d-esg">ESGOTADO</span>' : ''}${nv ? `<span class="d-nov d-nov-${esc(nv.tipo)}">${esc(nv.txt)}</span>` : ''}</div>
      <div class="d-corpo">
        <h3 class="d-nome">${esc(p.nome)}</h3>
        <dl class="d-specs">${specs}</dl>
        <div class="d-pe ${o ? 'promo' : ''}">${preco}${caixa}</div>
      </div>
    </div>`;
  }

  function montar() {
    if (!dados) return;
    // opções definidas pelo admin (Configurações); o link pode forçar: ?promo=0 / ?esgotados=0
    const q = new URLSearchParams(location.search);
    const op = (k, cfg) => (q.has(k) ? q.get(k) !== '0' : cfg !== false);
    const comPromo = op('promo', dados.config.pdfPromo);
    const comEsg = op('esgotados', dados.config.pdfEsgotados);
    document.getElementById('painelInfo').textContent = (dados.config.modoNovidades ? 'Tabela de novidades' : 'Tabela de produtos') + ' · atualizada em ' + (dados.config.atualizadoEm || hoje).split(' ')[0];
    const folhas = [];

    const nov = dados.config.modoNovidades;
    if (nov) {
      const tipos = {}; dados.produtos.forEach(p => { if (p.novidade) tipos[p.novidade.tipo] = (tipos[p.novidade.tipo] || 0) + 1; });
      const rot = { baixou: 'com preço menor', preco: 'com preço atualizado', voltou: 'de volta ao estoque', novo: 'novos' };
      if (dados.config.capaNovidadesPdf) folhas.push(`<section class="folha folha-img"><img src="${esc(dados.config.capaNovidadesPdf)}" alt="Novidades"></section>`);
      else folhas.push(`<section class="folha nov-capa"><img src="img/logo-laranja.png" alt="aiker"><p class="nov-sobre">Tabela de</p><h1>Novidades</h1><p class="nov-desde">O que mudou desde ${esc(dados.config.novidadesDesde)} · atualizada em ${hoje}</p><ul>${Object.keys(rot).filter(k => tipos[k]).map(k => `<li><b>${tipos[k]}</b>${rot[k]}</li>`).join('')}</ul><footer>Preços e estoque sujeitos a alteração. Consulte seu vendedor.</footer></section>`);
    }
    if (!nov && comPromo && dados.config.promo && dados.config.capaPromoPdf) {
      folhas.push(`<section class="folha folha-img"><img src="${esc(dados.config.capaPromoPdf)}" alt="Promoção"></section>`);
    }
    if (!nov) folhas.push(`<section class="folha folha-img"><img src="${esc(dados.config.capaPdf || 'img/capa.webp')}" alt="Aiker - Tecnologia automotiva"></section>`);

    const lista = dados.produtos.filter(p => comEsg || !p.esgotado);
    const grupos = {};
    lista.forEach(p => (grupos[p.categoria] = grupos[p.categoria] || []).push(p));
    const cats = dados.categorias.filter(c => grupos[c]);

    // índice visual: foto, quantidade e página de cada categoria
    const POR = POR_PAGINA;
    let pag = folhas.length + 2; // página do índice + 1
    const inicio = {};
    // casas em branco definidas em Organizar tabela (vazioAntes; novaLinha é o formato antigo)
    const casas = c => { const l = []; grupos[c].forEach(p => { if (!nov && p.novaLinha && l.length % 3) while (l.length % 3) l.push(null); if (!nov) for (let k = 0; k < (p.vazioAntes || 0); k++) l.push(null); l.push(p); }); return l; };
    cats.forEach(c => { inicio[c] = pag; pag += Math.ceil(casas(c).length / POR); });
    const fotoDe = c => {
      const l = grupos[c].filter(p => p.fotos[0]);
      const p = l.find(x => x.destaque && !x.esgotado) || l.find(x => !x.esgotado) || l[0];
      return p ? p.fotos[0] : '';
    };
    const linhas = Math.ceil(cats.length / 2);
    const ICO_TOQUE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11.2V5.5a2 2 0 1 1 4 0v4.3l4.4.9a2.5 2.5 0 0 1 2 2.8l-.8 5.4A3 3 0 0 1 15.6 21H11a3 3 0 0 1-2.4-1.2l-3.4-4.6a1.8 1.8 0 0 1 2.7-2.4L9 13.9V11.2z"/></svg>';
    if (!nov) folhas.push(`<section class="folha indice" id="categorias">
      <header class="ind-cab">
        <div>
          <img class="ind-logo" src="img/logo-laranja.png" alt="aiker">
          <h2>Categorias</h2>
          <p class="ind-dica">${ICO_TOQUE}Toque na categoria para ir direto à página.</p>
        </div>
        <dl class="ind-resumo">
          <div><dt>Produtos</dt><dd>${lista.length}</dd></div>
          <div><dt>Categorias</dt><dd>${cats.length}</dd></div>
          <div><dt>Atualizada</dt><dd>${hoje.slice(0, 5)}</dd></div>
        </dl>
      </header>
      <ol class="ind-grade" style="--linhas:${linhas}">${cats.map(c => `<li><a href="#cat-${slug(c)}">
        <span class="ind-foto">${fotoDe(c) ? `<img src="${esc(fotoPdf(fotoDe(c)))}" alt="">` : ''}</span>
        <span class="ind-txt"><b>${esc(c)}</b><small>${grupos[c].filter(p => !p.esgotado).length} disponíve${grupos[c].filter(p => !p.esgotado).length === 1 ? 'l' : 'is'}</small></span>
        <span class="ind-pag"><small>pág.</small>${inicio[c]}</span>
      </a></li>`).join('')}</ol>
      <footer class="ind-rodape">Imagens meramente ilustrativas. Dúvidas sobre produtos, especificações ou funcionalidades: fale com o suporte técnico ou com o seu vendedor.</footer>
    </section>`);

    cats.forEach(c => {
      const itens = casas(c);
      for (let i = 0; i < itens.length; i += POR_PAGINA) {
        folhas.push(`<section class="folha"${i === 0 ? ` id="cat-${slug(c)}"` : ''}>
          <header class="cab"><h2>${nov ? '<small>Novidades</small>' : ''}${esc(c)}</h2><img src="img/logo-escuro.png" alt="aiker"></header>
          <div class="grade">${itens.slice(i, i + POR_PAGINA).map(p => (p ? card(p) : '<div class="d-c d-vazio" aria-hidden="true"></div>')).join('')}</div>
          <span class="data">Atualizado em ${hoje}</span>
          ${nov ? '' : '<a class="voltar" href="#categorias">VOLTAR AO INÍCIO</a>'}
          <div class="pe"></div>
        </section>`);
      }
    });

    document.getElementById('folhas').innerHTML = folhas.join('');
    document.title = `${nov ? 'Novidades' : 'Tabela'} Aiker ${hoje.replace(/\//g, '-')}`;
    ajustarZoom();
  }

  // na tela do celular, reduz as folhas para caber na largura
  function ajustarZoom() {
    const el = document.getElementById('folhas');
    const larg = 794 + 24; // 210mm ≈ 794px
    el.style.zoom = Math.min(1, window.innerWidth / larg);
  }
  window.addEventListener('beforeprint', () => { document.getElementById('folhas').style.zoom = 1; });
  window.addEventListener('afterprint', ajustarZoom);
})();
