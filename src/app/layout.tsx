import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import {
  Barlow_Condensed,
  IBM_Plex_Sans,
  IBM_Plex_Mono,
} from "next/font/google";
import "./globals.css";

const sans = IBM_Plex_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const condensed = Barlow_Condensed({
  variable: "--font-sign",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});
const mono = IBM_Plex_Mono({
  variable: "--font-number",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Dockside — Your next Chicago stop",
  description:
    "Find a Divvy bike or an open dock around UChicago and the Loop. Live station availability, your everyday stops, and a plan B.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${condensed.variable} ${mono.variable}`}
    >
      <body>
        <a href="#main" className="skip-link">
          Skip to station board
        </a>
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
          appearance={{
            variables: {
              colorPrimary: "#1649df",
              colorForeground: "#182b36",
              colorBackground: "#ffffff",
              borderRadius: "0.2rem",
              fontFamily: "var(--font-body)",
              colorMutedForeground: "#596970",
            },
          }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
