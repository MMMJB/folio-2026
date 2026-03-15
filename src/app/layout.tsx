import "@/styles/globals.css";

import Script from "next/script";

import { Inter } from "next/font/google";
import { cn } from "@/util/ui";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("text-tx-primary font-sans antialiased", inter.variable)}
    >
      <Script id="haptics">{`
        if(!window)throw new Error("Window is not defined");if(!("vibrate"in window.navigator)){let e=document.createElement("input");e.type="checkbox",e.id="haptics-vibrate",e.className="hidden",e.switch=!0;let i=document.createElement("label");i.htmlFor="haptics-vibrate",i.className="hidden",document.body.appendChild(e),document.body.appendChild(i),window.navigator.vibrate=()=>i.click()}
      `}</Script>
      <body>{children}</body>
    </html>
  );
}
