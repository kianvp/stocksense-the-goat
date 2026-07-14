import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { SignInModal } from "@/components/auth/SignInModal";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import "./globals.css";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "StockSense — Smarter Stock Decisions, Powered by AI",
  description:
    "Your intelligent companion for the Indian stock market. Analyse companies, track your portfolio, and get AI-powered insights — all in one place.",
  manifest: `${BASE_PATH}/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "StockSense",
  },
  icons: {
    apple: `${BASE_PATH}/icons/apple-touch-icon.png`,
  },
};

export const viewport: Viewport = {
  themeColor: "#062a1c",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen antialiased">
        <AuthProvider>
          {children}
          <SignInModal />
        </AuthProvider>
        <PwaRegister />
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      </body>
    </html>
  );
}
