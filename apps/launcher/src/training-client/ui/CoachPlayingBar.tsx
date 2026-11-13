import React from "react";

export function CoachPlayingBar() {
  return <div className="ff-glass" role="status" style={{ padding: "14px 20px", borderRadius: "var(--radius-lg)" }}>
    <strong>Coach is playing</strong>
    <span style={{ marginLeft: 12, opacity: 0.7 }}>Your retry starts next</span>
  </div>;
}
