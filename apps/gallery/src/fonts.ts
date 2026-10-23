// Loaded only by the gallery entry boundary, never by HUD components.
export async function loadFonts(): Promise<string> {
  return (await import("@flashfront/ui/fonts.css?inline")).default;
}
