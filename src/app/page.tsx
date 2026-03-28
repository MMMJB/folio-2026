import WorkPill from "@/components/WorkPill";

export default function Home() {
  return (
    <div className="mx-auto grid max-w-xl grid-cols-1 gap-y-5 px-6 py-8 underline-offset-4 sm:my-20 sm:grid-cols-3 sm:p-0 sm:text-pretty [&_>_*]:col-span-2">
      <div>
        <h1>Michael Beck</h1>
        <span className="text-tx-secondary">Software Engineer</span>
        <span className="text-tx-secondary flex gap-1.5">
          <a
            className="hover:text-tx-primary underline transition-colors"
            href="mailto:michael@beck.so"
            target="_blank"
            rel="noopener noreferrer"
          >
            Email
          </a>
          <a
            className="hover:text-tx-primary underline transition-colors"
            href="https://linkedin.com/in/michaelbeck0"
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn
          </a>
          <a
            className="hover:text-tx-primary underline transition-colors"
            href="https://x.com/michaelbeckj"
            target="_blank"
            rel="noopener noreferrer"
          >
            X
          </a>
        </span>
      </div>
      <p>
        I&rsquo;m a frontend engineering intern at{" "}
        <WorkPill href="https://pointer.ai" logo="/logos/pointer.png">
          Pointer
        </WorkPill>{" "}
        and a student at Cornell University.
      </p>
      <p>
        I previously worked at{" "}
        <span className="whitespace-nowrap">
          <WorkPill href="https://jstdigital.io" logo="/logos/jst.png">
            JST Capital
          </WorkPill>
          ,
        </span>{" "}
        <span className="whitespace-nowrap">
          <WorkPill href="https://codin.app" logo="/logos/codin.png">
            Codin
          </WorkPill>
          ,
        </span>{" "}
        and other startups. Last year, I co-founded{" "}
        <span className="whitespace-nowrap">
          <WorkPill href="https://vars.gg" logo="/logos/vars.png">
            vars.gg
          </WorkPill>
          ,
        </span>{" "}
        a competitive coding platform.
      </p>
      <figure className="relative col-span-full! -mx-3 mt-1 aspect-video overflow-hidden rounded-xl">
        <div
          style={{
            "--c": "1.5rem",
            "--cap-h": "2.5rem",
            "--cap-w": "9rem",
            clipPath: `shape(
              from 0% var(--c),
              curve to var(--c) 0% with 0% 0%,
              hline to calc(100% - var(--c)),
              curve to 100% var(--c) with 100% 0%,
              vline to calc(100% - var(--c)),
              curve to calc(100% - var(--c)) 100% with 100% 100%,
              hline to calc(var(--cap-w) + var(--c)),
              curve to var(--cap-w) calc(100% - var(--c)) with var(--cap-w) 100%,
              vline to calc(100% - (var(--cap-h) - var(--c))),
              curve to calc(var(--cap-w) - var(--c)) calc(100% - var(--cap-h)) with var(--cap-w) calc(100% - var(--cap-h)),
              hline to var(--c),
              curve to 0% calc(100% - var(--cap-h) - var(--c)) with 0% calc(100% - var(--cap-h))
            )`,
          }}
        >
          <video
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            className="bg-skeleton size-full select-none backface-hidden"
            width="100%"
            height="100%"
            poster="/thumbnails/vars.jpg"
          >
            <source src="/videos/vars.webm" type="video/webm" />
            <source src="/videos/vars.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
        <figcaption className="absolute bottom-0 left-0 px-4 py-3 text-xs">
          Shots from{" "}
          <a
            href="https://vars.gg"
            target="_blank"
            className="underline transition-colors"
          >
            vars.gg
          </a>
          .
        </figcaption>
      </figure>
    </div>
  );
}
