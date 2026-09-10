# Handoff: Visogram — corpo da landing page

## Overview
Landing page da Visogram, marca de tour virtual 360º para construtoras, imobiliárias e marcas. Este pacote cobre **todo o corpo da página abaixo do hero** (o hero já existe no código do cliente e **não** faz parte deste bundle). Objetivo único de conversão: iniciar conversa no WhatsApp. Idioma: português do Brasil. Tom: sci-fi/técnico.

## About the Design Files
Os arquivos deste bundle são **referências de design feitas em HTML** — protótipos que mostram aparência e comportamento pretendidos, **não** código de produção para copiar direto.

O arquivo principal, `Visogram Landing.dc.html`, é um componente de design com runtime próprio (template + classe de lógica). **Não tente rodá-lo ou portá-lo literalmente.** A tarefa é **recriar essas telas no ambiente já existente do codebase alvo** (React, Vue, Astro, WordPress, o que for) usando seus padrões e bibliotecas. Se ainda não existe ambiente, escolha o framework mais adequado e implemente lá.

O que deve ser reaproveitado literalmente: os **SVGs em `assets/`**, os **valores de design tokens** e a **copy** (textos em português, revisados pelo cliente — não reescrever).

## Fidelity
**Alta fidelidade.** Cores, tipografia, espaçamentos, estados e transições estão definidos e devem ser reproduzidos fielmente. Onde há `clamp()`, mantenha o comportamento fluido — não substitua por breakpoints fixos sem necessidade.

## Design Tokens

### Cores
| Token | Hex | Uso |
|---|---|---|
| `bg` | `#262e38` | fundo padrão das seções |
| `bg-alt` | `#1e252d` | fundo das seções alternadas (telemetria, galeria, FAQ) e texto sobre coral |
| `coral` | `#e07a6e` | cor de marca / acento / CTA |
| `coral-hover` | `#efa79e` | hover do CTA e dos links |
| `blue` | `#a9c4dd` | labels, eyebrows, ícones |
| `ink` | `#e8eef5` | texto principal |
| `body` | `#c6d2de` | parágrafos de destaque |
| `muted` | `#93a3b3` | parágrafos secundários |
| `dim` | `#7f93a6` | metadados, telemetria |
| `dim-2` | `#6f8296` | rodapé |
| `hairline` | `rgba(169,196,221,.16)` | divisórias e bordas (variações usadas: `.14`, `.18`, `.22`, `.35`) |

Seleção de texto: fundo `#e07a6e`, texto `#1e252d`.

### Tipografia
Google Fonts: **JetBrains Mono** (300/400/500/700) e **Archivo** (300/400/500/600).

- **Mono** (`'JetBrains Mono', monospace`): todos os títulos, eyebrows, labels, botões, números, metadados, telemetria.
- **Archivo**: apenas parágrafos corridos.

| Papel | Definição |
|---|---|
| Eyebrow de seção | Mono 12px, `letter-spacing:.24em`, uppercase, `#a9c4dd`, precedido de traço 34×1px `#e07a6e` com `gap:14px` |
| H2 hero-da-seção (seção 01) | Mono 300, `clamp(30px,5.4vw,68px)`, `line-height:1.08`, `max-width:16ch` |
| H2 padrão | Mono 300, `clamp(28px,4.4vw,54px)`, `line-height:1.12` |
| H2 do CTA final | Mono 300, `clamp(30px,5.6vw,66px)`, `line-height:1.08`, centralizado |
| Número de etapa | Mono 300, `clamp(38px,5vw,60px)`, `#e07a6e` |
| Título de card | Mono 15px, `letter-spacing:.1em`, uppercase |
| Título de público | Mono 400, `clamp(20px,2.4vw,26px)` |
| Pergunta do FAQ | Mono, `clamp(15px,1.8vw,18px)` |
| Parágrafo destaque | Archivo `clamp(16px,1.6vw,19px)`, `line-height:1.7`, `max-width:56ch`, `#c6d2de` |
| Parágrafo padrão | Archivo 15px, `line-height:1.65–1.7`, `#93a3b3` |
| Resposta do FAQ | Archivo 16px, `line-height:1.7`, `#a8b6c4`, `max-width:64ch` |
| Botão / CTA | Mono 500, `clamp(13px,1.5vw,15px)`, `letter-spacing:.16em`, uppercase |
| Telemetria | Mono `clamp(11px,1.2vw,13px)` |

### Espaçamento
- Padding vertical de seção: `clamp(72px,11vw,160px)`; CTA final: `clamp(88px,12vw,180px)`; telemetria: `clamp(28px,4vw,44px)`; rodapé: `clamp(36px,5vw,56px)`.
- Padding horizontal de seção: `clamp(20px,6vw,96px)`.
- Largura máxima de conteúdo: `1180px` (FAQ: `900px`; CTA: `840px`), centralizado.
- Eyebrow → H2: `28px`. H2 → grid: `clamp(44px,6vw,72px)`.
- Gap de grid: `clamp(24px,3vw,40px)` (etapas), `clamp(16px,2vw,28px)` (galeria), `clamp(28px,4vw,64px)` (colunas de texto).

### Outros
- **Border-radius: 0 em tudo.** Nenhum canto arredondado na página inteira. Nenhuma sombra.
- Grades "sem gap": `display:grid` + `gap:1px` + `background:hairline` nos filhos com fundo sólido, produzindo divisórias de 1px (usado nos 4 ícones e nos 3 públicos).
- Todos os grids: `grid-template-columns:repeat(auto-fit,minmax(min(100%,<N>px),1fr))` — reflow automático, sem media query. `N`: 180 (ícones), 240 (etapas), 290 (galeria), 280 (públicos), 300 (colunas de texto), 260 (telemetria).

## Screens / Views
Uma única página, sete blocos em sequência. A numeração 01–05 aparece nos eyebrows.

### 0. Hero (fora do escopo)
Já implementado pelo cliente. O corpo começa imediatamente abaixo.

### 1. Seção 01 — O que é a Visogram
- **Purpose**: explicar o produto em duas frases e ancorar o vocabulário da marca.
- **Layout**: eyebrow → H2 em duas linhas (segunda linha em coral) → duas colunas de parágrafo → faixa de 4 ícones.
- **Fundo**: `assets/elemento-fundo.svg` posicionado `right:-14%; top:-10%`, `width:min(760px,105vw)`, `opacity:.13`, `pointer-events:none`. Camada de parallax (speed `0.22`).
- **H2**: "Ambientes reais," / "navegáveis em 360º" (segunda linha `#e07a6e`).
- **Faixa de ícones** (4 colunas, borda superior e inferior 1px, divisórias de 1px, padding `26px 22px`): ícone 44px de altura, `margin-bottom:18px`; título mono 13px `letter-spacing:.14em` uppercase; descrição 14px `#93a3b3` com `margin-top:8px`.
  1. `icon-eye.svg` — **Panorâmica** — "Captura esférica completa, do piso ao teto."
  2. `icon-layers.svg` — **Percepção** — "Escala e profundidade reais do ambiente."
  3. `icon-globe.svg` — **Mapeamento** — "Planta interativa ligando cada ponto de vista."
  4. `icon-orbs.svg` — **Ecossistema** — "Vários ambientes conectados em um só link."

### 2. Faixa de telemetria
- **Purpose**: assinatura sci-fi da marca; texto vem literalmente do manual (`visogram.pdf`, p.7). É decorativa e estática.
- **Layout**: fundo `#1e252d`, borda 1px em cima e embaixo, grid `auto-fit` de 6 itens; cada item é uma linha `flex` com `justify-content:space-between`, rótulo em `#7f93a6` e valor em `#a9c4dd`.
- **Conteúdo** (verbatim): Entropy status → Online · Virtual vessel integrity → 100% · Visual operator → Ready · Stasis → **Disabled** (valor em `#e07a6e`) · Build → 1.0 · FPS → 30.
- **Toggle**: seção inteira pode ser desligada (prop `showTelemetry`, default ligado).

### 3. Seção 02 — Como funciona
- **Purpose**: mostrar o processo em 4 etapas.
- **Layout**: eyebrow → H2 "Quatro etapas entre a visita e o link" → grid de 4 colunas. Cada etapa: borda superior 1px `rgba(169,196,221,.22)`, `padding-top:22px`, número coral gigante, título uppercase (`margin-top:18px`), parágrafo.
- **Fundo**: `assets/elemento-fundo-coral.svg`, `left:-22%; bottom:-18%`, `width:min(680px,100vw)`, `opacity:.1`, parallax speed `-0.16` (sentido oposto ao da seção 01).
- **Conteúdo**:
  - **01 Levantamento** — "Você manda a planta, a metragem e o prazo. Definimos quantos pontos de captura o espaço pede."
  - **02 Captura 360º** — "Sessão no local com câmera panorâmica. Um dia costuma cobrir um decorado inteiro."
  - **03 Montagem** — "Tratamento das imagens, ligação entre ambientes, planta interativa e pontos de informação."
  - **04 Entrega** — "Link pronto e código de incorporação, hospedados por nós. Ajustes e novas fases entram depois."

### 4. Seção 03 — Galeria de tours
- **Purpose**: prova de trabalho; cada card deve virar link para o tour real.
- **Layout**: fundo `#1e252d`. Eyebrow → linha com H2 "Tours entregues" à esquerda e botão fantasma à direita (`flex-wrap:wrap`, `align-items:end`, `justify-content:space-between`) → grid de 4 cards.
- **Botão fantasma**: borda 1px `rgba(169,196,221,.35)`, texto `#a9c4dd` mono 12px `letter-spacing:.18em` uppercase, padding `12px 20px`. Hover: borda e texto viram `#e07a6e`.
- **Card**: fundo `#262e38`, borda 1px `rgba(169,196,221,.14)`, `overflow:hidden`. Área de imagem `height:clamp(200px,24vw,260px)`. Badge "360º" absoluto em `top:12px; left:12px`, mono 10px `letter-spacing:.2em`, fundo `rgba(30,37,45,.72)`, padding `5px 9px`, `pointer-events:none`. Rodapé do card `padding:20px 20px 22px`: nome mono 15px + meta mono 11px uppercase `#7f93a6` (`margin-top:8px`).
- **Estado atual**: os cards usam `<image-slot>` como placeholder de imagem porque **o cliente ainda não forneceu os links nem as capturas dos tours**. Apenas o primeiro tem dados reais: **Alpha One — São Paulo/SP · Construcompany**. Os outros três são "Tour 02/03/04 — Cidade · Cliente".
- **Na implementação real**: substituir `<image-slot>` por `<img>`/`<picture>` com a thumbnail do tour e envolver o card inteiro em um `<a href="<url do tour>" target="_blank">` com o hover de borda coral. Remover a nota "Arraste uma captura…" logo abaixo do grid — ela é instrução de protótipo.

### 5. Seção 04 — Para quem é
- **Purpose**: qualificar o visitante em três públicos.
- **Layout**: eyebrow → H2 "Quem precisa mostrar espaço" → grid de 3 colunas com divisórias de 1px, padding `clamp(28px,3.4vw,44px) clamp(22px,2.6vw,34px)`. Cada coluna: tag mono 11px `letter-spacing:.2em` uppercase em `#e07a6e`; título (`margin-top:16px`); parágrafo (`margin-top:14px`).
- **Decoração**: `assets/ilustracao.svg` em `right:6%; top:8%`, `height:min(420px,50vw)`, `opacity:.22`, parallax speed `0.3` (a camada mais rápida da página).
- **Conteúdo**:
  - **Construtoras** — "Vender na planta com o espaço já de pé" — "Decorado, obra em andamento e área comum viram material de venda antes da entrega das chaves. O corretor abre o tour na mesa e o cliente entende a metragem."
  - **Imobiliárias** — "Filtrar visita antes de sair do escritório" — "O interessado percorre o imóvel pelo link e chega na visita presencial já decidido. Menos deslocamento por curiosidade, mais proposta."
  - **Marcas** — "Mostrar o produto aplicado no ambiente" — "Revestimento, mobiliário, iluminação e acabamento registrados dentro do projeto real, prontos para portfólio e apresentação comercial."

### 6. Seção 05 — Perguntas frequentes
- **Purpose**: remover objeções antes do CTA.
- **Layout**: fundo `#1e252d`, container `max-width:900px`. Lista com borda superior no container e borda inferior 1px em cada item.
- **Item**: `<button>` full-width, sem fundo nem borda, `padding:24px 0`, `display:flex`, `justify-content:space-between`, `align-items:baseline`, `gap:20px`, `cursor:pointer`. Pergunta à esquerda; sinal `+`/`−` à direita em `#e07a6e`, 20px. Hover: texto vira `#e07a6e`.
- **Resposta**: aparece abaixo, `padding-bottom:26px`, `max-width:64ch`.
- **Conteúdo**:
  1. "Quanto tempo leva para o tour ficar pronto?" — "Entre 3 e 7 dias úteis a partir da captura, dependendo do número de ambientes. Obras e decorados grandes podem entrar em etapas, com a primeira parte no ar antes do restante."
  2. "O imóvel precisa estar mobiliado?" — "Não. Registramos obra bruta, imóvel vazio, decorado ou entregue. Cada fase conta uma história diferente e todas funcionam como material de venda."
  3. "Como o tour entra no meu site ou anúncio?" — "Você recebe um link e um código de incorporação. Funciona em site próprio, portais, e-mail, WhatsApp e apresentações — sem instalar nada."
  4. "Funciona bem no celular?" — "Sim. O tour abre direto no navegador do celular, com giro por toque e por sensor de movimento, além de modo óculos VR."
  5. "Vocês atendem fora da cidade?" — "Atendemos todo o Brasil. Fora da região de origem entra um custo de deslocamento, informado junto do orçamento."

### 7. CTA final + rodapé
- **Purpose**: conversão para WhatsApp.
- **Layout**: centralizado, `flex-direction:column`, `align-items:center`, `gap:clamp(24px,3vw,36px)`, `max-width:840px`.
- **Fundo**: `assets/elemento-fundo.svg` centralizado (`left:50%; top:50%; transform:translate(-50%,-50%)`), `width:min(900px,130vw)`, `opacity:.09`, parallax speed `0.14` — a transformação de parallax precisa **preservar** o `translate(-50%,-50%)`.
- **Conteúdo**:
  - Eyebrow mono 12px `letter-spacing:.3em` uppercase `#a9c4dd`: `A c c e s s i n g` (espaçamento manual, verbatim do manual da marca).
  - H2: "Mande a planta." / "Devolvemos o espaço." (segunda linha coral).
  - Parágrafo: "Orçamento no mesmo dia. Conte o tipo de imóvel, a metragem e a cidade — o resto a gente resolve."
  - **Botão primário**: fundo `#e07a6e`, texto `#1e252d`, padding `20px 40px`, sem raio. Hover: fundo `#efa79e`.
  - Linha de contato mono 13px `#7f93a6`: `(47) 99920-1576 · @visogram.tours` (Instagram linkado para `https://instagram.com/visogram.tours`).
- **Rodapé**: borda superior 1px, `logo-coral.svg` com `height:clamp(22px,3vw,30px)` à esquerda, "Tour virtual 360º · Brasil" mono 11px uppercase `#6f8296` à direita, `flex-wrap:wrap`.

## Interactions & Behavior

### Link do WhatsApp
Gerado a partir do telefone `47999201576`:
```
https://wa.me/55<digitos>?text=<encodeURIComponent('Olá! Quero um orçamento de tour virtual 360º.')>
```
Resultado: `https://wa.me/5547999201576?text=Ol%C3%A1!%20Quero%20um%20or%C3%A7amento%20de%20tour%20virtual%20360%C2%BA.`
O rótulo exibido `(47) 99920-1576` é derivado dos mesmos dígitos. Abre em `target="_blank" rel="noopener"`. Usado no botão da galeria e no CTA final.

### Reveal on scroll
Todo elemento marcado como revelável começa em `opacity:0; transform:translateY(26px)`, com transição `opacity .8s cubic-bezier(.22,.7,.3,1)` e `transform` idem. **Stagger**: atraso de `(index % 4) * 70ms` — ou seja, itens de um mesmo grid de 4 entram em cascata.

Disparo: quando `rect.top < viewportHeight * 0.92`, aplica `opacity:1; transform:none` e o elemento sai da fila (revela uma vez só, nunca reverte).

**Implementação importante**: no protótipo isso foi feito dentro do mesmo loop de rAF do parallax, e **não** com `IntersectionObserver` — o observer não disparava no ambiente de preview e a página abria em branco. Em produção, `IntersectionObserver` é a escolha certa, **mas** mantenha a rede de segurança: um `setTimeout(1600ms)` que revela qualquer elemento ainda escondido cujo `rect.top < innerHeight`. Regra inegociável: **a página nunca pode ficar em branco se o script falhar** — considere aplicar o `opacity:0` inicial via JS (como no protótipo) em vez de CSS, para que sem JS tudo apareça normalmente.

### Parallax
Loop único de `requestAnimationFrame`, agendado por listener de `scroll` com `{passive:true}` e flag de `ticking`. Também roda no `resize`, no `load` e uma vez no mount.

Para cada camada:
```
d = (rect.top + rect.height/2 - vh/2) / vh
y = -d * 120 * speed * k
transform = [translate(-50%,-50%) se centralizado] translate3d(0, y px, 0) rotate(y * 0.02 deg)
```
Speeds por camada: `0.22` (seção 01), `-0.16` (seção 02, invertida), `0.3` (ilustração da seção 04), `0.14` (CTA final).

Cards da galeria têm um deslocamento mais sutil: `translate3d(0, -d * 16 * k px, 0)`, com `d` limitado a `[-1, 1]`.

Multiplicador global `k`:
- intensidade escolhida — Sutil `0.45`, Médio `0.8`, **Marcante `1.25`** (default);
- **× 0.4 quando `innerWidth < 760`** (mobile);
- **× 0 quando `prefers-reduced-motion: reduce`** — parallax desligado, sem exceção.

Todas as camadas de fundo levam `will-change:transform` e `pointer-events:none`.

### FAQ
Acordeão de abertura única: abrir um item fecha o anterior. Estado inicial: **primeiro item aberto** (índice 0). Clicar no item aberto o fecha (estado `-1`). O sinal alterna entre `+` e `−`. Implementar como `<button>` com `aria-expanded` e região associada — o protótipo não cobriu acessibilidade e isso deve ser adicionado.

### Hovers
- Links de texto: `#e07a6e` → `#efa79e`.
- CTA primário: fundo `#e07a6e` → `#efa79e`.
- Botão fantasma: borda e texto `#a9c4dd` → `#e07a6e`.
- Pergunta do FAQ: texto → `#e07a6e`.
- Card da galeria: `transition:border-color .4s ease` já preparado — ativar hover de borda coral quando o card virar link.

### Responsivo
Sem media queries. Tudo resolve por `clamp()` na tipografia/espaçamento e por `auto-fit`/`minmax` nos grids. No mobile os grids colapsam para 1 coluna e o parallax cai para 40%. Testado sem overflow horizontal. **Alvos de toque mínimos de 44px** — conferir o botão fantasma da galeria ao portar.

## State Management
Estado mínimo:
- `openFaq: number` — índice do item aberto no FAQ, inicial `0`, `-1` quando tudo fechado.
- Fila interna de elementos ainda não revelados (Set), consumida pelo loop de scroll.
- Nenhum fetch de dados. Etapas, públicos, FAQ e tours são arrays estáticos — bons candidatos a CMS se o cliente quiser editar depois (especialmente a lista de tours).

Props configuráveis expostas no protótipo, úteis como configuração do componente:
- `whatsapp` (string, default `"47999201576"`)
- `parallax` (`"Sutil" | "Médio" | "Marcante"`, default `"Marcante"`)
- `showTelemetry` (boolean, default `true`)

## Assets
Em `assets/`. Todos derivados dos SVGs originais da marca enviados pelo cliente (`logo.svg`, `icones.svg`, `ilustracao.svg`, `elemento fundo.svg`).

**Atenção**: os SVGs originais chegaram **sem as regras de estilo** (as classes `cls-*` existiam mas o bloco `<style>` tinha sido removido na exportação), então todas as formas renderizavam pretas. Foram reconstruídos como line art aplicando atributos de apresentação em cada forma: `fill="none"`, `stroke=<cor>`, `stroke-width`, `stroke-linecap/linejoin="round"`. **Se o cliente fornecer os originais com estilo, prefira-os.**

| Arquivo | Origem | Stroke |
|---|---|---|
| `logo-coral.svg` / `logo-light.svg` | `logo.svg` (`fill` sólido) | `#e07a6e` / `#e8eef5` |
| `icon-eye.svg` | recorte `0 -1 30.82 23.5` de `icones.svg` | `.9` |
| `icon-globe.svg` | recorte `0 33 30.82 26` | `.9` |
| `icon-layers.svg` | recorte `0 71 30.82 23` | `.9` |
| `icon-orbs.svg` | recorte `-7.5 104 45.8 18.5` | `.9` |
| `ilustracao.svg` | `ilustracao.svg` inteiro | `.6` |
| `elemento-fundo.svg` | `elemento fundo.svg` inteiro | `1.1` |

Cada um tem variante `-coral` (`#e07a6e`); os demais usam `#a9c4dd`. Os quatro ícones são recortes por `viewBox` de um único sprite vertical — ao consolidar, considere um sprite `<symbol>` de verdade.

Fontes: Google Fonts (JetBrains Mono, Archivo). Considere self-hosting.

Imagens dos tours: **pendentes**. O cliente precisa fornecer thumbnail + URL de cada tour.

## Files
- `Visogram Landing.dc.html` — o protótipo completo (template + lógica). Referência visual e comportamental.
- `image-slot.js` — componente de placeholder de imagem usado só no protótipo. **Não portar.**
- `assets/*.svg` — assets de marca prontos para produção.

## Pendências para o cliente
1. Links e thumbnails dos tours reais (só "Alpha One — São Paulo/SP · Construcompany" está confirmado).
2. Confirmar prazos e política de deslocamento citados no FAQ.
3. Definir se a lista de tours vem de CMS.
