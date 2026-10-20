# Catálogo B2B com painel de administração

Catálogo online para venda **no atacado (por caixa)**, criado para substituir uma tabela de preços que era montada à mão no InDesign. O administrador atualiza preços e estoque em minutos, o vendedor manda um link só, e o cliente monta o orçamento pelo celular.

> **Versão de demonstração.** Os produtos são de um catálogo real de tecnologia automotiva (com autorização), mas **todos os preços são fictícios** e nenhuma condição comercial real foi publicada. Tudo o que você mudar fica salvo só no seu navegador.

| Parte | Endereço | Acesso na demonstração |
|---|---|---|
| Catálogo (clientes) | `/` | livre |
| Painel do administrador | `/admin` | senha **demo** |
| Área do vendedor | `/vendedor` | usuário **demo**, senha **demo** |
| Tabela em PDF | `/tabela.html` | livre |

## O que o sistema faz

**Catálogo para o cliente**
- Busca, categorias, filtros, carrossel de fotos e página de detalhes com especificações.
- Preço por unidade e valor da caixa; selo de promoção e de "últimas unidades".
- Lista de orçamento que o cliente envia ao vendedor (compartilhar, copiar ou PDF).
- Produtos esgotados saem do catálogo público **sem código, nome nem foto** (proteção contra concorrentes).

**Painel do administrador**
- Início com resumo, pendências (código repetido, sem foto, foto pequena, promoção vencida…) e atalhos.
- **Atualização de preços a partir do print de uma planilha** (leitura por OCR no navegador), com prévia antes de aplicar e alerta de preço suspeito.
- Edição em massa (preço, promoção %, caixa, categoria, destaque), lixeira de 30 dias, desfazer, histórico de preços por produto.
- Promoções com data de início e fim; estoque em quantidade com aviso de últimas unidades.
- **Organizar tabela**: os produtos aparecem como na página do PDF (3 por linha, 9 por página) e são arrastados para qualquer casa, inclusive deixando espaços em branco.
- Tabela em PDF no padrão gráfico aprovado, **tabela de novidades** (o que baixou, voltou ao estoque ou é novo), desconto geral e versão sem preços.
- Importar e exportar planilha (.xlsx/.csv), capas em JPG, PNG ou PDF, publicação com revisão, versões anteriores e backup.
- Busca rápida (Ctrl+K), usuários do painel e atividade dos vendedores.

**Área do vendedor**
- Monta propostas com desconto por item e por pedido, venda por caixa ou unidade, e gera a proposta comercial em PDF.
- Importa a lista que o cliente enviou pelo catálogo.

## Tecnologias

- HTML, CSS e JavaScript puros, **sem framework e sem etapa de build**.
- Servidor próprio em Node.js (`servidor.mjs`) para o uso real; nesta demonstração, o servidor é simulado no navegador (`assets/demo-api.js`, com `localStorage`).
- [Tesseract.js](https://tesseract.projectnaptha.com/) para ler o print de preços, [SheetJS](https://sheetjs.com/) para planilhas e [PDF.js](https://mozilla.github.io/pdf.js/) para capas em PDF (carregados sob demanda).
- PDF gerado pela impressão do navegador, em A4, a partir de HTML/CSS.

## Rodar no computador

```bash
node servidor.mjs
```

Abra http://localhost:5173 (catálogo) e http://localhost:5173/admin (painel). Para usar o modo demonstração também no computador, abra com `?demo=1` no endereço.
