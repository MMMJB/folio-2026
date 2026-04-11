"use client";

import { useState, useRef, useEffect } from "react";

import { memo, createRef } from "react";
import { cn } from "@/util/ui";

import type { RefObject } from "react";

interface VideoProps {
  src: string;
  thumbnail: string;
}

interface VideoCarouselVideo extends VideoProps {
  caption: React.ReactNode;
  date: string;
}

const Video = memo(
  ({
    src,
    thumbnail,
    active,
    progressRef,
    onEnd,
  }: VideoProps & {
    active: boolean;
    progressRef: RefObject<HTMLDivElement>;
    onEnd: () => void;
  }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    if (videoRef.current) {
      if (!active) {
        videoRef.current.pause();

        // prevent flashing when restarting
        requestAnimationFrame(() => {
          if (!videoRef.current) return;
          videoRef.current.currentTime = 0;
        });
      } else {
        videoRef.current.play();
      }
    }

    function onTick() {
      if (!videoRef.current || !progressRef.current) return;

      const { duration, currentTime } = videoRef.current;

      if (isNaN(duration) || duration === 0) return;

      const progress = (currentTime / duration) * 100;
      progressRef.current.style.setProperty("--progress", progress + "%");
    }

    return (
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        preload="metadata"
        className={cn(
          "bg-skeleton aspect-video size-full select-none backface-hidden",
          !active && "hidden",
        )}
        width="100%"
        height="100%"
        aria-hidden={!active}
        poster={thumbnail}
        onTimeUpdate={onTick}
        onEnded={onEnd}
      >
        <source src={`/videos/${src}.webm`} type="video/webm" />
        <source src={`/videos/${src}.mp4`} type="video/mp4" />
        Your browser does not support the video tag.
      </video>
    );
  },
);

export default function VideoCarousel({
  videos,
}: {
  videos: VideoCarouselVideo[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const progressRefs = useRef<RefObject<HTMLDivElement>[]>([]);

  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);

  // don't look
  if (progressRefs.current.length !== videos.length) {
    progressRefs.current = Array(videos.length)
      .fill(null)
      .map((_, i) => progressRefs.current[i] || createRef());
  }

  useEffect(() => {
    if (!containerRef.current || !captionRef.current) return;

    const { width } = captionRef.current.getBoundingClientRect();
    containerRef.current.style.setProperty("--cap-w", width + "px");
  }, [currentVideoIndex]);

  function nextVideo() {
    setCurrentVideoIndex((p) => (p + 1) % videos.length);
  }

  const numItems = videos.length;

  return (
    <figure
      ref={containerRef}
      className="relative col-span-full! -mx-3 mt-1 aspect-video"
      style={{
        "--n-items": numItems,
        "--control-item-sz": "0.5rem",
        "--control-item-gap": "calc(var(--control-item-sz) / 2)",
        "--control-pad": "1rem",
        "--control-h":
          "calc(var(--control-pad) * 2 + (var(--n-items) + 2) * var(--control-item-sz) + (var(--n-items) - 1) * var(--control-item-gap))",
        "--cap-w": "271.41px", // pre-computed to prevent layout shift
        "--c": "1rem",
        "--nc": "calc(-1 * var(--c))",
        "--notch": "2rem",
      }}
    >
      <div
        style={{
          filter: "drop-shadow(0 0 1px var(--color-surface-400))",
        }}
      >
        <div
          className="transition-[clip-path] duration-300 ease-in-out will-change-[clip-path]"
          style={{
            clipPath: `shape(
                from 0% var(--c),
                arc by var(--c) var(--nc) of var(--c) cw,
                hline to calc(100% - var(--c)),
                arc by var(--c) var(--c) of var(--c) cw,
                vline to calc(50% - var(--control-h) / 2 - var(--c)),
                arc by var(--nc) var(--c) of var(--c) cw,
                arc by var(--nc) var(--c) of var(--c) ccw,
                vline by calc(var(--control-h) - var(--c) * 2),
                arc by var(--c) var(--c) of var(--c) ccw,
                arc by var(--c) var(--c) of var(--c) cw,
                vline to calc(100% - var(--c)),
                arc by var(--nc) var(--c) of var(--c) cw,
                hline to calc(var(--cap-w) + var(--c)),
                arc by var(--nc) var(--nc) of var(--c) cw,
                arc by var(--nc) var(--nc) of var(--c) ccw,
                hline to var(--c),
                arc by var(--nc) var(--nc) of var(--c) cw
              )`,
          }}
        >
          {videos.map((video, i) => (
            <Video
              {...video}
              key={i}
              active={i === currentVideoIndex}
              progressRef={progressRefs.current[i]}
              onEnd={nextVideo}
            />
          ))}
        </div>
      </div>
      <figcaption
        ref={captionRef}
        className="absolute bottom-0 left-0 flex text-xs"
        style={{
          maxWidth: "calc(100% - 2 * var(--c))",
        }}
      >
        {videos.map(({ caption, date }, i) => (
          <span
            aria-hidden={i !== currentVideoIndex}
            className={cn(
              "inline-block truncate px-3 py-1.5 transition-[opacity,filter]",
              i === currentVideoIndex
                ? "opacity-100 delay-300 duration-300"
                : "pointer-events-none absolute opacity-0 blur-xs duration-200",
            )}
            key={i}
          >
            {caption} <span className="text-tx-secondary">({date})</span>
          </span>
        ))}
      </figcaption>
      <div
        className="absolute top-1/2 right-0 flex -translate-y-1/2 flex-col px-2.5"
        style={{
          gap: "var(--control-item-gap)",
          paddingBlock: "var(--control-pad)",
        }}
      >
        {Array.from({ length: numItems }).map((_, i) => {
          const active = i === currentVideoIndex;

          return (
            <button
              key={i}
              className="bg-surface-200 relative w-(--control-item-sz) cursor-pointer overflow-hidden rounded-full transition-[height] duration-300 ease-in-out"
              style={{
                height: `calc(var(--control-item-sz) * ${active ? 3 : 1})`,
              }}
              onClick={() => setCurrentVideoIndex(i)}
            >
              <div
                className={cn(
                  "bg-tx-primary pointer-events-none absolute inset-0 rounded-full",
                  active ? "opacity-100" : "opacity-0",
                )}
                style={{
                  transform: `translateY(calc(-100% + max(var(--progress, 0%), ${active ? "0px" : "var(--control-item-sz)"})))`,
                  transition: `transform 200ms linear, opacity 300ms ease-out ${active ? "300ms" : "0ms"}`,
                }}
                ref={(el) => {
                  if (el) {
                    progressRefs.current[i].current = el;
                  }
                }}
              />
            </button>
          );
        })}
      </div>
    </figure>
  );
}
