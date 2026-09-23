"use client";

import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";
import { resolver, theme } from "./theme";

/** The resolver is a function, so the provider has to be created on the client side of the boundary. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={resolver} defaultColorScheme="auto">
      {children}
    </MantineProvider>
  );
}
