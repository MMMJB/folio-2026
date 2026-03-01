import "../styles/sf.css";

import { useRef, useEffect } from "react";

import SFFrame from "./SFFrame";

import SFContentManager from "../services/SFContentManager";

type VideoURL = `${string}.mp4`;

function replaceFileExtension(url: string, newExt: string) {
  return url.replace(/\.\w+$/, newExt);
}

function getVideoSource(videoName: string) {
  return `/videos/${videoName}`;
}

function getPosterSource(videoName: string) {
  return `/thumbnails/${replaceFileExtension(videoName, ".jpg")}`;
}

export default function SFPlayer({ videos }: { videos: VideoURL[] }) {
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
      className="sf-player h-[var(--sf-frame-h)] w-max cursor-grab touch-none overflow-hidden bg-[var(--sf-bg-surface)]"
    >
      {videos.map((src, i) => (
        <SFFrame key={i}>
          <video
            loop
            playsInline
            poster={getPosterSource(src)}
            preload={i == 0 ? "metadata" : "none"}
            width="100%"
            height="auto"
            className="aspect-video"
          >
            <source
              src={
                i === 0
                  ? getVideoSource(replaceFileExtension(src, ".webm"))
                  : undefined
              }
              data-src={getVideoSource(replaceFileExtension(src, ".webm"))}
              type="video/webm"
            />
            <source
              src={i === 0 ? getVideoSource(src) : undefined}
              data-src={getVideoSource(src)}
              type="video/mp4"
            />
          </video>
        </SFFrame>
      ))}
    </div>
  );
}
