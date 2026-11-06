import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Unbounded } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// next/font self-hosts at build time: no runtime requests to Google, no trackers.
const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
const display = Unbounded({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "AquaPrime — capital that never leaves",
  description: "Zero-custody credit and surgical, MEV-resistant liquidations on 1inch Aqua + SwapVM, with World ID and EF Anon-RPC.",
  referrer: "no-referrer",
};

export const viewport: Viewport = { themeColor: "#03050A" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body className="grain font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
