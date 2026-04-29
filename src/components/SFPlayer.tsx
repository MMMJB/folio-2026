"use client";

import "@/styles/sf.css";

import { useRef, useEffect } from "react";

import SFFrame from "./SFFrame";

import SFContentManager from "../services/SFContentManager";

import type { SFContent } from "../types/sf";

export default function SFPlayer({ content }: { content: SFContent[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const manager = new SFContentManager(containerRef.current);

    manager.start();

    return () => manager.stop();
  }, []);

  return (
    <div
      ref={containerRef}
      className="sf-player h-[var(--sf-frame-h)] w-max cursor-grab touch-none overflow-hidden bg-black sm:border"
    >
      {content.map((c, i) => (
        <SFFrame key={i} content={c} forceActive={i === 0} frameIndex={i} />
      ))}
    </div>
  );
}
