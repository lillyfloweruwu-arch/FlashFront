import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("ships koffi per platform and has a Linux AppImage target", () => {
  const { build } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  // koffi loads its native binary at import, so each platform's build must carry its own.
  expect(build.extraResources).toBeUndefined();
  expect(build.win.extraResources[0].to).toBe("koffi/win32_x64/koffi.node");
  expect(build.linux.extraResources[0].to).toBe("koffi/linux_x64/koffi.node");
  expect(build.linux.target).toContain("AppImage");
});
