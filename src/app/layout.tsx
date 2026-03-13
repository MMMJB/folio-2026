import "@/styles/globals.css";

import Script from "next/script";

import localFont from "next/font/local";
import { cn } from "@/util/ui";

const generalSans = localFont({
  src: "../../public/fonts/GS-Variable.woff2",
  variable: "--font-gs",
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("font-sans antialiased", generalSans.variable)}
    >
      <Script id="haptics">{`
        if(!window)throw new Error("Window is not defined");if(!("vibrate"in window.navigator)){const t=document.createElement("input");t.setAttribute("type","checkbox"),t.setAttribute("id","haptics-vibrate"),t.setAttribute("class","hidden"),t.setAttribute("switch","true");const e=document.createElement("label");e.setAttribute("for","haptics-vibrate"),e.setAttribute("class","hidden"),document.body.appendChild(t),document.body.appendChild(e),window.navigator.vibrate=()=>e.click()}
      `}</Script>
      <body>{children}</body>
    </html>
  );
}
