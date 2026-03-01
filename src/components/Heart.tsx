import { useRef, useState, useEffect } from "react";

import { HeartIcon } from "@phosphor-icons/react";

import { cn } from "../util/ui";
import confetti from "canvas-confetti";

export default function Heart({
  onClick,
  defaultActive = false,
}: {
  onClick?: (active: boolean) => void;
  defaultActive?: boolean;
}) {
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);
  const myConfetti = useRef<confetti.CreateTypes | null>(null);

  const [active, setActive] = useState(defaultActive);
  const [pressing, setPressing] = useState(false);

  useEffect(() => {
    if (!confettiCanvasRef.current) return;

    myConfetti.current = confetti.create(confettiCanvasRef.current, {
      resize: true,
      useWorker: true,
    });
  }, []);

  return (
    <button
      className="group relative cursor-pointer transition-colors before:absolute before:inset-0 before:scale-200"
      style={{
        "--fill": "oklch(0.65 0.3 19.41)",
      }}
      onClick={() => {
        setActive((p) => {
          const newActive = !p;
          onClick?.(newActive);

          if (newActive) {
            myConfetti.current?.({
              particleCount: 16,
              spread: 360,
              ticks: 40,
              startVelocity: 2,
              gravity: 0,
              flat: true,
              scalar: 0.35,
              shapes: ["circle"],
              colors: ["#FF003B"],
            });
          }

          return newActive;
        });
      }}
      onPointerDown={() => setPressing(true)}
      onPointerUp={() => setPressing(false)}
      onPointerCancel={() => setPressing(false)}
    >
      <canvas
        ref={confettiCanvasRef}
        className="pointer-events-none absolute top-1/2 left-1/2 size-12 -translate-1/2"
        width={48}
        height={48}
      />
      <div
        className={cn(
          "absolute inset-0 rounded-full border border-[var(--fill)] transition-all",
          active ? "animate-ping" : "animate-none opacity-0",
        )}
        style={{
          animationFillMode: "forwards",
          animationIterationCount: "1",
        }}
      />
      <HeartIcon
        className={cn(
          "transition-transform",
          pressing ? "scale-90" : "scale-100",
          active
            ? "animate-jump origin-center text-[var(--fill)]"
            : "group-hover:animate-wiggle origin-bottom text-white",
        )}
        style={{
          transitionTimingFunction: pressing
            ? "ease"
            : "cubic-bezier(.25, .1, .41, 1.5)",
          transitionDuration: pressing ? "150ms" : "300ms",
        }}
        weight={active ? "fill" : "bold"}
        size={24}
      />
    </button>
  );
}
