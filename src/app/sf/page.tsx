import SFPlayer from "@/components/SFPlayer";

export default function SFTestPage() {
  return (
    <SFPlayer
      content={[
        {
          type: "partial",
          title: "The vars.gg landing page",
          description:
            "Shots from the landing page I designed for vars, a competitive coding website.",
          src: "/vars.mp4",
        },
        {
          type: "partial",
          title: "Luel landing page redesign",
          description:
            "My (rejected) design for Luel's very vibecoded landing page.",
          src: "/luel.mp4",
        },
      ]}
    />
  );
}
