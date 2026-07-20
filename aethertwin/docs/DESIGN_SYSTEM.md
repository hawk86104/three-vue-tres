# Aether design system

M0 exports `Button`, `Field`, `Dialog`, `Badge`, `Panel`, and `StatusNotice`, plus public `tokens.css` and `base.css`. It uses local system fonts and direct named Lucide imports. There are no remote fonts/assets, gradients, or `backdrop-filter` in the runtime styles.

## Exact Aether tokens

| Token | Value |
| --- | --- |
| `--aether-bg` | `#0e151d` |
| `--aether-surface-1` | `#151f2a` |
| `--aether-surface-2` | `#1b2733` |
| `--aether-border` | `rgb(191 216 231 / 14%)` |
| `--aether-text` | `#e5edf3` |
| `--aether-text-muted` | `#92a4b3` |
| `--aether-accent` | `#58b8c4` |
| `--aether-accent-soft` | `rgb(88 184 196 / 16%)` |
| `--aether-danger` | `#d98484` |
| `--aether-success` | `#75b895` |
| `--aether-radius-sm` / `md` / `lg` | `10px` / `12px` / `16px` |
| `--aether-motion-fast` / `base` / `slow` | `120ms` / `180ms` / `220ms` |
| `--aether-font` | `"Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif` |

The editor shell adds fixed local layout tokens for a 260 px project tree and 320 px inspector. Status notices use assertive announcement for errors and polite announcement for saved/recovered state. The fixed dark Aether appearance is an M0 Studio contract; future visitor themes belong to M4 Player work and are not implemented.
