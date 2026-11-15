import { expectTypeOf, it } from "vitest";
import type { z } from "zod";
import type {
  Connection,
  LogTab,
  Preferences,
  ViewFavorite,
  Workspace,
} from "../src/shared/contracts";
import type { workspaceSchema } from "../src/main/security";

type Saved = z.infer<typeof workspaceSchema>;

// Checked by `npm run typecheck`. zod silently strips keys it does not know,
// so a field added to a persisted type but not to the schema would be lost on
// every save. These checks make that a build error instead.
it("persisted types and the workspace schema declare the same fields", () => {
  expectTypeOf<keyof Saved>().toEqualTypeOf<keyof Workspace>();
  expectTypeOf<keyof Saved["tabs"][number]>().toEqualTypeOf<keyof LogTab>();
  expectTypeOf<
    keyof Saved["tabs"][number]["view"]
  >().toEqualTypeOf<keyof LogTab["view"]>();
  expectTypeOf<
    keyof Saved["connections"][number]
  >().toEqualTypeOf<keyof Connection>();
  expectTypeOf<keyof Saved["preferences"]>().toEqualTypeOf<keyof Preferences>();
  expectTypeOf<
    keyof Saved["favorites"][number]
  >().toEqualTypeOf<keyof ViewFavorite>();
});
