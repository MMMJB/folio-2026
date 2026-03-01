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
}: {
  forceActive?: boolean;
  content: SFContent;
}) {
  const { src } = content;

  const videoSource = getVideoSource(src);
  const posterSource = getPosterSource(src);
  const webmSource = getVideoSource(replaceFileExtension(src, ".webm"));

  return (
    <div
      className="sf-frame h-[var(--sf-frame-h)] w-[var(--sf-frame-w)] bg-[var(--sf-bg-frame)] py-0.5 transition-transform ease-out will-change-transform"
      style={{
        transform:
          "translate(0, calc(var(--sf-scroll, 0px) + var(--sf-frame-h) * var(--sf-active-frame, 0) * -1))",
        transitionDuration: "var(--sf-scroll-transition, 0ms)",
      }}
    >
      <div className="sf-content relative flex size-full items-center bg-[var(--sf-bg-content)]">
        <SFContentOverlay content={content} />
        <video
          loop
          playsInline
          poster={posterSource}
          preload={forceActive ? "metadata" : "none"}
          width="100%"
          height="auto"
          className="aspect-video"
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
    </div>
  );
}
