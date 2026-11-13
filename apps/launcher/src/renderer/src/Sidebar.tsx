import { Fragment } from "react";
import { FlashFrontMark, Wordmark, Icon, type IconName } from "@flashfront/ui";
import type { LauncherState } from "../../shared";
import { connectionLabel } from "./launcher-status";

// Training is unfinished (placement and send-troops drills do not confirm); the tab stays out of the nav until it works.
export const TRAINING_ENABLED = false;
const ALL_TABS = ["Play", "Training", "Matches", "Profile", "Customize", "Stream", "Settings"] as const;
export type Tab = typeof ALL_TABS[number];
export const TABS: readonly Tab[] = ALL_TABS.filter(name => TRAINING_ENABLED || name !== "Training");
const navIcons: Record<Tab, IconName> = { Play: "play", Training: "opening", Matches: "matches", Profile: "profile", Customize: "themes", Stream: "external", Settings: "settings" };

export function Sidebar({ tab, onTab, status, version, shortcutProblem = false }: {
  tab: Tab; onTab: (tab: Tab) => void; status: LauncherState["status"]; version?: string; shortcutProblem?: boolean;
}) {
  const connection = connectionLabel(status);
  const tone = connection.online ? "online" : status === "port-closed" ? "error" : "waiting";
  return <aside className="launcher-sidebar ff-glass">
    <div className="sidebar-brand"><a className="sidebar-brand-link" href="#play" aria-label="FlashFront Play" onClick={event => { event.preventDefault(); onTab("Play"); }}><span className="sidebar-mark"><FlashFrontMark size={24} /></span><Wordmark /></a></div>
    <nav className="launcher-tabs" aria-label="Launcher tabs">{TABS.map(name => <Fragment key={name}>
      {name === "Customize" && <div className="sidebar-group">Make it yours</div>}
      <button type="button" aria-label={name === "Settings" && shortcutProblem ? `${name}: a shortcut could not register` : name}
        aria-current={tab === name ? "page" : undefined} onClick={() => onTab(name)}>
        <span className="sidebar-icon"><Icon name={navIcons[name]} size={16} />{name === "Settings" && shortcutProblem && <span className="sidebar-dot" aria-hidden="true" />}</span>
        <span>{name}</span>
      </button>
    </Fragment>)}</nav>
    <div className="sidebar-footer">
      <div className={`connection-status ${tone}`} role="status"><span className="connection-light" aria-hidden="true" />{connection.text}</div>
      {version && <p className="sidebar-version">OpenFront {version}</p>}
    </div>
  </aside>;
}
