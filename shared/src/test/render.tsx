/**
 * `render` with the providers every shared component and app expects:
 * Mantine + notifications + a controllable auth context.
 */
import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { MockAuthProvider, type MockAuthOverrides } from "./mock-auth.js";
import { DatabaseProvider } from "betterbase/db/react";
import { lessTheme } from "../theme.js";

export interface RenderWithProvidersOptions extends RenderOptions {
  auth?: MockAuthOverrides;
  /**
   * The app's local db — mounted as DatabaseProvider, mirroring how every
   * app's main.tsx wires it up.
   */
  db?: unknown;
  /** Extra providers between Mantine and auth (e.g. a mocked sync context). */
  wrap?: (children: ReactNode) => ReactNode;
}

export function renderWithProviders(
  ui: ReactElement,
  { auth, db, wrap, ...renderOptions }: RenderWithProvidersOptions = {},
) {
  return render(ui, {
    wrapper: ({ children }) => {
      let tree: ReactNode = (
        <MockAuthProvider auth={auth}>{children}</MockAuthProvider>
      );
      if (db !== undefined) {
        tree = <DatabaseProvider value={db as never}>{tree}</DatabaseProvider>;
      }
      if (wrap) tree = wrap(tree);
      return (
        <MantineProvider theme={lessTheme}>
          <Notifications />
          {tree}
        </MantineProvider>
      );
    },
    ...renderOptions,
  });
}

export { MockAuthProvider } from "./mock-auth.js";
export { render } from "@testing-library/react";
