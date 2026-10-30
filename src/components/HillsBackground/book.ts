import type { Program } from "./gl";
import { hexToRgb } from "./motes";
import { MAX_TURNING_PAGES } from "./shader/book";
import { HORIZON_SHIFT } from "./shader/camera";
import { FOCAL_LENGTH } from "./shader/common";

// The book lying in the grass, which opens while the cursor is over it; see
// shader/book.ts. The camera sits at the origin looking down +z, with +x to
// the right. Sizes are in centimetres at scale 1.
export type BookSettings = {
  // Ground position, in metres.
  x: number;
  z: number;
  // Degrees: turn about the vertical, then tip forward and to the side. The
  // book is lifted so its lowest corner rests on the ground.
  yaw: number;
  pitch: number;
  roll: number;
  // Multiplies every size below. Blades grow with distance (see furLength),
  // so a book this far out must too to show above them. 0 hides it.
  scale: number;
  // Across the cover, from the spine, and along the spine.
  width: number;
  height: number;
  // The page block's thickness. The spine spans it and both boards, so the
  // closed book is this plus two boards thick.
  binding: number;
  // Each cover board's thickness; the pages sit on top of it.
  board: number;
  // Share of the pages that fan over with the front cover; the rest stay on
  // the back.
  split: number;
  // How tall each half of the pages stands once open, 1 as in the closed
  // book.
  pagesOpen: number;
  // Degrees: how steeply the top page leaves the binding. Each open half's
  // pages arc up from the binding at this angle and level off; lower spreads
  // the arc wider.
  gutterAngle: number;
  // How far above the binding the open pages meet, in centimetres; 0 meets
  // on it. At most just under each half's open height.
  meet: number;
  // How much the paper darkens into the gutter.
  gutterShadow: number;
  // Share of the boards' size the pages fall short by.
  pageInset: number;
  // Loose pages that turn over after the cover, up to MAX_TURNING_PAGES.
  turningPages: number;
  // Degrees: how far a loose page bends mid-turn, its free edge lagging.
  curl: number;
  // Seconds the cover takes to open, and each loose page to turn.
  coverSeconds: number;
  pageSeconds: number;
  // Seconds after the cover starts that the first loose page does, and
  // between each after.
  pageDelay: number;
  pageStagger: number;
  // The cloth cover, the page edges, and the gilt band along the spine.
  cover: string;
  pages: string;
  band: string;
};

// Left of the section, below where the hill meets it. Chosen in the book
// playground artifact.
export const DEFAULT_BOOK: BookSettings = {
  x: -24.5,
  z: 85.5,
  yaw: -50,
  pitch: -2,
  roll: 7,
  scale: 9.7,
  width: 15,
  height: 22,
  binding: 3,
  board: 1,
  split: 0.56,
  pagesOpen: 1,
  gutterAngle: 50,
  meet: 0,
  gutterShadow: 0,
  pageInset: 0,
  turningPages: 4,
  curl: 86,
  coverSeconds: 0.8,
  pageSeconds: 0.85,
  pageDelay: 0.15,
  pageStagger: 0.09,
  cover: "#80211a",
  pages: "#ebe0c2",
  band: "#c79e4d",
};

const radians = (degrees: number) => (degrees * Math.PI) / 180;

const turningPages = (book: BookSettings) =>
  Math.min(Math.max(Math.round(book.turningPages), 0), MAX_TURNING_PAGES);

// Seconds from closed to fully open, or back.
export function bookOpenSeconds(book: BookSettings) {
  const pages = turningPages(book);
  const lastPage =
    pages > 0
      ? book.pageDelay + (pages - 1) * book.pageStagger + book.pageSeconds
      : 0;
  return Math.max(book.coverSeconds, lastPage, 0.01);
}

type Vec3 = [number, number, number];

// The book's half extents in metres, as setupBook in shader/book.ts has them.
function bookHalf(book: BookSettings): Vec3 {
  const thickness = book.binding + 2 * book.board;
  return [
    (book.width / 200) * book.scale,
    (thickness / 200) * book.scale,
    (book.height / 200) * book.scale,
  ];
}

// Book space to world, as bookRotation: yaw * pitch * roll.
function rotate(book: BookSettings, [x, y, z]: Vec3): Vec3 {
  const [yaw, pitch, roll] = [book.yaw, book.pitch, book.roll].map(radians);
  [x, y] = [
    Math.cos(roll) * x - Math.sin(roll) * y,
    Math.sin(roll) * x + Math.cos(roll) * y,
  ];
  [y, z] = [
    Math.cos(pitch) * y - Math.sin(pitch) * z,
    Math.sin(pitch) * y + Math.cos(pitch) * z,
  ];
  [x, z] = [
    Math.cos(yaw) * x + Math.sin(yaw) * z,
    -Math.sin(yaw) * x + Math.cos(yaw) * z,
  ];
  return [x, y, z];
}

// Andrew's monotone chain; points in, their convex hull out, in order.
function convexHull(points: [number, number][]) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: [number, number][]) => {
    const hull: [number, number][] = [];
    for (const p of list) {
      while (
        hull.length >= 2 &&
        cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0
      ) {
        hull.pop();
      }
      hull.push(p);
    }
    hull.pop();
    return hull;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

// Where the book and the ground its open board covers land on screen, as a
// polygon in fractions of the frame (x right, y down), or null if it's out
// of view. ground is the terrain height under the book and eye the camera's
// height, both read back from the GPU; aspect is width over height.
export function bookOutline(
  book: BookSettings,
  ground: number,
  eye: number,
  aspect: number,
): [number, number][] | null {
  if (book.scale <= 0) return null;
  const [hx, hy, hz] = bookHalf(book);
  // Lifted so its lowest corner rests on the ground.
  const up = (
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ] as Vec3[]
  ).map((axis) => rotate(book, axis)[1]);
  const lift =
    Math.abs(up[0]) * hx + Math.abs(up[1]) * hy + Math.abs(up[2]) * hz;
  // A box around the closed book and its open board, a little generous.
  const center: Vec3 = [-(hx + hy), 0.5 * hx, 0];
  const extent: Vec3 = [
    (2 * hx + hy) * 1.15,
    (hy + 0.5 * hx) * 1.15,
    hz * 1.15,
  ];
  const points: [number, number][] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const [x, y, z] = rotate(book, [
          center[0] + sx * extent[0],
          center[1] + sy * extent[1],
          center[2] + sz * extent[2],
        ]);
        // Relative to the camera, at the origin looking down +z.
        const depth = z + book.z;
        if (depth < 0.1) return null;
        const u = (FOCAL_LENGTH * (x + book.x)) / depth;
        const v =
          (FOCAL_LENGTH * (y + ground + lift - eye)) / depth - HORIZON_SHIFT;
        points.push([0.5 + u / aspect, 0.5 - v]);
      }
    }
  }
  return convexHull(points);
}

// open runs from 0, closed, to 1, open.
export function setBookUniforms(
  gl: WebGL2RenderingContext,
  { uniform }: Program,
  book: BookSettings,
  open: number,
) {
  gl.uniform1f(uniform("uBookOpen"), open);
  gl.uniform2f(uniform("uBookPosition"), book.x, book.z);
  gl.uniform3f(
    uniform("uBookRotation"),
    radians(book.yaw),
    radians(book.pitch),
    radians(book.roll),
  );
  gl.uniform1f(uniform("uBookScale"), book.scale);
  // Half extents in metres at scale 1, and each board's share of the
  // thickness.
  const thickness = book.binding + 2 * book.board;
  gl.uniform3f(
    uniform("uBookHalf"),
    book.width / 200,
    thickness / 200,
    book.height / 200,
  );
  gl.uniform1f(uniform("uBookBoard"), book.board / thickness);
  gl.uniform4f(
    uniform("uBookPageShape"),
    book.pagesOpen,
    book.split,
    radians(Math.min(Math.max(book.gutterAngle, 0.5), 89)),
    Math.max(book.meet, 0) / 100,
  );
  gl.uniform2f(uniform("uBookPageLook"), book.gutterShadow, book.pageInset);
  gl.uniform4f(
    uniform("uBookTurning"),
    turningPages(book),
    radians(book.curl),
    book.pageDelay,
    book.pageStagger,
  );
  gl.uniform3f(
    uniform("uBookTiming"),
    Math.max(book.coverSeconds, 0.01),
    Math.max(book.pageSeconds, 0.01),
    bookOpenSeconds(book),
  );
  gl.uniform3f(uniform("uBookCover"), ...hexToRgb(book.cover));
  gl.uniform3f(uniform("uBookPages"), ...hexToRgb(book.pages));
  gl.uniform3f(uniform("uBookBand"), ...hexToRgb(book.band));
}
