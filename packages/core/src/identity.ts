/** Match the rendered own row without reading any other player's internals. */
export function ownNameMatches(rendered: string, me: { name?: string; displayName?: string; clanTag?: string }): boolean {
  const normalize = (value: string) => {
    let name = value.replace(/\s+/g, " ").trim();
    name = name.replace(/^\[[^\]]+\]\s*/, "");
    const tag = me.clanTag?.trim();
    if (tag && name.startsWith(tag + " ")) name = name.slice(tag.length).trim();
    return name;
  };
  return [me.displayName, me.name].some(name => !!name && normalize(rendered) === normalize(name));
}
