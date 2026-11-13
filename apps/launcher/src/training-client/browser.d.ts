// Upstream uses Chromium's IntersectionObserver scrollMargin; TS 5.9's DOM library predates it.
interface IntersectionObserverInit { scrollMargin?: string }
