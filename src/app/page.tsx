import VideoCarousel from "@/components/VideoCarousel";
import WorkPill from "@/components/WorkPill";
import SocialLink from "@/components/SocialLink";
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
    <div className="mx-auto grid max-w-xl grid-cols-1 gap-y-5 px-6 py-8 underline-offset-4 sm:my-20 sm:grid-cols-3 sm:p-0 sm:text-pretty">
      <div>
        <h1>Michael Beck</h1>
        <span className="text-tx-secondary">Software Engineer</span>
        <span className="text-tx-secondary flex gap-1.5">
          <SocialLink href="mailto:michael@beck.so">Email</SocialLink>
          <SocialLink href="https://linkdin.com/in/michaelbeck0">
            LinkedIn
          </SocialLink>
          <SocialLink href="https://x.com/michaelbeckj">X</SocialLink>
        </span>
      </div>
      <p className="col-span-2">
        I&rsquo;m a product and deployed engineer at{" "}
        <WorkPill href="https://pointer.ai" logo="/logos/pointer.png">
          Pointer
        </WorkPill>
        . In 2025, I co-founded{" "}
        <span className="whitespace-nowrap">
          <WorkPill href="https://vars.gg" logo="/logos/vars.png">
            vars.gg
          </WorkPill>
          ,
        </span>{" "}
        a competitive coding platform. I'm currently exploring XR.
      </p>
      <VideoCarousel videos={videos} />
    </div>
  );
}
