import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Button, Keys, Segmented, Status } from "./controls";

it("renders one button, segmented control, status and keycap per role", () => {
  expect(renderToStaticMarkup(<Button variant="primary">Launch</Button>)).toContain('class="ff-button ff-button-primary"');
  const seg = renderToStaticMarkup(<Segmented label="Preset" value="b" onChange={() => {}} options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} />);
  expect(seg).toContain('role="radiogroup"'); expect(seg).toContain('aria-checked="true" class="selected"');
  const status = renderToStaticMarkup(<Status tone="caution" title="Setup required">Add the launch option.</Status>);
  expect(status).toContain("ff-status-caution"); expect(status).toContain('role="alert"'); expect(status).toContain("Check");
  expect(renderToStaticMarkup(<Keys shortcut="Ctrl+Alt+H" />).match(/<kbd>/g)).toHaveLength(3);
});
