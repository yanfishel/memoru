import "@mantine/core/styles.css";
import "./globals.css";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { pageMetadata } from "@/lib/metadata";
import { siteUrl } from "@/lib/site-url";
import { UI } from "@/lib/ui-text";
import { sans, serif } from "@/theme/fonts";
import { Providers } from "@/theme/Providers";
import { printCss } from "@/theme/tokens";

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(siteUrl()),
    // The suffix is the short name: "Поиск — MEMOru — имена и цифры репрессий в СССР" helps nobody.
    title: { default: UI.siteTitle, template: `%s — ${UI.siteName}` },
    applicationName: UI.siteName,
    // The home page's own metadata: every other page replaces these through `pageMetadata`.
    ...pageMetadata({ description: UI.meta.home, path: "/" }),
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" {...mantineHtmlProps} className={`${sans.variable} ${serif.variable}`}>
      <head>
        {/* Runs before first paint and sets data-mantine-color-scheme from localStorage: no flash. */}
        <ColorSchemeScript defaultColorScheme="auto" />
        {/* Light tokens on paper, whatever the screen scheme (src/theme/tokens.ts). */}
        <style dangerouslySetInnerHTML={{ __html: printCss() }} />
      </head>
      <body>
        <Providers>
          <SiteHeader />
          <main className="page">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
