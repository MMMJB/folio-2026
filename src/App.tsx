import SFPlayer from "./components/SFPlayer";

export default function App() {
  return (
    <SFPlayer
      content={[
        {
          likes: 101,
          views: 1240,
          shares: 12,
          title: "Video 1",
          description: "Description for video 1",
          tags: ["tag1", "tag2"],
          work: null,
          src: "1.mp4",
        },
        {
          likes: 202,
          views: 2480,
          shares: 24,
          title: "Video 2",
          description: "Description for video 2",
          tags: ["tag3", "tag4"],
          work: null,
          src: "2.mp4",
        },
      ]}
    />
  );
}
