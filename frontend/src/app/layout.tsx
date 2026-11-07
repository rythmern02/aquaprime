import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// next/font self-hosts at build time: no runtime requests to Google, no trackers.
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500", "600"] });
const serif = Instrument_Serif({ subsets: ["latin"], variable: "--font-serif", weight: "400", style: ["normal", "italic"] });
const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "AquaPrime — capital that never leaves",
  description: "Zero-custody credit and surgical, MEV-resistant liquidations on 1inch Aqua + SwapVM, with World ID and EF Anon-RPC.",
  referrer: "no-referrer",
};

export const viewport: Viewport = { themeColor: "#7EC8F8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
