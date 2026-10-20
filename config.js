// ============================================================
//  CONFIGURAÇÃO DO SITE — CATÁLOGO AIKER
// ============================================================
//  api: endereço do servidor do painel. Hoje o sistema roda no próprio
//  computador (node servidor.mjs), então é o caminho /api do mesmo site.
//  Quando o catálogo for para um domínio, este é o lugar de ajustar.
// ============================================================

window.AIKER_CONFIG = {
  api: /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !/demo=1/.test(location.search) ? '/api' : 'demo-api',
};
