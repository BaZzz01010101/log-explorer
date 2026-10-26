import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { LogViewer } from "../src/renderer/components/LogViewer";
import { createWorkspace } from "../src/renderer/workspace";

function markup(wrap = true) {
  const workspace = createWorkspace();
  return renderToStaticMarkup(
    <MantineProvider>
      <LogViewer
        events={[]}
        view={{ ...workspace.tabs[0].view, wrap }}
        onViewChange={() => {}}
        preferences={workspace.preferences}
      />
    </MantineProvider>,
  );
}

it("puts the inspector toggle after Export and omits the toolbar selection-copy controls", () => {
  const html = markup();
  expect(html).not.toContain('aria-label="Copy selected messages"');
  expect(html).not.toContain('aria-label="Copy selected events as"');
  expect(html.indexOf('aria-label="Hide event inspector"')).toBeGreaterThan(
    html.indexOf('aria-label="Export loaded filtered events"'),
  );
});

it("scopes logs wrapping to the event list so the inspector cannot inherit it", () => {
  const html = markup();
  expect(html).toContain('class="event-scroll-layout viewer-wrap"');
  expect(html).not.toMatch(/class="log-viewer[^\"]*viewer-wrap/);
  expect(markup(false)).not.toContain(
    'class="event-scroll-layout viewer-wrap"',
  );
});
