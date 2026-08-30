# R14 FINAL CANDIDATE — 29/08/2026 · 18:46

Baseline visual candidata a final do A4 8ito. Próximas mudanças devem ser incrementais.

## Preview
http://127.0.0.1:8794/

Não usar **Recarregar base** para voltar a este estado — esse botão carrega `menu.8ito.json` (base do cardápio JPEG) e esvazia as fotos locais. Refresh da página carrega `data/menu.8ito.local.json`.

## O que mudou nesta rodada
- Layout: a linha das colunas deixa de encolher (`min-height: min-content`). Bolo de Laranja já não sobrepõe a faixa de pizzas (vão medido ≈ 9 px; 0 overlaps; overflow false).
- Ritmo: itens um pouco mais compactos para caber 7 doces + 5 salgados no A4 sem clipar.
- Fotos: `object-fit: contain`, padding 8%, escala 1. Nenhuma foto original Infinito foi regenerada.
- Pizzas: 4 candidatos por sabor. Portuguesa e Calabresa **mantidas**. Frango → R16 #2 (inteira, frango visível). Queijo → R16 #1 (inteira, mozzarella).
- Export PNG / JPG / PDF preservados no topbar (`html2canvas` + Imprimir).

## Ainda em dúvida (não esconder)
- Portuguesa: prato branco; ovos a mais; ervilhas por vezes em vagem.
- Calabresa: lê-se pepperoni/salame + manjericão, não calabresa brasileira com cebola.
- Frango nova: ainda em tábua de madeira; catupiry em estrela um pouco estilizada.
- Queijo nova: tabuleiro/prato fino; ervas em cruz.
- Bolo de Laranja: fatia + chávena extra. Slot não esvaziado.

## Ficheiros
- `menu.8ito.local.json` — estado activo
- `studio-r14.css` / `studio-r15.css` / `studio-r14.js` / `index.html`
- `a4-preview.png`
- `r16-pizza-contact-sheet.png` + galeria `http://127.0.0.1:8794/logs/r16-pizza-gallery.html`
