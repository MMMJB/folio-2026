import { useState } from "react";

import {
  HeartIcon,
  PaperPlaneRightIcon,
  EyeIcon,
} from "@phosphor-icons/react/dist/ssr";

import { cn } from "../util/ui";

import type { SFContent } from "../types/sf";

const labelFormatter = new Intl.NumberFormat("en", { notation: "compact" });

function InteractionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: number;
  onClick?: () => void;
}) {
  const labelText = labelFormatter.format(label);

  return (
    <button
      className="flex flex-col items-center gap-1.5"
      style={{
        filter: "drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.35))",
      }}
      onClick={onClick}
    >
      {icon}
      <span className="text-xs">{labelText}</span>
    </button>
  );
}

export default function SFContentOverlay({ content }: { content: SFContent }) {
  const { title, description, tags } = content;

  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  function stopPropagation(e: React.PointerEvent) {
    e.stopPropagation();
  }

  return (
    <div className="sf-content-overlay absolute inset-0 z-10 flex items-end gap-4 p-4 text-sm text-white select-none">
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
        <InteractionButton
          icon={<HeartIcon weight="bold" size={24} />}
          label={103959}
        />
        <InteractionButton
          icon={<EyeIcon weight="bold" size={22} />}
          label={103959}
        />
        <InteractionButton
          icon={
            <PaperPlaneRightIcon
              weight="bold"
              className="-rotate-30"
              size={21}
            />
          }
          label={32598}
        />
        <div className="size-6 rounded-lg bg-black outline-[1.5px] outline-white"></div>
      </div>
    </div>
  );
}
