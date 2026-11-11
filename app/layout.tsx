import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { ProfileChip, ProfileChipFallback, RoleHeaderLinks, RoleTabBar } from "@/components/ProfileNav";
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
        <header className="flex items-center justify-between gap-3 border-b border-surface-2 px-4 py-3 sm:px-6">
          <nav aria-label="Site" className="flex items-center gap-5">
            <Link href="/" className="text-lg font-bold tracking-[0.2em]">
              SIDE<span className="text-accent">QUEST</span>
            </Link>
            <Suspense fallback={null}>
              <RoleHeaderLinks />
            </Suspense>
          </nav>
          <Suspense fallback={<ProfileChipFallback />}>
            <ProfileChip />
          </Suspense>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 sm:px-6 md:py-8">{children}</main>
        {/* Reads the profile cookie and the URL, so it streams in its own boundary. */}
        <Suspense fallback={null}>
          <RoleTabBar />
        </Suspense>
      </body>
    </html>
  );
}
