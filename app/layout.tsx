import type { Metadata } from "next";
import { Geist, Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://codex-signalist.example"),
  title: { default: "Codex Signalist — LLM sentiment intelligence", template: "%s · Codex Signalist" },
  description: "Track how developers on X perceive frontier AI models through explainable sentiment, topic, and engagement signals.",
  openGraph: { title: "Codex Signalist", description: "Read the room before it shifts.", type: "website", images: [{ url: "/og.png", width: 1731, height: 909, alt: "Codex Signalist — Read the room before it shifts" }] },
  twitter: { card: "summary_large_image", title: "Codex Signalist", description: "Real-time model perception signals from X.", images: ["/og.png"] },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${manrope.variable} antialiased`}
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
