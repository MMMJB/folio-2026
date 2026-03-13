import "@/styles/globals.css";

import Script from "next/script";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <Script id="haptics">{`
        if(!window)throw new Error("Window is not defined");if(!("vibrate"in window.navigator)){const t=document.createElement("input");t.setAttribute("type","checkbox"),t.setAttribute("id","haptics-vibrate"),t.setAttribute("class","hidden"),t.setAttribute("switch","true");const e=document.createElement("label");e.setAttribute("for","haptics-vibrate"),e.setAttribute("class","hidden"),document.body.appendChild(t),document.body.appendChild(e),window.navigator.vibrate=()=>e.click()}
      `}</Script>
      <body className="antialiased">{children}</body>
    </html>
  );
}
