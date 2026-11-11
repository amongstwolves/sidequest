import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { RoleSwitcher, RoleSwitcherFallback } from "@/components/RoleSwitcher";
import { MobileTabBar } from "@/components/MobileTabBar";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SIDEQUEST",
  description: "The physical-world execution layer for AI. Local missions, verified proof, PayPal-backed payment.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <div className="bg-warning/15 px-4 py-1.5 text-center text-xs text-warning">
          Demo environment · PayPal sandbox · all brands, venues and people are fictional
        </div>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-2 px-4 py-3 sm:px-6">
          <nav aria-label="Site" className="flex items-center gap-5">
            <Link href="/" className="text-lg font-bold tracking-[0.2em]">
              SIDE<span className="text-accent">QUEST</span>
            </Link>
            <span className="hidden items-center gap-5 md:flex">
              <Link href="/control" className="text-sm text-muted hover:text-foreground">Mission Control</Link>
              <Link href="/discover" className="text-sm text-muted hover:text-foreground">Missions</Link>
              <Link href="/objectives/new" className="text-sm text-muted hover:text-foreground">New objective</Link>
            </span>
          </nav>
          <Suspense fallback={<RoleSwitcherFallback />}>
            <RoleSwitcher />
          </Suspense>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 sm:px-6 md:py-8">{children}</main>
        {/* Reads the URL to highlight the active tab, so it streams in its own boundary. */}
        <Suspense fallback={null}>
          <MobileTabBar />
        </Suspense>
      </body>
    </html>
  );
}
