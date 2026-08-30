# 8ITO A4 Studio 0001

Editor local-first de cardápio impresso para o 8ito / Infinito Café.

## Objetivo

Transformar o cardápio `CARDAPIO 8ITO 270826` em um documento estruturado, editável e reproduzível. O A4 é o formato canônico até decisão explícita em contrário.

A arte de referência deixa de ser o arquivo mestre. Produtos, preços, categorias, promoções, imagens e textos vivem em JSON e são renderizados por um layout determinístico.

## Baseline de conteúdo

A base inicial incorpora o retorno do Pablo de 28/08/2026:

- remover `Salsicha Empanada`;
- adicionar `Pizza Individual Portuguesa` — R$ 13;
- adicionar `Pizza Individual Calabresa` — R$ 13;
- adicionar `Pizza Individual Frango` — R$ 13;
- adicionar `Pizza Individual Queijo` — R$ 13.

Os demais salgados, doces, bebidas e promoções visíveis no cardápio de 27/08 foram transcritos para `data/menu.8ito.json`.

## Princípio de arquitetura

**IA cuida de semântica; renderer cuida dos pixels.**

Texto, preço e identidade nunca são queimados dentro de imagens geradas por IA. A IA local pode gerar a fotografia/ilustração do produto, mas nome, preço, categorias, molduras e tipografia continuam editáveis no documento.

## Fluxo de imagem local

`pedido humano -> contexto do produto + marca + slot A4 -> Ollama/Qwen -> prompt refinado -> ComfyUI -> imagem -> asset local -> cardápio`

O refinador recebe também o identificador do workflow/checkpoint para adaptar o prompt ao motor realmente disponível.

### ComfyUI

- host padrão: `http://127.0.0.1:8188`;
- se `comfy/workflows/active.json` existir, ele é usado como workflow principal;
- caso contrário, o backend usa `comfy/workflows/food-basic.template.json`, compatível com pipelines clássicos SD/SDXL baseados em `CheckpointLoaderSimple`;
- placeholders de workflow: `__PROMPT__`, `__NEGATIVE_PROMPT__`, `__WIDTH__`, `__HEIGHT__`, `__SEED__`, `__CHECKPOINT__`, `__SAMPLER__`, `__SCHEDULER__`;
- o backend tenta detectar automaticamente checkpoint/sampler/scheduler via `/object_info`.

## Saídas

### PDF para impressão

O botão **Imprimir / PDF** usa CSS Paged Media com medidas físicas.

- A4: `210 × 297 mm`;
- A4 com sangria de 3 mm: `216 × 303 mm`;
- margem segura visual no template;
- texto continua vetorial no PDF produzido pelo navegador.

Para gráfica rápida, o PDF A4 é o padrão. Para gráfica profissional, o modo com sangria é a base para a próxima fase, que adicionará preflight PDF/X/CMYK.

## Estado do MVP 0001

- A4 vertical responsivo;
- edição de produtos e preços;
- ativar/desativar itens;
- adicionar/remover produtos;
- categorias Salgados, Pizzas, Doces, Bebidas e Promoções;
- upload de imagem para asset local;
- refinamento de prompt por Ollama;
- geração por ComfyUI;
- salvar projeto no backend local;
- exportar JSON;
- imprimir/salvar PDF em A4 ou A4+3 mm.

## Executar

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-8ITO-A4-Studio-0001.ps1
```

O launcher inicia `server.py` em uma porta local livre e abre o editor no navegador.

## Próximos gates

1. validar visualmente o A4 contra `CARDAPIO 8ITO 270826.jpeg`;
2. importar/recortar as fotos reais do cardápio existente;
3. validar ComfyUI com o workflow/modelo realmente instalado na máquina;
4. ranking vision das imagens geradas;
5. exportação PNG 300 dpi;
6. preflight de gráfica, CMYK e PDF/X;
7. sincronização opcional com o catálogo do site/TV.