import { FlashFrontMark, Wordmark, Icon, iconPaths, type IconName } from "@flashfront/ui";

const palette = [
  ["bg", "#0A0A0B", "App background"], ["surface", "#121316", "Panels and modules"], ["surface-2", "#1B1D22", "Rows, inputs, hover"],
  ["edge", "#2A2D34", "Hairline borders"], ["fg", "#F2F3F5", "Text and numbers"], ["muted", "#9AA0AB", "Labels"], ["faint", "#6B7280", "Tertiary and disabled"],
  ["red", "#E8192C", "Mark, action, selection"], ["red-dim", "#8C0F1B", "Pressed and action borders"], ["good", "#34D399", "Sweet spot, done, gain"],
  ["caution", "#FFB020", "Capacity, idle, expiring"], ["rose", "#FF6B8E", "Exposed, danger, incoming"], ["ally", "#5AA9FF", "Allies and information"],
] as const;
export function Brand() {
  return <main className="page-content brand-page"><h1>FlashFront brand</h1><p className="muted">Front bolt. Flash neutrals. Field instruments for OpenFront.</p>
    <section className="brand-signature" aria-label="Mark and wordmark"><div className="brand-marks">{[16, 32, 64].map(size => <figure key={size}><FlashFrontMark size={size} /><figcaption>{size}px</figcaption></figure>)}</div><Wordmark /></section>
    <h2>Palette</h2><div className="brand-palette">{palette.map(([token, hex, role]) => <article key={token}><div className="brand-swatch" style={{ background: hex }} /><strong>{token}</strong><code>{hex}</code><p className="muted">{role}</p></article>)}</div>
    <h2>Type scale</h2><p className="muted">Antonio: titles and glanceable numerals. Inter: labels, body and small data.</p><div className="brand-types">{[11, 12, 13, 14, 16, 20, 28, 40].map(size => <div key={size}><code>{size}px</code><span style={{ fontSize: size }}>Growth · 56%</span><strong style={{ fontSize: size }}>FIELD INSTRUMENTS 56%</strong></div>)}</div>
    <h2>Authored icons</h2><div className="brand-icons">{(Object.keys(iconPaths) as IconName[]).map(name => <div key={name}><Icon name={name} /><span>{name}</span></div>)}</div>
    <p className="muted">16px grid · 1.5px stroke · square caps · currentColor</p>
  </main>;
}
