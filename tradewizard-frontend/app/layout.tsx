import Providers from "@/providers";
import { Geist, Geist_Mono } from "next/font/google";
import { cn } from "@/utils/classNames";
import "./globals.css";
import type { Metadata } from "next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TradeWizard - AI-Powered Political Prediction Markets",
  description:
    "TradeWizard provides AI-driven intelligence for political prediction markets on Polymarket. Get expert analysis, probability-driven recommendations, and trade political events with confidence.",
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-icon",
    other: [
      { rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#6366f1" },
    ],
  },
  manifest: "/site.webmanifest",
};

export const viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={cn(geistSans.variable, geistMono.variable, "antialiased")}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
