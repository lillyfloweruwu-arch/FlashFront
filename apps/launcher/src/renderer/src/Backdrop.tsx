/** Static map art, contours and optional grid behind the launcher. */
export function Backdrop({ dim = false, grid = true }: { dim?: boolean; grid?: boolean }) {
  return <div className={`launcher-backdrop${dim ? " is-dim" : ""}`} aria-hidden="true">
    <div className="backdrop-map" style={{ backgroundImage: 'url("minimaps/europe.png")' }} />
    <div className="backdrop-topo" />
    {grid && <div className="backdrop-grid" />}
  </div>;
}
