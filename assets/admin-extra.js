// Extras do painel da Aiker: olho para ver a senha.
// Funciona também nas janelas criadas depois (MutationObserver).
(function () {
  // ---------- olho para mostrar/esconder a senha ----------
  // o estilo vem junto com o script: o botão nunca aparece sem visual, mesmo com o CSS antigo no cache
  const estilo = document.createElement('style');
  estilo.textContent = `.senha-caixa { position: relative; display: block; }
.senha-caixa input { width: 100%; padding-right: 44px; }
.senha-olho { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 6px; background: transparent; color: var(--suave); cursor: pointer; transition: color .15s, background .15s, filter .15s; }
.senha-olho svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.senha-olho:hover { color: var(--tinta); background: rgba(20, 22, 25, .06); }
.senha-olho.on { color: var(--laranja); }
.senha-olho:focus-visible { outline: 2px solid var(--laranja); outline-offset: 1px; }
input::-ms-reveal, input::-ms-clear { display: none; }`;
  document.head.appendChild(estilo);
  const OLHO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const OLHO_FECHADO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 5.6A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.3 3.1M6.5 6.6C3.9 8.3 2.5 12 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/></svg>';
  function comOlho(inp) {
    if (inp.dataset.olho) return;
    inp.dataset.olho = '1';
    const caixa = document.createElement('span');
    caixa.className = 'senha-caixa';
    inp.parentNode.insertBefore(caixa, inp);
    caixa.appendChild(inp);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'senha-olho';
    b.setAttribute('aria-label', 'Mostrar senha');
    b.title = 'Mostrar senha';
    b.innerHTML = OLHO;
    b.addEventListener('mousedown', e => e.preventDefault()); // não tira o foco do campo
    b.addEventListener('click', e => {
      e.preventDefault();
      const ver = inp.type === 'password';
      inp.type = ver ? 'text' : 'password';
      b.innerHTML = ver ? OLHO_FECHADO : OLHO;
      b.setAttribute('aria-label', ver ? 'Esconder senha' : 'Mostrar senha');
      b.title = ver ? 'Esconder senha' : 'Mostrar senha';
      b.classList.toggle('on', ver);
    });
    caixa.appendChild(b);
  }

  function varrer(raiz) {
    raiz.querySelectorAll('input[type="password"]').forEach(comOlho);
  }
  varrer(document);
  new MutationObserver(ms => ms.forEach(m => {
    if (m.type === 'attributes') { if (!m.target.hidden) varrer(m.target); return; } // tela ou app que acabou de aparecer
    m.addedNodes.forEach(n => { if (n.nodeType === 1) varrer(n.parentNode || n); });
  })).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
})();

