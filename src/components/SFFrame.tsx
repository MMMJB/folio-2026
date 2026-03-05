import SFContentOverlay from "./SFContentOverlay";

import type { SFContent } from "../types/sf";

function replaceFileExtension(url: string, newExt: string) {
  return url.replace(/\.\w+$/, newExt);
}

function getVideoSource(videoName: string) {
  return `/videos/${videoName}`;
}

function getPosterSource(videoName: string) {
  return `/thumbnails/${replaceFileExtension(videoName, ".jpg")}`;
}

export default function SFFrame({
  forceActive,
  content,
  frameIndex,
}: {
  forceActive?: boolean;
  content: SFContent;
  frameIndex: number;
}) {
  const { src } = content;

  const videoSource = getVideoSource(src);
  const posterSource = getPosterSource(src);
  const webmSource = getVideoSource(replaceFileExtension(src, ".webm"));

  return (
    <div
      className="sf-frame h-[var(--sf-frame-h)] w-[var(--sf-frame-w)] bg-black py-0.5 transition-transform ease-in-out"
      style={{
        "--frame-index": frameIndex,
      }}
    >
      <SFContentOverlay content={content} />
      <video
        loop
        playsInline
        muted
        poster={posterSource}
        preload={forceActive ? "metadata" : "none"}
        className="size-full object-contain transition-transform ease-in-out will-change-transform backface-hidden"
        width="100%"
        height="100%"
        style={{
          WebkitBackfaceVisibility: "hidden",
          transform:
            "translate(0, calc(var(--sf-scroll, 0px) + var(--sf-frame-h) * var(--sf-active-frame, 0) * -1))",
          transitionDuration: "var(--sf-scroll-transition, 0ms)",
        }}
      >
        <source
          src={forceActive ? webmSource : undefined}
          data-src={webmSource}
          type="video/webm"
        />
        <source
          src={forceActive ? videoSource : undefined}
          data-src={videoSource}
          type="video/mp4"
        />
      </video>
    </div>
  );
}
