import { useEffect, useRef, useState } from "react";
export function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null); const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(1, entries[0]?.contentRect.width ?? 600)));
    observer.observe(ref.current); return () => observer.disconnect();
  }, []);
  return { ref, width };
}
