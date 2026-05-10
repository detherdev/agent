import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { CookieBanner } from "@/components/CookieBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Workflow Platform",
  description: "Agent-native workflow runtime for professional services.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="bg-neutral-950 text-neutral-100 antialiased">
          {children}
          <CookieBanner />
        </body>
      </html>
    </ClerkProvider>
  );
}
