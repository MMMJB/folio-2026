"use client";

import Link from "next/link";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/util/ui";
import { createHillsRenderer, type HillsRenderer } from "./renderer";

const MAX_PIXEL_RATIO = 2;

// The hills fill the viewport behind the page, and children form a section
// nestled in the scene just behind the midground hill: the canvas sits over
// it and lets it show through above the hill. The hill may only hide the
// section's bottom padding, so content is never covered.
export default function HillsBackground({
  seed = 0.37,
  trampleRadius = 2.5,
  book,
  className,
  sectionClassName,
  children,
}: {
  seed?: number;
  // Radius in metres of the grass the cursor disturbs. It's a size in the
  // scene, so it looks smaller the further away the cursor is.
  trampleRadius?: number;
  // Makes the book in the grass a link: it opens while hovered or focused.
  book?: { href: string; label: string };
  className?: string;
  sectionClassName?: string;
  children?: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<HillsRenderer | null>(null);
  const trampleRadiusRef = useRef(trampleRadius);
  const [ready, setReady] = useState(false);
  // Where the book lands on screen; the link sits over it.
  const [bookOutline, setBookOutline] = useState<[number, number][] | null>(
    null,
  );

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
      setBookOutline(renderer.bookOutline());
    });
    observer.observe(canvas);

    // Followed through scrolling and layout changes. The page scrolls under
    // the fixed canvas, so the section moves across the scene.
    const section = sectionRef.current;
    const updateSection = () => {
      if (!section) return;
      const view = canvas.getBoundingClientRect();
      const rect = section.getBoundingClientRect();
      if (view.width === 0 || view.height === 0) return;
      const bury = parseFloat(getComputedStyle(section).paddingBottom) || 0;
      renderer.setSection({
        left: (rect.left - view.left) / view.width,
        top: (rect.top - view.top) / view.height,
        right: (rect.right - view.left) / view.width,
        bottom: (rect.bottom - view.top) / view.height,
        bury: bury / view.height,
      });
    };
    updateSection();
    const sectionObserver = new ResizeObserver(updateSection);
    if (section) sectionObserver.observe(section);
    sectionObserver.observe(canvas);
    window.addEventListener("scroll", updateSection, { passive: true });

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
      sectionObserver.disconnect();
      window.removeEventListener("scroll", updateSection);
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
    <>
      <div ref={sectionRef} className={cn("relative", sectionClassName)}>
        {children}
      </div>
      {book && bookOutline && (
        <BookLink {...book} outline={bookOutline} rendererRef={rendererRef} />
      )}
      <canvas
        ref={canvasRef}
        aria-hidden
        className={cn(
          "pointer-events-none fixed top-0 left-0 z-10 h-dvh w-full transition-opacity duration-700",
          ready ? "opacity-100" : "opacity-0",
          className,
        )}
      />
    </>
  );
}

// A link over the book, clipped to its outline on screen (fractions of the
// canvas, which fills the viewport). The canvas can't take pointer events,
// so this gives the book its cursor, clicks, taps and keyboard focus.
function BookLink({
  href,
  label,
  outline,
  rendererRef,
}: {
  href: string;
  label: string;
  outline: [number, number][];
  rendererRef: RefObject<HillsRenderer | null>;
}) {
  const xs = outline.map(([x]) => x);
  const ys = outline.map(([, y]) => y);
  const [left, top] = [Math.min(...xs), Math.min(...ys)];
  const [width, height] = [Math.max(...xs) - left, Math.max(...ys) - top];
  const clip = outline
    .map(
      ([x, y]) =>
        `${((x - left) / width) * 100}% ${((y - top) / height) * 100}%`,
    )
    .join(", ");
  const hold = (held: boolean) => () => rendererRef.current?.setBookHeld(held);

  return (
    <Link
      href={href}
      aria-label={label}
      onPointerEnter={hold(true)}
      onPointerLeave={hold(false)}
      onFocus={hold(true)}
      onBlur={hold(false)}
      // Unclipped while focused, so the focus ring shows.
      className="fixed z-20 [clip-path:var(--book-clip)] focus-visible:[clip-path:none]"
      style={
        {
          left: `${left * 100}%`,
          top: `${top * 100}%`,
          width: `${width * 100}%`,
          height: `${height * 100}%`,
          "--book-clip": `polygon(${clip})`,
        } as CSSProperties
      }
    />
  );
}
