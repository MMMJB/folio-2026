import VideoCarousel from "@/components/VideoCarousel";
import WorkPill from "@/components/WorkPill";
import CaptionLink from "@/components/CaptionLink";

/*
- [x] vars landing
- [x] luel
- [ ] vars app
- [ ] launch client
- [ ] theme palette
*/

const videos = [
  {
    src: "vars",
    thumbnail: "/thumbnails/vars.jpg",
    date: "2025",
    caption: (
      <>
        Shots from the{" "}
        <CaptionLink href="https://vars.gg/">vars.gg</CaptionLink> landing page
      </>
    ),
  },
  {
    src: "luel",
    thumbnail: "/thumbnails/luel.jpg",
    date: "2026",
    caption: (
      <>
        My (rejected){" "}
        <CaptionLink href="https://luel-three.vercel.app">Luel</CaptionLink>{" "}
        landing page redesign
      </>
    ),
  },
];

export default function Home() {
  return (
    <div className="mx-auto grid max-w-xl grid-cols-1 gap-y-5 px-6 py-8 underline-offset-4 *:col-span-2 sm:my-20 sm:grid-cols-3 sm:p-0 sm:text-pretty">
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
      <VideoCarousel videos={videos} />
    </div>
  );
}
