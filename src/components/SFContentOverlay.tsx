import { useState, useRef } from "react";

import { PaperPlaneRightIcon, EyeIcon } from "@phosphor-icons/react/dist/ssr";
import Heart from "./Heart";

import { cn } from "../util/ui";

import type { SFContent } from "../types/sf";

const labelFormatter = new Intl.NumberFormat("en", { notation: "compact" });

function stopPropagation(e: React.PointerEvent) {
  e.stopPropagation();
}

function InteractionButton({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: number;
}) {
  const labelText = labelFormatter.format(label);

  return (
    <div
      className="flex flex-col items-center gap-1.5"
      style={{
        filter: "drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.35))",
      }}
      onPointerDown={stopPropagation}
      onPointerMove={stopPropagation}
      onPointerUp={stopPropagation}
    >
      {icon}
      <span className="text-xs">{labelText}</span>
    </div>
  );
}

export default function SFContentOverlay({ content }: { content: SFContent }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { title, description, tags, likes, views, shares } = content;

  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  return (
    <div
      ref={containerRef}
      className="sf-content-overlay absolute inset-0 z-10 flex items-end gap-4 p-4 text-sm text-white select-none"
      // create an overlay for each frame and stack them
      // when this frame is active, show the overlay with scale
      // this is the only reliable way to remove stutter on ios when transitioning
      // - react re-renders cause stutter
      // - manual dom updates cause stutter
      // - opacity changes cause stutter
      // - layered transforms cause stutter
      style={{
        "--is-active":
          "calc(1 - min(1, abs(calc(var(--frame-index) - var(--sf-active-frame)))))",
        "--is-not-scrolling":
          "calc(1 - min(round(up, abs(var(--sf-scroll, 0px)), 1px), 1px) / 1px)",
        transform: "scale(min(var(--is-active), var(--is-not-scrolling)))",
        transitionDelay: "calc(var(--is-not-scrolling) * 300ms)",
      }}
      onTransitionEnd={(e) => {
        const target = e.target as HTMLElement;

        if (target !== containerRef.current) return;

        target.classList.remove("animate-fade-in");
        void target.offsetWidth; // repaint to reset animation
        target.classList.add("animate-fade-in");
      }}
    >
      <div
        className="relative min-w-0 flex-1 cursor-pointer"
        onClick={() => setDescriptionExpanded((p) => !p)}
        onPointerDown={stopPropagation}
        onPointerMove={stopPropagation}
        onPointerUp={stopPropagation}
      >
        <div className="absolute -inset-16 -top-6 -z-10 bg-black/25 blur-2xl" />
        <h3 className="mb-1 font-medium">{title}</h3>
        <p
          className={cn(
            "overflow-hidden transition-[max-height] ease-in",
            descriptionExpanded
              ? "max-h-[calc(var(--sf-frame-h)/2)] duration-500"
              : "line-clamp-1 max-h-lh truncate duration-0",
          )}
        >
          {description}
          {tags.length && <br />}
          {tags.map((tag, i) => (
            <span key={i} className="mr-1 text-slate-200">
              #{tag}
            </span>
          ))}
        </p>
      </div>
      <div role="group" className="flex w-6 flex-col items-center gap-6">
        <InteractionButton icon={<Heart />} label={likes} />
        <InteractionButton
          icon={<EyeIcon weight="bold" size={22} />}
          label={views}
        />
        <InteractionButton
          icon={
            <PaperPlaneRightIcon
              weight="bold"
              className="-rotate-30"
              size={21}
            />
          }
          label={shares}
        />
        <div className="size-6 rounded-lg bg-black outline-[1.5px] outline-white"></div>
      </div>
    </div>
  );
}
