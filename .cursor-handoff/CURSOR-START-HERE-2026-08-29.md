# 8ITO A4 STUDIO 0001 — CURSOR START HERE

**Data do handoff:** 2026-08-29  
**Branch canônica de trabalho:** `agent/8ito-a4-studio-0001`  
**Repo:** `matheusfs36/tdz-orchestrator`  
**Objetivo:** continuar no Cursor a criação e edição do **programa local de cardápio A4 modificável do 8ito**, incluindo curadoria/criação das imagens dos produtos e refinamento visual do cardápio.

> IMPORTANTE: isto é o **programa/editor do cardápio**, não o site público do 8ito. Não desviar o trabalho para o website.

---

## 0. Decisão atual do usuário

A partir deste ponto, o usuário quer que o **Cursor assuma a implementação e a direção de arte técnica** do 8ito A4 Studio.

Motivo: as últimas automações de geração + crítica visual ficaram frágeis e lentas. O pipeline R12-R2 começou a dar `timed out` no crítico e várias imagens ficaram estranhas. O usuário prefere que o Cursor trabalhe diretamente no projeto local, com mais controle, inspeção visual e iteração real.

**Se houver um R12/R12-R2 ainda rodando, interromper com `Ctrl+C` antes de continuar.** Não insistir no loop de consenso como bloqueador.

---

# 1. O produto que estamos construindo

Nome provisório: **8ITO A4 STUDIO 0001**.

É um editor local-first para o cardápio do café 8ito. O documento canônico é A4 retrato.

### Documento
- A4: **210 × 297 mm**.
- Preview deve preservar a proporção física A4.
- Export principal: PDF A4.
- Export também desejado: PNG/JPG 300 dpi.
- 300 dpi A4 sem bleed: aproximadamente **2480 × 3508 px**.
- Futuro: bleed de 3 mm, crop marks, PDF/X/CMYK. Não prometer PDF/X/CMYK antes de implementar de verdade.

### Filosofia
- local-first;
- dados editáveis;
- imagens independentes por produto;
- texto e preço nunca devem ser rasterizados dentro da imagem do alimento;
- IA decide semântica/direção, renderer decide pixels/layout;
- o usuário deve poder editar sem depender de IA;
- IA deve acelerar, não bloquear o editor.

---

# 2. Localização do projeto no PC

### Lab instalado / runtime atual
`C:\tdz-os\content-labs\8ITO-A4-STUDIO-0001`

### Atalho desktop
`C:\Users\mathe\Desktop\8ito A4 Studio.exe`

### Studio local
`http://127.0.0.1:8794/`

### Backend atual
O launcher atual prefere `server_r4.py` quando presente.

### Serviços locais
- Studio: `127.0.0.1:8794`
- Ollama: `127.0.0.1:11434`
- ComfyUI: `127.0.0.1:8188`

### ComfyUI
`C:\Users\mathe\Documents\ComfyUI`

### Checkpoints importantes já instalados
1. `sd_xl_base_1.0.safetensors`
2. `Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors`

O **Juggernaut XL v9 já foi baixado completamente e teve SHA256 validado**. Não baixar novamente.

Caminho provável:
`C:\Users\mathe\Documents\ComfyUI\models\checkpoints\Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors`

### Modelos Ollama vistos no PC
- `qwen3-vl:4b-instruct-q4_K_M`
- `qwen3-vl:8b-thinking-q4_K_M`
- `qwen3-vl:4b-thinking-q4_K_M`
- `gemma3:4b`
- `gemma4:e4b`
- `qwen3:8b`
- `qwen3:4b`
- `qwen3.6:latest`
- `qwen3.6:35b-a3b-q4_K_M`
- `qwen2.5-coder:7b`

Para direção/editorial, `qwen3:8b` funciona. Para visão, usar `qwen3-vl:4b-instruct-q4_K_M` preferencialmente. Evitar depender do modelo `thinking` como parser JSON bloqueante.

---

# 3. Fonte visual original do cardápio

Arquivo usado como referência visual:
`C:\Users\mathe\Downloads\CARDAPIO 8ITO 270826.jpeg`

Também existe/foi usado como upload em conversas anteriores.

**Regra crítica:**

> NÃO usar mais o cardápio completo como fonte para recortar/zoomar imagens de produtos.

Isso já foi tentado e gerou pedaços de palavras, preços, setas, títulos e outros produtos dentro dos crops.

O cardápio original deve ser usado apenas como:
- referência de marca;
- referência de composição;
- referência de hierarquia;
- referência de cores/ornamentos;
- referência aproximada de fotos já existentes.

Nunca como asset final de produto.

---

# 4. Marca / linguagem visual

Base visual:
- fundo verde escuro / esmeralda profundo;
- dourado como acento;
- branco/creme para texto secundário;
- moldura fina dourada;
- folhas/ornamentos discretos nos cantos;
- sensação acolhedora, artesanal e gastronômica;
- evitar aparência genérica de dashboard SaaS dentro do A4;
- evitar excesso de ornamentação.

O cardápio original tinha:
- logo/infinito + “oito” no topo;
- subtítulo “salgados, doces e café”;
- colunas principais de salgados/doces;
- seção de bebidas;
- seção de promoções;
- footer: `Feito para acolher. Criado para ficar. ♡`

### O que o usuário quer melhorar agora
O cardápio ainda precisa ficar **mais bonito visualmente**:
- melhores elementos de seção;
- hierarquia tipográfica mais elegante;
- preços melhor integrados;
- imagens mais alinhadas e consistentes;
- mais respiro;
- menos colisão entre categorias;
- promoções mais refinadas;
- bebidas mais organizadas;
- manter leitura rápida e impressão A4 real.

Última direção visual introduzida no R13:
- frames retangulares para imagens;
- `contain` em vez de crop;
- divisores de seção;
- preços com tratamento dourado;
- fundo com profundidade sutil;
- auto-density para reduzir espaçamento antes de ocorrer overflow.

Não considerar R13 “final”. Cursor deve olhar o preview e redesenhar com critério.

---

# 5. Conteúdo atual do cardápio

## Salgados
- Empanadas — **R$ 15**
- Coxinhas — **R$ 12**
- Pão de Batata — **R$ 12**
- Pão de Queijo — **R$ 6**
- Croissant Presunto e Queijo — **R$ 15**

### Removido definitivamente
- Salsicha Empanada / Salchicha — **REMOVER / NÃO REINTRODUZIR**

## Pizzas individuais adicionadas em 29/08/2026
- Pizza Individual Portuguesa — **R$ 13**
- Pizza Individual Calabresa — **R$ 13**
- Pizza Individual Frango — **R$ 13**
- Pizza Individual Queijo — **R$ 13**

## Doces
- Alfajor Chocolate — **R$ 18**
- Alfajor Maicena — **R$ 13**
- Cookies — **R$ 10**
- Tarteletes — **R$ 13**
- Croissant Doce de Leite — **R$ 15**
- Croissant Chocolate — **R$ 15**
- Bolo de Laranja — **R$ 18**

## Bebidas
- Café Espresso — **R$ 7**
- Cafés Especiais — **R$ 8**
- Café Passado — valor atual no projeto deve ser conferido no JSON vivo
- Café Passado com Leite — **R$ 7**

Observação histórica: no cardápio referência existia um item preto de café marcado R$5 cuja legenda não estava clara no primeiro levantamento. O projeto depois passou a usar `Café Passado`. Não inventar/alterar preço sem conferir `menu.8ito.local.json`/API viva.

## Promoções
- Promo Manhã: Pão de Queijo + Café Passado — **R$ 8**
- Promo Almoço: Empanada + Refrigerante — **R$ 17**
- Promo Tarde Doce: Cookie + Café à Escolha — **R$ 15**

---

# 6. Imagens: regra definitiva

Cada produto deve apontar para **um arquivo de imagem independente**.

### Nunca fazer
- crop destrutivo do cardápio completo;
- `object-fit: cover` cego;
- máscara circular obrigatória;
- zoom automático que corta o alimento;
- imagem com texto/preço/QR/logo embutido;
- publicação automática de imagem estranha só porque “gerou”.

### Padrão de apresentação
- `imageFit = contain`
- `imageMask = none`
- `imageScale = 1`
- `imageOffsetX = 0`
- `imageOffsetY = 0`
- frame visual fixo e previsível;
- alimento inteiro visível;
- margens internas consistentes.

### Assets reais encontrados no PC numa varredura anterior
Foram encontrados 10 matches por nome. Alguns são realmente bons, outros eram “slides/cards” e NÃO devem ser aceitos sem inspeção visual.

Candidatos encontrados:
- Empanadas ← `infinito-vb-empanadas.png`
- Coxinhas ← `coxinha-frango__slide-25.jpg` **(suspeito: slide/card)**
- Pão de Queijo ← `infinito-vb-pao-de-queijo.png`
- Croissant Presunto e Queijo ← `infinito-vb-croissant-presunto-queijo.png`
- Cookies ← `infinito-vb-cookies.png`
- Tarteletes ← `tartelete-pasta-frola__slide-26.jpg` **(suspeito: slide/card)**
- Café Espresso ← `infinito-vb-espresso.png`
- Cafés Especiais ← `infinito-vb-cappuccino.png`
- Café Passado ← `cafe-passado__slide-6.jpg` **(suspeito: card com texto)**
- Café Passado com Leite ← `cafe-com-leite__slide-17.jpg` **(suspeito: card com texto)**

### Prioridade para o Cursor
1. Vasculhar a pasta do projeto real do 8ito e outras pastas do usuário por **fotos originais separadas**.
2. Inspecionar visualmente, não só por nome de arquivo.
3. Copiar assets limpos para uma pasta canônica do projeto, por exemplo:
   `assets/products/original/`
4. Se não existir foto limpa, gerar localmente.
5. Salvar geradas em pasta distinta, por exemplo:
   `assets/products/generated/`
6. Manter histórico e provenance (source/local/generated/model/seed).

---

# 7. Pasta real do projeto 8ito no PC

Pasta conhecida:
`C:\Users\mathe\Documents\PROJETOS ARQUITETURA\PABLO\PROJETO INFINITO CAFE`

Dentro dela existe o site e outros materiais. A fonte canônica histórica do site está em:
`C:\Users\mathe\Documents\PROJETOS ARQUITETURA\PABLO\PROJETO INFINITO CAFE\05_App_Site\web\`

Para esta missão, usar a pasta inteira como **fonte de assets** se necessário, mas não editar o site por acidente.

---

# 8. Pipeline de IA que já foi tentado

## R2/R3/R4
- bootstrap de imagens do cardápio antigo;
- descrição automática;
- `visualBrief`, `imagePrompt`, `negativePrompt`;
- ComfyUI local;
- UTF-8 corrigido no R4;
- quatro pizzas foram geradas com SDXL.

## R10
Curador visual rígido via Qwen-VL. Preferiu HOLD a publicar algo ruim. Conceito bom, mas execução severa.

## R11
- Juggernaut XL v9;
- receitas específicas por produto;
- 4 candidatos + 2 reparos;
- crítico Qwen-VL;
- gate >= 90.

Resultado: muitos candidatos visualmente razoáveis ficaram em HOLD por gate excessivamente rígido.

## R12
Tentativa de duplo consenso visual. Problemas:
- parser com modelo `thinking` retornando conteúdo inesperado;
- depois R12-R2 trocou Critic B para `gemma3:4b`;
- começou a ocorrer `critic error timed out`.

### Decisão atual
**Não usar R12/R12-R2 como bloqueador do projeto.**

Cursor deve simplificar:
- geração de 3–4 candidatos;
- contact sheet / galeria no próprio programa;
- avaliação visual simples opcional;
- o usuário pode escolher/aceitar a melhor;
- uma única IA visual pode sugerir ranking, mas não deve travar o editor.

Human-in-the-loop é preferível aqui.

---

# 9. Direção de geração de imagens

Usar **Juggernaut XL v9** como gerador fotográfico principal enquanto não houver modelo melhor testado.

Configuração usada e funcional no ComfyUI:
- 896 × 896
- 34 steps
- CFG 4.5
- sampler `dpmpp_2m`
- scheduler `karras`
- denoise 1.0

### Prompt-base desejado
Fotografia gastronômica real de cafeteria, produto único, inteiro, centralizado, com aproximadamente 18–22% de margem, fundo esmeralda discreto, luz difusa natural, textura realista, pequenas imperfeições reais, sem elementos gráficos e sem teatralidade.

### Negativo
- text
- letters
- price
- logo
- watermark
- QR code
- menu card
- flyer
- collage
- package
- pedestal
- display stand
- 3d render
- CGI
- plastic food
- surreal
- distorted food
- cropped object
- close-up crop
- cut off edges
- duplicate product
- clutter

### Pizzas
Exigir:
- UMA pizza individual inteira;
- redonda;
- borda circular completa visível;
- nenhuma fatia retirada;
- nenhuma fatia levantada;
- câmera levemente acima, sem close excessivo.

### Vale da estranheza
Se parecer “foto de IA”, não usar. Evitar:
- brilho plástico;
- ingredientes impossíveis;
- formas perfeitas demais;
- pratos/pedestais estranhos;
- folhas decorativas aleatórias;
- fundo cinematográfico dramático;
- objetos gratuitos.

---

# 10. Melhor arquitetura para imagens no editor

Implementar no programa um **Asset Manager por produto**.

Cada produto deve ter:
- imagem ativa;
- origem (`local-original`, `generated`, `uploaded`);
- botão `Trocar imagem`;
- botão `Usar arquivo do PC`;
- botão `Gerar candidatos`;
- galeria de 3–4 candidatos;
- botão `Usar esta`;
- opção `Regenerar`;
- opção `Remover`;
- controle de `fit` (`contain` / `cover` somente manual);
- escala;
- posição X/Y;
- reset/centralizar.

**Gerar candidatos não deve substituir a imagem ativa automaticamente.**

Só a escolha do usuário publica no cardápio.

---

# 11. UX do programa

O programa precisa ficar mais próximo de um **Canva/Figma gastronômico simples** do que de um formulário técnico.

## Layout desejado
- barra lateral esquerda: categorias/produtos;
- centro: canvas A4 grande;
- painel direito: propriedades do item selecionado;
- topbar: salvar, desfazer/refazer, zoom, exportar;
- seleção direta no A4 quando possível;
- produto selecionado destacado no canvas e na lista.

## Edição do produto
Campos:
- nome;
- preço;
- descrição opcional;
- categoria;
- status visível/oculto;
- imagem;
- fit/escala/posição;
- prompt de IA (avançado, recolhível).

## Botão automático desejado
`Auto criar produto · descrição + prompt + candidatos`

O fluxo ideal:
1. usuário escreve nome/preço/categoria;
2. Ollama cria descrição e prompt;
3. ComfyUI gera candidatos;
4. programa mostra candidatos;
5. usuário escolhe um;
6. cardápio atualiza.

Não aceitar candidato automaticamente.

---

# 12. Layout do A4: requisitos técnicos

Problemas vistos anteriormente:
- PIZZAS invadia BEBIDAS;
- títulos colidiam;
- imagens grandes empurravam seções;
- categorias cresciam sem reflow.

### Corrigir estruturalmente
- nunca posicionar seções com Y fixo baseado em “quantidade esperada”;
- medir altura renderizada;
- layout por fluxo;
- grid responsivo dentro da página;
- densidade progressiva;
- limite mínimo legível;
- quando não couber, sinalizar overflow.

### Estratégia sugerida
Renderer determinístico com unidades lógicas A4. Cada seção retorna sua altura real. O documento compõe:
1. header;
2. bloco principal de comidas (2 colunas ou grid);
3. pizzas;
4. bebidas;
5. promoções;
6. footer.

Se exceder página:
- tentar modo `compact`;
- depois `dense`;
- nunca sobrepor;
- se ainda exceder, mostrar alerta “conteúdo excede A4”.

---

# 13. Direção visual para o A4 agora

Refinar os elementos, mantendo a marca:

### Header
- logo maior e mais respirado;
- subtítulo menor, tracking leve;
- linha dourada fina ou ornamento discreto;
- sem excesso de elementos.

### Seções
- título em caixa alta com serif/display elegante ou sans editorial;
- divisor dourado fino;
- pequeno marcador/folha apenas onde ajuda;
- consistência entre SALGADOS / PIZZAS / DOCES / BEBIDAS / PROMOÇÕES.

### Produto
- imagem em frame retangular ou orgânico suave, sempre `contain`;
- nome com boa largura de linha;
- preço alinhado com o nome, não flutuando aleatoriamente;
- usar price pill só se ficar sofisticado, não “badge de app”.

### Bebidas
- tratar como mini-cards consistentes, não uma faixa desorganizada;
- imagens de café maiores e limpas;
- nomes e preços com alinhamento vertical previsível.

### Promoções
- cards horizontais com imagem + texto;
- sem usar imagem gerada que já contém vários textos;
- imagem pode ser composição determinística de dois assets reais;
- promoção deve parecer parte premium do menu, não banner de ecommerce.

### Fundo
- verde profundo;
- gradiente/texture muito sutil se usado;
- moldura dourada de 1–2 linhas;
- nada que reduza legibilidade.

---

# 14. Arquivos importantes no branch

Raiz do protótipo:
`prototypes/8ito-a4-studio-0001/`

Principais:
- `README.md`
- `index.html`
- `styles.css`
- `app.js`
- `autopilot-r3.js`
- `server.py`
- `server_r3.py`
- `server_r4.py`
- `Run-8ITO-A4-Studio-0001.ps1`
- `data/menu.8ito.json`
- `comfy/workflows/...`

Patches visuais recentes:
- `studio-r6.css/js`
- `studio-r7...`
- `studio-r8-images...`
- `studio-r9-clean-assets...`
- `studio-r13-menu-polish.css/js`

Ferramentas de IA/curadoria em:
`prototypes/8ito-a4-studio-0001/tools/`

Há scripts R10/R11/R12/R12-R2. Trate-os como histórico/experimentos, não como arquitetura obrigatória.

---

# 15. Estado vivo vs Git

**Muito importante:** o runtime local recebeu vários patches e gerou assets que podem não estar todos no Git.

Antes de editar:
1. inspecionar `C:\tdz-os\content-labs\8ITO-A4-STUDIO-0001`;
2. comparar com `prototypes/8ito-a4-studio-0001` do branch;
3. preservar `data/menu.8ito.local.json`, assets locais e histórico;
4. fazer backup do projeto vivo;
5. só então consolidar a melhor versão para o Git.

Não sobrescrever o lab local com uma versão mais antiga do branch.

---

# 16. Critérios de aceitação do próximo milestone

## Editor
- abre em 1 clique;
- Studio/ComfyUI/Ollama detectados sem erro crítico;
- editar nome/preço funciona;
- adicionar/remover produto funciona;
- undo/redo desejável;
- salvar/reabrir preserva tudo.

## Imagens
- cada produto usa arquivo independente;
- zero crop do cardápio original;
- nenhum texto/preço dentro da foto;
- alimento inteiro visível;
- galeria de candidatos gerados;
- seleção manual simples;
- nenhuma imagem estranha é aplicada automaticamente.

## Layout
- zero sobreposição;
- imagens alinhadas;
- seções consistentes;
- pizzas não invadem bebidas;
- promoções não invadem footer;
- preview e export batem visualmente.

## Visual
- mais bonito que o cardápio atual;
- mantém identidade verde/dourado;
- parece cardápio gastronômico profissional, não UI técnica;
- impresso em A4 continua legível.

## Export
- PDF A4 funcional;
- PNG/JPG em alta resolução;
- sem cortar conteúdo.

---

# 17. Primeira missão recomendada para o Cursor

Faça esta sequência:

1. **Parar qualquer curador R12/R12-R2 em execução.**
2. Abrir o lab local e confirmar o estado real.
3. Criar backup snapshot do lab e do JSON vivo.
4. Fazer inventário visual de todos os assets atuais.
5. Classificar assets em:
   - `KEEP_REAL`
   - `KEEP_GENERATED`
   - `REPLACE`
   - `MISSING`
6. Implementar Asset Manager com galeria/candidatos e escolha manual.
7. Tirar o duplo crítico do caminho crítico.
8. Gerar somente itens `MISSING/REPLACE` com Juggernaut.
9. Refinar o renderer A4 com fluxo sem overlap.
10. Refinar visual do cardápio.
11. Validar PDF/PNG.
12. Commitar no branch `agent/8ito-a4-studio-0001` com evidência/README atualizado.

---

# 18. Regra de ouro para o Cursor

**Não otimizar para “a IA conseguiu”. Otimizar para “isso parece um cardápio real, bonito, editável e confiável”.**

Quando houver conflito entre automação e qualidade visual, escolher qualidade e oferecer controle manual ao usuário.

Quando houver conflito entre um hack rápido e um mecanismo robusto, corrigir o mecanismo.

Não voltar ao recorte de screenshot/cardápio como fonte de produto.

---

# 19. Contexto adicional do 8ito

Site público histórico: `https://oitocafe.com.br/`.

Instagram recente do Pablo: `@damicopablo.cocina`.

Há também intenção futura de usar fotos reais do Pablo/cozinha em conteúdo de TV, mas isso é **outro output**. Não misturar com a missão principal do editor A4.

---

## Final

Cursor: trate este arquivo como a fonte de contexto para retomar o projeto. Antes de modificar, inspecione o lab local e os assets reais. Depois implemente em pequenos milestones visíveis, com commits frequentes e sem apagar o estado vivo.