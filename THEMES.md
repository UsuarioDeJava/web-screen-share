# Temas

A sala aceita um **CSS próprio** por cima do visual padrão, como os temas do Discord.
Ainda não tem tela pra escolher tema; o que já existe é o esqueleto: todas as cores,
fundos e cantos da sala saem de variáveis, tem uma camada de papel de parede e um
ponto onde o CSS do tema entra por último (`<style id="wss-theme">`, carregado por
`public/js/theme.js` antes de a página aparecer).

## Testar um tema hoje

No navegador (ou no app, com Ctrl+Shift+I), no console da sala:

```js
WssTheme.set(`
  :root {
    --accent-rgb: 236 72 153;
    --accent-2-rgb: 251 146 60;
    --accent-3-rgb: 244 114 182;
    --violet-rgb: 168 85 247;
    --accent: #ec4899;
    --accent-2: #fb923c;
    --wallpaper: url("https://exemplo.com/fundo.jpg");
    --wallpaper-dim: 0.55;
    --wallpaper-blur: 6px;
    --bg-pattern: none;
    --radius-scale: 0.6;
  }
`);
WssTheme.clear(); // volta pro padrão
```

O tema fica salvo neste navegador/app (`localStorage`, chave `wss-theme-css`).

## Variáveis

Defina sempre no `:root`: várias variáveis são montadas a partir de outras ali mesmo
(por exemplo, `--glass` usa `--surface-rgb`), e só recalculam se a mudança for no
`:root`.

### Canais de cor (transparências)

Valores `R G B` separados por espaço. Usados como `rgb(var(--ink-rgb) / 0.08)`.

| Variável | Pra quê |
| --- | --- |
| `--ink-rgb` | Realces sobre o fundo: hover, bordas, a grade fina. Num tema claro, vira escuro. |
| `--shade-rgb` | Sombras e campos afundados (inputs). |
| `--surface-rgb` | Vidro escuro: barras por cima do vídeo, fundo dos diálogos e da lista no celular. |
| `--accent-rgb`, `--accent-2-rgb`, `--accent-3-rgb`, `--violet-rgb` | Os tons do destaque (o degradê vai do violeta ao accent-2). |
| `--live-rgb`, `--ok-rgb`, `--warn-rgb` | AO VIVO e erro, sucesso, aviso. |

### Cores e superfícies

| Variável | Pra quê |
| --- | --- |
| `--bg` | Fundo da página. |
| `--app-bg` | O fundo inteiro (padrão: duas luzes em degradê sobre `--bg`). |
| `--sidebar`, `--panel`, `--panel-hover`, `--glass`, `--glass-strong` | Lista de pessoas, cartões, diálogos. |
| `--tile-bg` | Fundo de cada transmissão (a barra de baixo). |
| `--video-bg` | Atrás do vídeo (as faixas quando a proporção não bate). |
| `--border`, `--border-strong` | Bordas. |
| `--text`, `--text-soft`, `--muted`, `--faint` | Texto, do mais forte pro mais apagado. Mantenha `--faint` com contraste de pelo menos 4.5:1 sobre `--bg`. |
| `--on-accent` | Texto em cima do destaque (botão Compartilhar, Entrar). |
| `--accent`, `--accent-2`, `--accent-hover` | Destaque. |
| `--accent-text`, `--accent-2-text`, `--violet-text`, `--live-text`, `--ok-text`, `--warn-text` | Texto colorido em cima das etiquetas tingidas. |
| `--live`, `--live-2`, `--live-hover`, `--ok`, `--warn` | Estados. |
| `--grad-1`, `--grad-2`, `--grad-3` | As três cores do degradê dos botões principais (texto branco em cima: mantenha contraste de 4.5:1). |
| `--grad`, `--grad-soft`, `--grad-danger` | Degradê dos botões principais, da borda dos cartões e do botão de perigo. |
| `--glow` | Sombra dos botões principais. Padrão: elevação neutra. Pro neon: `0 0 24px -6px rgb(var(--accent-3-rgb) / 0.7)`. |

### Papel de parede e fundo

| Variável | Padrão | Pra quê |
| --- | --- | --- |
| `--wallpaper` | `none` | A imagem: `url(...)` ou um `linear-gradient(...)`. |
| `--wallpaper-size` | `cover` | Como `background-size`. |
| `--wallpaper-position` | `center` | Como `background-position`. |
| `--wallpaper-opacity` | `1` | Transparência da imagem. |
| `--wallpaper-blur` | `0px` | Desfoque. |
| `--wallpaper-dim` | `0` | Escurece a imagem, de 0 a 1. |
| `--bg-pattern` | a grade fina | O desenho atrás da entrada e das transmissões (`none` tira). |
| `--bg-pattern-size` | `44px 44px` | Tamanho de cada quadradinho. |

### Forma e letra

| Variável | Padrão | Pra quê |
| --- | --- | --- |
| `--radius-scale` | `1` | Multiplica todos os cantos arredondados: `0` deixa tudo quadrado, `1.5` mais redondo. Formato de pílula continua pílula. |
| `--radius` | `14px × escala` | Cartões e transmissões. |
| `--font` | fonte do sistema | Toda a interface. Pra uma fonte de fora, use `@import` no começo do tema. |
| `--mono` | monoespaçada do sistema | Estatísticas e endereços. |
| `--blur` | `blur(16px) saturate(150%)` | O desfoque dos painéis de vidro. |

Num tema claro, mude também `color-scheme: light` no `:root` (barras de rolagem,
campos e seletores nativos acompanham).

## Seletores estáveis

Pra ir além das variáveis, estes nomes de classe são a "API" do tema e não mudam sem
aviso no CHANGELOG:

| Parte | Seletor |
| --- | --- |
| Tela de entrada | `.login`, `.login-card` |
| A sala inteira | `.app` |
| Lista de pessoas | `.sidebar`, `.sidebar-head`, `.user-list`, `.user`, `.me` |
| Barra de cima | `.topbar` |
| Área das transmissões | `.stage`, `.grid`, `.empty` (ninguém transmitindo) |
| Uma transmissão | `.tile`, `.tile-media`, `.tile-bar`, `.tile-tools`, `.live-badge` |
| Chat | `.chat`, `.chat-list`, `.chat-form` |
| Diálogos (perfil, OBS, atalhos) | `.dialog`, `.dialog-card` |
| Botões e avatares | `.btn`, `.btn-primary`, `.icon-btn`, `.avatar` |
| Painel de administração | `.admin`, `.admin-card` |

## Ainda fora do tema

- A janela de Configurações do app e o seletor de tela (páginas do app, com CSS
  próprio).
- O visualizador de gamepad (`gamepad.css`).
- As cores dos efeitos do mouse (setinha, rastro, ping, pincel): são escolha de cada
  pessoa no perfil e aparecem pros outros do jeito que ela escolheu.

## Segurança

Um tema é CSS: pode carregar imagens e fontes de qualquer endereço (quem hospeda fica
sabendo que você abriu a sala). Use só temas de quem você confia, como nos temas do
Discord.
