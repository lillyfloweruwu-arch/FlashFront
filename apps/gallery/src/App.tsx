import { Brand } from "./Brand";
import { SpawnPreview } from "./SpawnPreview";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { MockDataSource, type DataSource, type GameSnapshot, type MatchSummary, type MockSpeed, type PlayerProfile } from "@flashfront/core";
import { GAME_UI_ZONES, REFERENCE_WIDTH, REFERENCE_HEIGHT, HudRoot, StreamRoot, Wordmark, FlashFrontMark, Icon, Module, GrowthGauge, AttackPreview } from "@flashfront/ui";
import { loadFonts } from "./fonts";
import { parseRoute } from "./router";
import { applyTheme, resolveTheme, THEMES, THEME_IDS, type ThemeId } from "@flashfront/ui";

function useGame(source: DataSource) {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  useEffect(() => { setSnapshot(null); return source.subscribeGame(setSnapshot); }, [source]);
  return snapshot;
}
export function App() {
  const [hash, setHash] = useState(window.location.hash);
  const [seed, setSeed] = useState(42); const [draftSeed, setDraftSeed] = useState("42");
  const [showZones, setShowZones] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("abyss");
  const [speed, setSpeed] = useState<MockSpeed>(1); const [editing, setEditing] = useState(false);
  const source = useMemo(() => new MockDataSource({ seed }), [seed]);
  const snapshot = useGame(source);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [error, setError] = useState("");
  const route = parseRoute(hash); const obs = route.path === "/stream/obs";
  const preview = new URLSearchParams(route.search || window.location.search);
  const activeTheme = resolveTheme(obs ? preview.get("theme") : null, theme);
  useLayoutEffect(() => { applyTheme(document.documentElement, activeTheme); }, [activeTheme]);
  const previewPhase = preview.get("phase");
  const hudSnapshot = snapshot ? { ...snapshot, ...(previewPhase === "spawn" || previewPhase === "playing" ? { phase: previewPhase as "spawn" | "playing", ...(previewPhase !== snapshot.phase ? { events: [] } : {}) } : {}), ...(preview.has("map") ? { map: preview.get("map")! } : {}), ...(preview.get("size") === "Compact" ? { mapSize: "Compact" as const } : {}) } : null;
  const nofonts = route.path === "/hud" && new URLSearchParams(route.search || window.location.search).get("nofonts") === "1";
  useEffect(() => {
    if (nofonts) return;
    let cancelled = false;
    const style = document.createElement("style"); style.dataset.flashfrontFonts = "true";
    void loadFonts().then(css => { if (!cancelled) { style.textContent = css; document.head.append(style); } }).catch(() => { /* System fonts remain usable if local font loading fails. */ });
    return () => { cancelled = true; style.remove(); };
  }, [nofonts]);
  useEffect(() => { const change = () => setHash(window.location.hash); window.addEventListener("hashchange", change); return () => window.removeEventListener("hashchange", change); }, []);
  useEffect(() => { source.setSpeed(speed); }, [source, speed]);
  useEffect(() => {
    let cancelled = false; setError(""); setProfile(null);
    Promise.all([source.getProfile("self"), source.getMatches("self")]).then(([p, m]) => { if (!cancelled) { setProfile(p); setMatches(m); } }).catch(() => { if (!cancelled) setError("Could not load mock profile. Reload the gallery to retry."); });
    return () => { cancelled = true; };
  }, [source]);
  useEffect(() => { document.title = `FlashFront · ${obs ? "OBS widgets" : route.path === "/hud" ? "HUD" : route.path === "/stream" ? "Stream" : "UI gallery"}`; }, [route.path, obs]);
  const stream = snapshot && profile ? <StreamRoot key={snapshot.gameId} snapshot={snapshot} profile={profile} result={matches[0]} search={obs ? route.search || window.location.search : ""} preview={!obs} session={{ wins: 2, losses: 1 }} /> : <p className="muted">Loading mock stream…</p>;
  if (obs) return stream;
  return <>
    <div className="gallery-theme-toolbar" role="toolbar" aria-label="Gallery appearance"><label className="theme-picker">Theme<select aria-label="Theme" value={theme} onChange={e => setTheme(resolveTheme(e.target.value))}>{THEME_IDS.map(id => <option value={id} key={id}>{THEMES[id].name}</option>)}</select></label><span className="muted">FlashFront surfaces</span></div>
    <aside className="gallery-rail"><a href="#/" aria-label="FlashFront gallery"><FlashFrontMark size={32} /></a><nav aria-label="Gallery views">{([["/", "play", "Play"], ["/hud", "growth", "HUD"], ["/stream", "profile", "Stream"], ["/brand", "themes", "Brand"]] as const).map(([path, icon, label]) => <a key={path} href={`#${path}`} title={label} aria-label={label} aria-current={route.path === path ? "page" : undefined}><Icon name={icon} size={20} /></a>)}</nav></aside><header className="site-header"><a href="#/" aria-label="FlashFront home"><Wordmark /></a><nav aria-label="Surfaces"><a className={route.path === "/hud" ? "active" : ""} href="#/hud">HUD</a><a className={route.path === "/stream" ? "active" : ""} href="#/stream">Stream</a><a className={route.path === "/brand" ? "active" : ""} href="#/brand">Brand</a></nav><span className="mock-badge"><i /> Mock data</span></header>
    {error && <p role="alert" className="error-message">{error}</p>}
    {route.path === "/brand" ? <Brand /> : route.path === "/" ? <main className="landing"><div className="landing-copy"><h1>Read the field.<br />Plan your next move.</h1><p>A clearer view of your OpenFront match. Live numbers, stream-ready overlays, and the story behind every game.</p><div className="hero-actions"><a href="#/hud" className="primary-link">Explore the HUD <Icon name="external" /></a></div><p className="fair-play">Visible information. Useful arithmetic. Your call.</p></div><div className="gallery-module-preview" aria-label="Live module preview"><div className="spread"><h2>Field instruments</h2><span className="muted">Mock simulation</span></div>{snapshot && <><Module title="Troop growth" icon="growth"><GrowthGauge self={snapshot.self} phase={snapshot.phase} /></Module><Module title="Attack preview" icon="attack"><AttackPreview self={snapshot.self} phase={snapshot.phase} /></Module></>}</div><div className="surface-links"><a href="#/hud"><Icon className="surface-icon" name="growth" /><div><h2>In-game HUD</h2><p>Growth, builds, alliances.<br />Everything at a glance.</p></div><Icon name="external" /></a><a href="#/stream"><Icon className="surface-icon" name="profile" /><div><h2>Stream overlays</h2><p>Your match, on air.<br />Made for your OBS scene.</p></div><Icon name="external" /></a></div></main> : route.path === "/hud" ? <main><div className="hud-toolbar"><div><h1>Field overview</h1><p className="muted">Ctrl+Alt+H to toggle · Ctrl+Alt+E to edit · Drag handles or use arrow keys</p></div><form className="simulation-controls" onSubmit={e => { e.preventDefault(); const n = Number(draftSeed); if (draftSeed.trim() && Number.isFinite(n)) setSeed(Math.trunc(n)); }}><label>Seed<input aria-label="Simulation seed" type="number" value={draftSeed} onChange={e => setDraftSeed(e.target.value)} /></label><button type="submit">Apply seed</button><label>Speed<select aria-label="Simulation speed" value={speed} onChange={e => setSpeed(Number(e.target.value) as MockSpeed)}><option value={1}>1×</option><option value={5}>5×</option><option value={20}>20×</option></select></label><label className="zone-toggle"><input type="checkbox" checked={showZones} onChange={e => setShowZones(e.target.checked)} />Show game UI zones</label><button type="button" aria-pressed={editing} onClick={() => setEditing(e => !e)}>{editing ? "Finish editing" : "Edit HUD"}</button></form></div><nav className="spawn-preview-links" aria-label="Spawn previews"><span>Spawn preview:</span>{["World", "Iceland", "Europe", "Four Islands"].map(map => <a key={map} href={`#/hud?phase=spawn&map=${encodeURIComponent(map)}`}>{map}</a>)}<a href="#/hud?phase=playing">Playing</a></nav><div className="hud-stage"><div className="map-art"><div className="landmass land-one" /><div className="landmass land-two" /><div className="landmass land-three" /><span className="map-coordinate">Dyslexdria / mock terrain</span><div className="map-marker marker-one"><span /> Ember</div><div className="map-marker marker-two"><span /> Northstar</div><div className="map-compass">N<br /><Icon name="up" /></div></div>{showZones && <div className="game-ui-zones" aria-label="Game UI zones">{GAME_UI_ZONES.map(zone => <div key={zone.id} className="game-ui-zone" data-game-zone={zone.id} style={{ left: `${zone.x / REFERENCE_WIDTH * 100}%`, top: `${zone.y / REFERENCE_HEIGHT * 100}%`, width: `${zone.width / REFERENCE_WIDTH * 100}%`, height: `${zone.height / REFERENCE_HEIGHT * 100}%` }}>{zone.label}</div>)}</div>}{snapshot && (previewPhase === "spawn" ? <SpawnPreview snapshot={hudSnapshot!} editing={editing} onEdit={setEditing} /> : <HudRoot snapshot={hudSnapshot!} editMode={editing} onEditModeChange={setEditing} />)}</div><p className="stage-caption">Original illustrative terrain · public game information only · rules v0.34.25</p></main> : route.path === "/stream" ? <main className="page-content"><div className="page-heading"><div><h1>Ready for your scene.</h1><p className="muted">Transparent widgets, built for a 1920 × 1080 canvas.</p></div><a className="primary-link" href="#/stream/obs?widgets=card,stats,top,result&scale=1&anchor=tl">Open OBS view <Icon name="external" /></a></div><p className="preview-description muted">All four widgets shown below. The result and session record are sample fixtures; live statistics follow the simulation.</p><div className="checkerboard">{stream}</div><p className="obs-help muted">Choose widgets with <code>widgets=card,stats,top,result</code>, scale with <code>scale=1</code>, and corner with <code>anchor=tl</code> (tl, tr, bl, br).</p></main>  : <main className="page-content empty-page"><h1>Page not found</h1><a href="#/">Return to gallery</a></main>}
    <footer className="site-footer"><span>FlashFront <span className="muted">/ Brand v7</span></span><span className="muted">Independent companion · mock data only</span></footer>
  </>;
}
