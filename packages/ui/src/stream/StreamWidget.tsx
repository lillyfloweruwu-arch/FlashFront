import type { ReactNode } from "react";
import type { IconName } from "../icons";
import { ModuleHeader } from "../hud/Module";

/** Every OBS widget wears the HUD module header so stream and overlay read as one product. */
export function StreamWidget({ title, icon, value, className = "", children }: { title: string; icon: IconName; value?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={`panel stream-widget ${className}`.trim()}><ModuleHeader title={title} icon={icon} value={value} /><div className="stream-widget-body">{children}</div></section>;
}
