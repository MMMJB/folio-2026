"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/util/ui";
import { createHillsRenderer, type HillsRenderer } from "./renderer";

const MAX_PIXEL_RATIO = 2;

// Shown until the first frame renders, or permanently if WebGL is unavailable.
const FALLBACK_GRADIENT =
  "linear-gradient(to bottom, #86b6eb 0%, #b0d1f3 74%, #86b83c 76%, #4f8a26 100%)";

export default function HillsBackground({
  seed = 0.37,
  trampleRadius = 2.5,
  className,
}: {
  seed?: number;
  // Radius in metres of the grass the cursor disturbs. It's a size in the
  // scene, so it looks smaller the further away the cursor is.
  trampleRadius?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<HillsRenderer | null>(null);
  const trampleRadiusRef = useRef(trampleRadius);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer =
      canvas && createHillsRenderer(canvas, seed, () => setReady(true));
    if (!canvas || !renderer) return;
    rendererRef.current = renderer;
    renderer.setTrampleRadius(trampleRadiusRef.current);

    let drawnSize = "";
    const observer = new ResizeObserver(() => {
      const ratio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
      const width = Math.round(canvas.clientWidth * ratio);
      const height = Math.round(canvas.clientHeight * ratio);
      if (width === 0 || height === 0) return;
      if (drawnSize === `${width}x${height}`) return;
      drawnSize = `${width}x${height}`;
      renderer.resize(width, height);
    });
    observer.observe(canvas);

    // Render continuously only while the scene can be seen, and not at all
    // for visitors who prefer reduced motion.
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let onScreen = false;
    const updateRunning = () =>
      renderer.setRunning(
        onScreen && !document.hidden && !reducedMotion.matches,
      );
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      updateRunning();
    });
    visibility.observe(canvas);
    document.addEventListener("visibilitychange", updateRunning);
    reducedMotion.addEventListener("change", updateRunning);

    // The canvas sits behind the page and ignores pointer events, so the
    // cursor is followed on the window instead.
    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      renderer.setPointer(
        inside
          ? [
              (x - rect.width / 2) / rect.height,
              (rect.height / 2 - y) / rect.height,
            ]
          : null,
      );
    };
    const clearPointer = () => renderer.setPointer(null);
    // A finger lifting off the screen leaves no cursor behind.
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") clearPointer();
    };
    const root = document.documentElement;
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", clearPointer);
    window.addEventListener("blur", clearPointer);
    root.addEventListener("pointerleave", clearPointer);

    return () => {
      observer.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", updateRunning);
      reducedMotion.removeEventListener("change", updateRunning);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", clearPointer);
      window.removeEventListener("blur", clearPointer);
      root.removeEventListener("pointerleave", clearPointer);
      rendererRef.current = null;
      renderer.dispose();
    };
  }, [seed]);

  // Kept in a ref too, so a renderer recreated for a new seed starts with it.
  useEffect(() => {
    trampleRadiusRef.current = trampleRadius;
    rendererRef.current?.setTrampleRadius(trampleRadius);
  }, [trampleRadius]);

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
      style={{ background: FALLBACK_GRADIENT }}
    >
      <canvas
        ref={canvasRef}
        className={cn(
          "size-full transition-opacity duration-700",
          ready ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
