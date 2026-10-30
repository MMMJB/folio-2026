// A hardback lying in the grass, pressing it flat around itself, that opens
// while the cursor is over it. Everything is traced analytically in book
// space: the spine on the -x side, page edges on the other three, boards on
// top and bottom. It opens in the middle: the spine folds down flat, hinged
// on the back board, and the front board swings over on the spine's other
// edge. The pages are bound along the middle of the spine, and some of them
// fan over with the front board; open, every page in each half arcs up from
// the binding and levels off, the arcs cascading from the top page down. A few loose pages follow them over, each a
// sheet bent along a circular arc so its free edge lags behind as it turns.
// Like the blades, the book is sized for the distance it sits at rather than
// true to life. Its shape and timing come from BookSettings in book.ts.

// The most loose pages that can turn.
export const MAX_TURNING_PAGES = 8;

export const book = /* glsl */ `
// Ground position (x, z), rotation (yaw, pitch, roll in radians) and scale;
// scale 0 hides it.
uniform vec2 uBookPosition;
uniform vec3 uBookRotation;
uniform float uBookScale;
// How far through opening it is, 0 closed to 1 open.
uniform float uBookOpen;

uniform vec3 uBookCover;
uniform vec3 uBookPages;
uniform vec3 uBookBand;

// Shape; see BookSettings. Half extents at scale 1, in metres: width,
// thickness (half the binding) and height.
uniform vec3 uBookHalf;
// Each board's share of the thickness.
uniform float uBookBoard;
// Open page height (1 as closed), front half's share of the pages, and the
// angle (radians) at which the top page leaves the binding, and how far
// above the binding the pages meet once open (metres at scale 1).
uniform vec4 uBookPageShape;
// How much the gutter darkens, and how far pages are inset from the boards.
uniform vec2 uBookPageLook;
// Loose pages: how many, their curl mid-turn (radians), and the seconds
// after the cover the first starts and between each.
uniform vec4 uBookTurning;
// Seconds the cover and each loose page take, and the whole opening.
uniform vec3 uBookTiming;

// Grass flattens out to this many book widths beyond its edges.
const float BOOK_PRESS_MARGIN = 0.15;
const int MAX_TURNING_PAGES = ${MAX_TURNING_PAGES};

const float PI = 3.14159265;

// Materials of the book's surfaces.
const int BOOK_CLOTH = 0;
const int BOOK_EDGES = 1;
const int BOOK_PAPER = 2;
const int BOOK_GILT = 3;

// Set by setupBook for this pixel. Book space has its origin at the book's
// centre and the axes above.
mat3 bookRotation;
vec3 bookCenter;
vec3 bookHalf;
float bookBoard;
// Thickness of all the pages; each half is half this.
float bookPaper;
// How far the front board has swung over, 0 closed to PI open. The spine
// turns half as far, folding down about its edge on the back board, which
// carries the front board's hinge along its other edge.
float coverAngle;
vec2 spineBase;
vec2 spineDirection;
vec2 coverHinge;
// Where the pages are bound, along the middle of the spine's inside, and
// where they meet, lifted off it toward the pages as the book opens.
vec2 pageHinge;
vec2 pageMeet;
float pageLift;
// How far open, 0 to 1, with the cover.
float bookOpening;
// Each turning page's progress, 0 flat on the right half to 1 turned over.
float pageTurn[MAX_TURNING_PAGES];
// Whether this pixel's ray passes near enough to the book to press grass it
// can hit; when not, marchFur skips bookPress.
bool bookNear = false;

// Set by bookTrace for the surface it hits, in book space, and on page
// edges, how far up through the pages it is (0 bottom, 1 top).
vec3 bookNormal;
int bookMaterial;
float bookLeaf;

float easeInOut(float x) {
  x = clamp(x, 0.0, 1.0);
  return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) / 2.0;
}

// Returns the ray's entry distance into a box of half extents h centred at
// the origin (FAR if it misses) and the face it enters through in n.
float boxHit(vec3 ro, vec3 rd, vec3 h, out vec3 n) {
  vec3 inv = 1.0 / rd;
  vec3 a = (-h - ro) * inv;
  vec3 b = (h - ro) * inv;
  vec3 near = min(a, b);
  vec3 far = max(a, b);
  float tNear = max(max(near.x, near.y), near.z);
  float tFar = min(min(far.x, far.y), far.z);
  n = -sign(rd) * step(near.yzx, near) * step(near.zxy, near);
  return tNear < tFar && tFar > 0.0 ? max(tNear, 0.0) : FAR;
}

// A page: a sheet running len from hinge (x, y) and halfZ either side of
// z = 0, leaving the hinge at angle theta and bending at curvature kappa
// (positive turns anticlockwise). Returns the distance to it, or FAR, and
// its normal in n.
float pageHit(vec3 ro, vec3 rd, vec2 hinge, float theta, float kappa, float len, float halfZ, out vec3 n) {
  vec2 tangent = vec2(cos(theta), sin(theta));
  vec2 side = vec2(-tangent.y, tangent.x);
  if (abs(kappa) * len < 1e-3) {
    float denom = dot(rd.xy, side);
    if (abs(denom) < 1e-6) return FAR;
    float t = dot(hinge - ro.xy, side) / denom;
    vec3 p = ro + rd * t;
    float s = dot(p.xy - hinge, tangent);
    if (t <= 0.0 || s < 0.0 || s > len || abs(p.z) > halfZ) return FAR;
    n = vec3(side, 0.0);
    return t;
  }
  float r = 1.0 / abs(kappa);
  vec2 center = hinge + side * sign(kappa) * r;
  vec2 oc = ro.xy - center;
  float a = dot(rd.xy, rd.xy);
  if (a < 1e-8) return FAR;
  float b = dot(oc, rd.xy);
  float disc = b * b - a * (dot(oc, oc) - r * r);
  if (disc < 0.0) return FAR;
  vec2 start = hinge - center;
  float a0 = atan(start.y, start.x);
  for (int k = 0; k < 2; k++) {
    float t = (-b + (k == 0 ? -1.0 : 1.0) * sqrt(disc)) / a;
    if (t <= 0.0) continue;
    vec3 p = ro + rd * t;
    if (abs(p.z) > halfZ) continue;
    vec2 d = p.xy - center;
    float along = mod((atan(d.y, d.x) - a0) * sign(kappa), 2.0 * PI) * r;
    if (along <= len) {
      n = vec3(d / r, 0.0);
      return t;
    }
  }
  return FAR;
}

void setupBook(vec3 ro, vec3 rd) {
  if (uBookScale <= 0.0) return;
  vec3 r = uBookRotation;
  float cy = cos(r.x), sy = sin(r.x);
  float cp = cos(r.y), sp = sin(r.y);
  float cr = cos(r.z), sr = sin(r.z);
  mat3 yaw = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  mat3 pitch = mat3(1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, -sp, cp);
  mat3 roll = mat3(cr, sr, 0.0, -sr, cr, 0.0, 0.0, 0.0, 1.0);
  bookRotation = yaw * pitch * roll;
  bookHalf = uBookHalf * uBookScale;
  bookBoard = 2.0 * bookHalf.y * uBookBoard;
  // Its lowest corner rests on the ground.
  vec3 up = vec3(bookRotation[0].y, bookRotation[1].y, bookRotation[2].y);
  float lift = dot(abs(up), bookHalf);
  bookCenter = vec3(uBookPosition.x, terrain(uBookPosition) + lift, uBookPosition.y);

  float thickness = 2.0 * bookHalf.y;
  bookPaper = thickness - 2.0 * bookBoard;
  float seconds = uBookOpen * uBookTiming.z;
  coverAngle = PI * easeInOut(seconds / uBookTiming.x);
  float spineAngle = 0.5 * coverAngle;
  spineBase = vec2(-bookHalf.x, -bookHalf.y);
  spineDirection = vec2(-sin(spineAngle), cos(spineAngle));
  coverHinge = spineBase + thickness * spineDirection;
  vec2 inward = vec2(spineDirection.y, -spineDirection.x);
  pageHinge = spineBase + 0.5 * thickness * spineDirection + bookBoard * inward;
  bookOpening = coverAngle / PI;
  pageLift = uBookPageShape.w * uBookScale * bookOpening;
  pageMeet = pageHinge + pageLift * inward;
  for (int i = 0; i < MAX_TURNING_PAGES; i++) {
    float start = uBookTurning.z + float(i) * uBookTurning.w;
    pageTurn[i] = easeInOut((seconds - start) / uBookTiming.y);
  }

  vec3 margin = vec3(BOOK_PRESS_MARGIN * bookHalf.x * 2.0);
  vec3 n;
  vec3 local = (ro - bookCenter) * bookRotation;
  // Wide enough for the open board and spine on the -x side; pressed grass
  // is at most a tall blade high.
  float open = bookHalf.x + bookHalf.y;
  vec3 reach = bookHalf + margin + vec3(open, 3.0, 0.0);
  bookNear = boxHit(local - vec3(-open, 0.0, 0.0), rd * bookRotation, reach, n) < FAR;
}

// How flat the grass at xz is pressed: 1 under the book (and the open
// board), easing to 0 over the margin around it.
float bookPress(vec2 xz) {
  vec3 local = (vec3(xz.x, bookCenter.y, xz.y) - bookCenter) * bookRotation;
  // The open board and spine cover ground to the -x side once the board is
  // past upright.
  float spread = 2.0 * (bookHalf.x + bookHalf.y) * clamp(coverAngle / (0.5 * PI) - 1.0, 0.0, 1.0);
  local.x += 0.5 * spread;
  vec2 outside = max(abs(local.xz) - vec2(bookHalf.x + 0.5 * spread, bookHalf.z), 0.0);
  return 1.0 - smoothstep(0.0, BOOK_PRESS_MARGIN * bookHalf.x * 2.0, length(outside));
}

// Half the pages, in a frame from the binding at the origin: x from 0 to
// len, z within halfZ, and y from lo up to the top page. The top page
// leaves the binding at angle and arcs up along a circle until it levels
// off at height top; each page under it follows the same arc scaled down,
// so they all fan from the binding. Returns the distance to it, or FAR, its
// normal in n, and in leaf the hit's height through the pages.
float pagesHit(vec3 ro, vec3 rd, float len, float lo, float top, float halfZ, float angle, out vec3 n, out float leaf) {
  vec3 inv = 1.0 / rd;
  vec3 a = (vec3(0.0, lo, -halfZ) - ro) * inv;
  vec3 b = (vec3(len, top, halfZ) - ro) * inv;
  vec3 near = min(a, b);
  vec3 far = max(a, b);
  float tNear = max(max(near.x, near.y), near.z);
  float tFar = min(min(far.x, far.y), far.z);
  if (tNear >= tFar || tFar <= 0.0) return FAR;
  tNear = max(tNear, 0.0);
  n = -sign(rd) * step(near.yzx, near) * step(near.zxy, near);

  // The top page's arc: a circle of radius r centred below where it levels
  // off, run from the binding.
  float r = top / max(1.0 - cos(angle), 1e-6);
  float run = r * sin(angle);
  vec2 center = vec2(run, top - r);
  vec3 p = ro + rd * tNear;
  float t = tNear;
  bool under = top <= 1e-6 || p.x >= run || p.y <= center.y || distance(p.xy, center) <= r;
  if (!under) {
    // Enters through the arc.
    vec2 oc = ro.xy - center;
    float qa = dot(rd.xy, rd.xy);
    float qb = dot(oc, rd.xy);
    float disc = qb * qb - qa * (dot(oc, oc) - r * r);
    if (qa < 1e-12 || disc < 0.0) return FAR;
    t = (-qb - sqrt(disc)) / qa;
    if (t < tNear || t > tFar) return FAR;
    p = ro + rd * t;
    if (p.x > run) return FAR;
    n = vec3((p.xy - center) / r, 0.0);
  }
  float ceiling = p.x >= run || top <= 1e-6 ? top : center.y + sqrt(max(r * r - (p.x - run) * (p.x - run), 0.0));
  leaf = clamp((p.y - lo) / max(ceiling - lo, 1e-6), 0.0, 1.0);
  return t;
}

// The ray in a frame of book space turned about z: origin o, x along a
// and y along a rotated a quarter turn anticlockwise.
vec3 turned(vec3 v, vec2 o, vec2 a) {
  vec2 q = v.xy - o;
  return vec3(dot(q, a), dot(q, vec2(-a.y, a.x)), v.z);
}

vec3 unturned(vec3 n, vec2 a) {
  return vec3(n.x * a + n.y * vec2(-a.y, a.x), n.z);
}

// The distance along a ray in book space to the book, or FAR; sets
// bookNormal and bookMaterial.
float bookTrace(vec3 ro, vec3 rd) {
  vec3 n;
  float thickness = 2.0 * bookHalf.y;
  // Everything the book can reach, open or closed: from the open board's
  // edge to the back board's, and from below the folded spine to the board
  // standing upright.
  vec2 lo = vec2(-3.0 * bookHalf.x - thickness - bookBoard, -bookHalf.y - bookBoard);
  vec2 hi = vec2(bookHalf.x, bookHalf.y + 2.0 * bookHalf.x);
  vec3 bound = vec3(0.5 * (hi - lo), bookHalf.z);
  if (boxHit(ro - vec3(0.5 * (lo + hi), 0.0), rd, bound, n) >= FAR) return FAR;

  // The back board.
  float best = boxHit(ro - vec3(0.0, -bookHalf.y + 0.5 * bookBoard, 0.0), rd, vec3(bookHalf.x, 0.5 * bookBoard, bookHalf.z), n);
  if (best < FAR) {
    bookNormal = n;
    bookMaterial = BOOK_CLOTH;
  }

  // The spine, folding outward from its edge on the back board.
  vec3 o = turned(ro, spineBase, spineDirection);
  vec3 d = turned(rd, vec2(0.0), spineDirection);
  float t = boxHit(o - vec3(0.5 * thickness, 0.5 * bookBoard, 0.0), d, vec3(0.5 * thickness, 0.5 * bookBoard, bookHalf.z), n);
  if (t < best) {
    best = t;
    bookNormal = unturned(n, spineDirection);
    bookMaterial = BOOK_CLOTH;
  }

  // The front board, in its frame: x from the hinge across the board, its
  // outer face at y = 0.
  vec2 across = vec2(cos(coverAngle), sin(coverAngle));
  o = turned(ro, coverHinge, across);
  d = turned(rd, vec2(0.0), across);
  t = boxHit(o - vec3(bookHalf.x, -0.5 * bookBoard, 0.0), d, vec3(bookHalf.x, 0.5 * bookBoard, bookHalf.z), n);
  if (t < best) {
    best = t;
    vec3 p = o + d * t;
    bookNormal = unturned(n, across);
    bookMaterial = n.y > 0.0 && abs(p.z) < 0.85 * bookHalf.z && p.x > 0.28 * bookHalf.x && p.x < 0.38 * bookHalf.x
      ? BOOK_GILT : BOOK_CLOTH;
  }

  // The two halves of the pages, each in a frame from the binding along its
  // board. Closed they meet where the split puts them; opening, each moves
  // to lie on its board at its open height, its pages arcing up from the
  // binding.
  float inset = uBookPageLook.y;
  float width = (2.0 * bookHalf.x - bookBoard) * (1.0 - inset);
  float halfZ = bookHalf.z * (1.0 - inset);
  float u = bookOpening;
  vec2 closed = bookPaper * vec2(1.0 - uBookPageShape.y, uBookPageShape.y);
  vec2 opened = closed * uBookPageShape.x;
  float angle = uBookPageShape.z;
  // Every page meets at pageMeet, pageLift above the boards; the stacks
  // still rest on them. Kept just below the stacks' tops, since the pages
  // can only arc up from where they meet.
  vec2 lift = min(vec2(pageLift), 0.95 * u * opened);
  float leaf;
  // The back half's top page faces +y.
  o = vec3(ro.xy - pageMeet, ro.z) + vec3(0.0, pageLift - lift.x, 0.0);
  t = pagesHit(o, rd, width, (u - 1.0) * closed.x - lift.x, u * opened.x - lift.x, halfZ, angle, n, leaf);
  if (t < best) {
    best = t;
    bookNormal = n;
    bookMaterial = n.y > 0.0 ? BOOK_PAPER : BOOK_EDGES;
    bookLeaf = leaf;
  }
  // The front half turns with the board, and its top page faces -y, so it's
  // traced mirrored.
  vec3 mirror = vec3(1.0, -1.0, 1.0);
  o = turned(ro, pageMeet, across) * mirror + vec3(0.0, pageLift - lift.y, 0.0);
  t = pagesHit(o, d * mirror, width, (u - 1.0) * closed.y - lift.y, u * opened.y - lift.y, halfZ, angle, n, leaf);
  if (t < best) {
    best = t;
    bookMaterial = n.y > 0.0 ? BOOK_PAPER : BOOK_EDGES;
    bookNormal = unturned(n * mirror, across);
    bookLeaf = leaf;
  }

  // The loose pages turn from the back half to the front, bound at the
  // gutter where the halves thin to nothing.
  for (int i = 0; i < MAX_TURNING_PAGES; i++) {
    if (float(i) >= uBookTurning.x) break;
    float turn = pageTurn[i];
    if (turn <= 0.0) continue;
    float rest = PI - 0.012 * float(i + 1);
    float bend = uBookTurning.y * sin(PI * turn);
    // The hinge leads and the free edge lags, by half the bend each.
    float theta = turn * rest + 0.5 * bend;
    t = pageHit(ro, rd, pageMeet, theta, -bend / width, width, halfZ, n);
    if (t < best) {
      best = t;
      bookNormal = n;
      bookMaterial = BOOK_PAPER;
    }
  }
  return best;
}

// The distance along the ray to the book, or FAR.
float bookHit(vec3 ro, vec3 rd) {
  if (uBookScale <= 0.0) return FAR;
  return bookTrace((ro - bookCenter) * bookRotation, rd * bookRotation);
}

// 0 where the book shades p from the sun, else 1.
float bookShadow(vec3 p) {
  if (uBookScale <= 0.0) return 1.0;
  return bookTrace((p - bookCenter) * bookRotation, SUN * bookRotation) < FAR ? 0.0 : 1.0;
}
`;

// Shading, which needs the grass's mist (see fur.ts).
export const bookShading = /* glsl */ `
vec3 shadeBook(vec3 ro, vec3 rd, float t) {
  vec3 p = ro + rd * t;
  vec3 localRd = rd * bookRotation;
  bookTrace((ro - bookCenter) * bookRotation, localRd);
  vec3 local = (p - bookCenter) * bookRotation;
  vec3 n = bookNormal;
  // Pages are seen from either side.
  if (dot(n, localRd) > 0.0) n = -n;

  vec3 albedo = uBookCover;
  if (bookMaterial == BOOK_EDGES) {
    // Lines between the leaves follow the pages' arcs.
    float leaves = 0.5 + 0.5 * sin(bookLeaf * 60.0);
    albedo = uBookPages * mix(0.9, 1.0, leaves);
  } else if (bookMaterial == BOOK_PAPER) {
    // Paper darkens into the gutter at the spine.
    float gutter = smoothstep(0.0, 0.3, distance(local.xy, pageHinge) / (2.0 * bookHalf.x));
    albedo = uBookPages * mix(1.0 - uBookPageLook.x, 1.0, gutter);
  } else if (bookMaterial == BOOK_GILT) {
    albedo = uBookBand;
  }

  vec3 normal = bookRotation * n;
  float facing = dot(normal, SUN);
  // Thin paper lets some light through from behind.
  float through = bookMaterial == BOOK_PAPER ? 0.35 * max(-facing, 0.0) : 0.0;
  float sun = (max(facing, 0.0) + through) * smoothstep(0.2, 0.8, softShadow(p + normal * 0.2));
  // Sky from above, grass bounce from below, and darker where the book meets
  // the grass.
  vec3 ambient = mix(vec3(0.16, 0.26, 0.08), SKY_HORIZON * 0.55, 0.5 + 0.5 * normal.y);
  float contact = mix(0.55, 1.0, smoothstep(0.0, 0.6 * bookHalf.y, p.y - terrain(p.xz)));
  vec3 color = albedo * (SUN_COLOR * sun * 1.1 + ambient) * contact;

  vec3 haze = mix(HAZE, GRASS_RAMP_3, 0.45);
  color = mix(color, haze, 1.0 - exp(-0.0012 * t));
  return mix(color, MIST_COLOR, valleyMist(ro, rd, t));
}
`;
