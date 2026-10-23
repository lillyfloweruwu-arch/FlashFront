import type { ReactNode } from "react";
import { Icon, type IconName } from "../icons";

export function ModuleHeader({ title, icon, value }: { title: string; icon: IconName; value?: ReactNode }) {
  return <header className="module-header"><Icon name={icon} /><h2 className="panel-title">{title}</h2>{value !== undefined && <span className="module-chip">{value}</span>}</header>;
}
export function Module({ title, icon, value, children }: { title: string; icon: IconName; value?: ReactNode; children: ReactNode }) {
  return <section className="panel module"><ModuleHeader title={title} icon={icon} value={value} /><div className="module-body">{children}</div></section>;
}
