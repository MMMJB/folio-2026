import WorkPill from "@/components/WorkPill";

export default function Home() {
  return (
    <div className="mx-auto grid max-w-xl grid-cols-1 gap-y-5 px-6 py-8 text-pretty sm:my-20 sm:grid-cols-3 sm:p-0 [&_>_*]:col-span-2">
      <div>
        <h1>Michael Beck</h1>
        <span className="text-tx-secondary">Software Engineer</span>
      </div>
      <p>
        I&rsquo;m currently interning at{" "}
        <WorkPill href="https://pointer.ai" logo="/logos/pointer.png">
          Pointer
        </WorkPill>{" "}
        as a frontend engineer.
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
      <p className="flex items-center gap-1.5">
        Reach out:
        <span className="text-tx-secondary inline-flex gap-1.5 text-sm underline-offset-2">
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
      </p>
      <div className="bg-surface-100 relative col-span-full! -mx-3 mt-1 aspect-video overflow-hidden rounded-xl sm:mx-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          className="bg-skeleton size-full object-contain select-none backface-hidden"
          width="100%"
          height="100%"
          poster="/thumbnails/vars.jpg"
        >
          <source src="/videos/vars.webm" type="video/webm" />
          <source src="/videos/vars.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        <span className="selection:text-tx-primary absolute bottom-0 left-0 px-4 py-3 text-xs text-white/60">
          Shots from the{" "}
          <a
            href="https://vars.gg"
            target="_blank"
            className="underline underline-offset-2 transition-colors hover:text-white/80"
          >
            vars.gg
          </a>{" "}
          landing page.
        </span>
      </div>
    </div>
  );
}
