// Carregamento e tratamento dos dados (usado pelo catálogo e pela tabela em PDF).
(function () {
  const CFG = window.AIKER_CONFIG || { planilha: {} };

  // Janela aberta com o mouse: o foco fica na própria janela, sem acender o contorno de teclado no botão "fechar".
  // Aberta pelo teclado, continua no primeiro botão (quem navega com Tab precisa saber onde está).
  let viaTeclado = false;
  addEventListener('keydown', e => { if (!e.ctrlKey && !e.metaKey) viaTeclado = true; }, true);
  addEventListener('pointerdown', () => { viaTeclado = false; }, true);
  if (window.HTMLDialogElement) {
    const abrirJanela = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function () {
      abrirJanela.call(this);
      if (!viaTeclado && !this.querySelector('[autofocus]')) { this.tabIndex = -1; this.focus({ preventScroll: true }); }
    };
  }

  // ---------- CSV ----------
  function parseCSV(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
        } else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  }

  // Cabeçalho sem acento, maiúsculo e com espaços simples: "Preço Promo" -> "PRECO PROMO"
  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  }

  function toObjects(rows) {
    if (!rows || !rows.length) return [];
    const head = rows[0].map(norm);
    return rows.slice(1).map(r => {
      const o = {};
      head.forEach((h, i) => { o[h] = (r[i] == null ? '' : String(r[i])).trim(); });
      return o;
    });
  }

  // "R$ 1.100,00", "1100.00", "57.8", "15" -> número (ou null)
  function parsePreco(v) {
    if (v == null) return null;
    let s = String(v).replace(/[^\d.,-]/g, '');
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function sim(v) { return /^(s|sim|x|1|true|verdadeiro|yes)$/i.test(String(v || '').trim()); }
  function nao(v) { return /^(n|nao|não|0|false|falso|no)$/i.test(String(v || '').trim()); }

  const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  function brl(n) { return n == null ? '' : moeda.format(n); }

  // ---------- texto "bonito": tira o CAIXA ALTA mantendo siglas e medidas ----------
  const SIGLAS = new Set('W V Ω KW MP3 MP4 MP5 USB USB-C USB-A LED LEDS RGB DIN HD SD IPS QLED LCD AV FM AM OBD II V2L AUX P2 DC AC RMS THD GB TB RAM MTK GPS PET SUV UV IR 4K 2K WI-FI WIFI BT ABS TV SMD XGG GG PP MP GP P G M ACC-P ACC-G ACC-GG ACC-XGG'.split(' '));
  const MINUSC = new Set('de da do das dos e com para em a o as os ao à até por sem na no nas nos ou p/ c/ x'.split(' '));
  const ESPECIAIS = { CARPLAY: 'CarPlay', 'WI-FI': 'Wi-Fi', WIFI: 'Wi-Fi', LINUX: 'Linux', ANDROID: 'Android', ALLWINNER: 'Allwinner', OCTACORE: 'Octa-core', 'QUAD-CORE': 'Quad-core', HZ: 'Hz', KHZ: 'kHz', MHZ: 'MHz', GHZ: 'GHz', FULL: 'Full' };

  function palavra(w, primeira) {
    if (!w) return w;
    const limpo = w.replace(/[^\p{L}\p{N}/-]/gu, '');
    const up = limpo.toUpperCase();
    if (ESPECIAIS[up]) return w.replace(limpo, ESPECIAIS[up]);
    if (SIGLAS.has(up)) return w;
    if (/\d/.test(w)) {
      // medidas: 18MM -> 18mm, 1080P -> 1080p, 1.5M -> 1,5 m fica 1.5m
      return w.replace(/^(\d+(?:[.,]\d+)?)(MM|CM|M|KG|G|P|ML|L)$/i, (_, n, u) => n + u.toLowerCase())
        .replace(/^(\d+(?:[.,]\d+)?)(HZ)$/i, '$1Hz').replace(/^(\d+(?:[.,]\d+)?)(KHZ)$/i, '$1kHz').replace(/^(\d+(?:[.,]\d+)?)(MHZ)$/i, '$1MHz');
    }
    const low = w.toLowerCase();
    if (!primeira && MINUSC.has(low)) return low;
    return low.replace(/^(\P{L}*)(\p{L})/u, (_, a, b) => a + b.toUpperCase());
  }

  function bonito(s, modo) {
    s = String(s || '').trim();
    if (!s) return s;
    // só converte se estiver todo em maiúsculas
    if (s !== s.toUpperCase()) return s;
    const partes = s.split(/(\s+)/);
    let primeira = true;
    return partes.map(p => {
      if (/^\s+$/.test(p)) return p;
      const r = modo === 'frase' && !primeira ? (SIGLAS.has(p.replace(/[^\p{L}\p{N}/-]/gu, '').toUpperCase()) || /\d/.test(p) || ESPECIAIS[p.toUpperCase()] ? palavra(p, false) : p.toLowerCase()) : palavra(p, primeira);
      primeira = false;
      return r;
    }).join('').replace(/\bAndroid auto\b/g, 'Android Auto');
  }

  // Links de foto: nome de arquivo (pasta fotos/), link direto, ou link do Google Drive
  function fotoUrl(v) {
    v = String(v || '').trim();
    if (!v) return '';
    const drive = v.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=|thumbnail\?id=)([\w-]{20,})/);
    if (drive) return 'https://lh3.googleusercontent.com/d/' + drive[1] + '=w1200';
    if (/^https?:\/\//i.test(v)) return v;
    return v.includes('/') ? v : 'fotos/' + v;
  }

  // versões leves das fotos da pasta fotos/: mini (240 px, listas) e média (800 px, cards)
  const leve = (u, pasta) => { u = fotoUrl(u); return /^fotos\/[^/]+\.webp$/i.test(u) ? u.replace(/^fotos\//, 'fotos/' + pasta + '/') : u; };
  const miniUrl = u => leve(u, 'mini');
  const medioUrl = u => leve(u, 'pdf');
  // se a versão leve ainda não existir (foto nova), usa a original
  document.addEventListener('error', e => {
    const im = e.target;
    if (im && im.tagName === 'IMG' && /\/fotos\/(mini|pdf)\//.test(im.src)) im.src = im.src.replace(/\/fotos\/(mini|pdf)\//, '/fotos/');
  }, true);

  function slug(s) {
    return norm(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  // ---------- origem dos dados ----------
  // Com CFG.api preenchido, lê o catálogo PUBLICADO pelo admin. Sem ele (ou se falhar), usa a cópia local.
  async function buscarCatalogo() {
    // prévia do admin: tabela gerada com o rascunho atual (inclui o que ainda não foi publicado)
    const ps = (location.search.match(/[?&]previaServidor=([\w-]+)/) || [])[1];
    if (ps && CFG.api) {
      try { const j = await (await fetch(CFG.api + '?acao=previaArquivo&id=' + ps, { cache: 'no-store' })).json(); if (j.ok && Array.isArray(j.produtos)) return { dados: j, origem: 'previa' }; } catch (e) { /* segue */ }
    }
    if (/[?&]previa=1/.test(location.search)) {
      try { const p = JSON.parse(localStorage.getItem('aiker-previa') || 'null'); if (p && Array.isArray(p.produtos)) return { dados: p, origem: 'previa' }; } catch (e) {}
    }
    if (CFG.api) {
      try {
        const r = await fetch(CFG.api + (CFG.api.includes('?') ? '&' : '?') + 'acao=catalogo&_=' + Date.now(), { cache: 'no-store' });
        const j = await r.json();
        if (j && j.ok !== false && Array.isArray(j.produtos)) return { dados: j, origem: 'servidor' };
        throw new Error((j && j.erro) || 'resposta inválida');
      } catch (e) {
        console.warn('Falha ao carregar o catálogo do servidor, usando cópia local.', e);
      }
    }
    return { dados: window.AIKER_DADOS_LOCAIS || { produtos: [], config: {}, vendedores: [] }, origem: 'local' };
  }

  // Converte os produtos guardados ({codigo, nome, preco, ...}) no formato de exibição
  // data de hoje no formato AAAA-MM-DD (para comparar com as datas de promoção)
  function hojeISO() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  // promoção vale hoje? (sem datas = vale sempre)
  function promoNoPrazo(de, ate) { const h = hojeISO(); return (!de || h >= de) && (!ate || h <= ate); }
  function montarProdutos(lista) {
    const saida = [];
    const vistos = {};
    (lista || []).forEach((p, i) => {
      if (!p || !p.codigo || p.ativo === false) return;
      if (p.esgotado) p = { codigo: 'ESG-' + i, categoria: p.categoria, nome: '', esgotado: true, anonimo: true, specs: [], fotos: [] };
      const preco = typeof p.preco === 'number' ? p.preco : parsePreco(p.preco);
      let promo = typeof p.promo === 'number' ? p.promo : parsePreco(p.promo);
      if (promo != null && preco != null && promo >= preco) promo = null;
      if (promo != null && !promoNoPrazo(p.promoDe, p.promoAte)) promo = null;
      const specs = (p.specs || []).filter(Boolean).map(s => {
        const m = String(s).match(/^([^:]{1,60}):\s*(.*)$/);
        return m ? { rotulo: bonito(m[1].trim(), 'frase'), valor: bonito(m[2].trim(), 'frase') } : { rotulo: '', valor: bonito(String(s), 'frase') };
      });
      const fotos = (p.fotos || []).map(fotoUrl).filter(Boolean);
      const pcsTxt = String(p.pcs == null ? '' : p.pcs);
      const pcs = parseInt(pcsTxt.match(/\d+/) || '0', 10) || 1;
      let id = slug(p.codigo);
      if (vistos[id]) id += '-' + i;
      vistos[id] = 1;
      saida.push({
        id, codigo: String(p.codigo), categoria: bonitoCat(p.categoria) || 'Outros',
        nome: bonito(p.nome || ''), preco, promo, precoFinal: promo != null ? promo : preco,
        pcsTxt, pcs, esgotado: !!p.esgotado, anonimo: !!p.anonimo, destaque: !!p.destaque, specs, fotos, ordem: i, novidade: p.novidade || null, novaLinha: !!p.novaLinha, vazioAntes: Math.max(0, parseInt(p.vazioAntes, 10) || 0),
        // últimas unidades: vem pronto da publicação (o número do estoque não é publicado)
        poucas: !p.esgotado && (p.poucas === true || (typeof p.estoque === 'number' && p.estoque > 0 && p.estoque <= pcs * 2)),
      });
    });
    return saida;
  }

  function bonitoCat(c) { return bonito(String(c || '').replace(/\s*\/\s*/g, ' | ')); }

  function montarConfig(c, vendedores, publicadoEm) {
    c = c || {};
    return {
      promo: c.promoAtiva && promoNoPrazo(c.promoInicio, c.promoFim) ? { titulo: c.promoTitulo || '', texto: c.promoTexto || '', obs: c.promoObs || '', validade: c.promoValidade || '' } : null,
      telefone: c.telefone || '', email: c.email || '',
      capaPromoPdf: fotoUrl(c.capaPromoPdf),
      capaPdf: fotoUrl(c.capaPdf || 'img/capa.webp'),
      capaNovidadesPdf: fotoUrl(c.capaNovidadesPdf),
      descontoGeral: Math.min(99, Math.max(0, Number(c.descontoGeral) || 0)), semPreco: !!c.semPreco,
      heroImg: fotoUrl(c.heroImg || 'img/hero.webp'),
      heroTitulo: c.heroTitulo || '', heroTexto: c.heroTexto || '',
      pdfPromo: c.pdfPromo !== false && c.pdfPromo !== 'NÃO', pdfEsgotados: c.pdfEsgotados !== false && c.pdfEsgotados !== 'NÃO',
      atualizadoEm: publicadoEm || '',
      modoNovidades: !!c.modoNovidades, novidadesDesde: c.novidadesDesde || '',
      vendedores: (vendedores || []).filter(v => v && v.nome).map(v => ({ nome: v.nome, contato: v.contato || '', id: slug(v.apelido || v.nome) })),
    };
  }

  async function carregarTudo() {
    const { dados, origem } = await buscarCatalogo();
    const produtos = montarProdutos(dados.produtos);
    const config = montarConfig(dados.config, dados.vendedores, dados.publicadoEm);
    // ordem definida no admin (config.categorias); categorias sem produto não aparecem
    const usadas = new Set(produtos.map(p => p.categoria));
    const categorias = [];
    (((dados.config || {}).categorias) || []).map(bonitoCat).forEach(cat => { if (usadas.has(cat) && !categorias.includes(cat)) categorias.push(cat); });
    produtos.forEach(p => { if (!categorias.includes(p.categoria)) categorias.push(p.categoria); });
    // produtos agrupados na ordem das categorias (o resto da ordem é mantido)
    const pos = new Map(categorias.map((cat, i) => [cat, i]));
    produtos.sort((x, y) => (pos.get(x.categoria) - pos.get(y.categoria)) || (x.ordem - y.ordem));
    return { produtos, categorias, config, origem };
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.Aiker = { miniUrl, medioUrl, hojeISO, promoNoPrazo, carregarTudo, montarProdutos, toObjects, sim, nao, brl, esc, slug, norm, bonito, parsePreco, parseCSV, fotoUrl, CFG };
})();
