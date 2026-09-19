// The background of the Solvane world, as GLSL ES 1.00 for a Three.js ShaderMaterial. It is rendered at reduced
// resolution into a render target that becomes the scene background, which is also what the glass refracts.
// Two windows of the page share it: region 0 is the hero, region 1 the sectors. Region 0 also draws the white sheet
// that rises over the hero (the problem section): white, lit from below by the hero's own light, in the same place.
// The hero repeats the CSS glow layer by layer (styles.css, .hero-glow-inner and its ::before/::after), in sRGB
// and premultiplied alpha like the browser composites it, so the crossfade from CSS to WebGL has no jump.
// (The file keeps its first name: it held the fog, removed at the person's request on 2026-09-18.)
export const vertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const fragment = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;        // window size, CSS px
uniform float uRegion;    // 0 hero, 1 sectors
uniform vec4 uGlow;       // hero glow: translate x, y (px), outer scale, inner scale
uniform float uGlowAlpha; // hero glow opacity (intro)
uniform vec4 uHalo;       // light behind the glass: x, y (window px, y down), radius (px), strength
uniform vec2 uHaloBand;   // rows the halo may light (window px): it fades out before reaching the text
uniform vec2 uSpot;       // sectors: light centre, window uv, y down
uniform vec2 uSpotSize;   // sectors: light radii, window uv (kept off the text so it keeps its contrast)
uniform vec3 uSpotColor;
uniform vec4 uPaper;      // the sheet: top edge (window px), corner radius (px), shade of the hero around its corners, light under the glass on it
uniform vec2 uPaperLight; // on the sheet, over white: strength of its own light; how far the hero's glow has turned into it (0-1)

// Premultiplied compositing, as the browser does it.
vec4 over(vec4 top, vec4 bottom) { return top + bottom * (1.0 - top.a); }
vec4 screen(vec4 a, vec4 b) { return a + b - a * b; }
// A CSS radial-gradient from a colour at alpha a0 to transparent at 70%.
vec4 soft(vec2 b, vec2 c, vec2 r, vec3 col, float a0) {
  float a = a0 * (1.0 - clamp(length((b - c) / r) / 0.7, 0.0, 1.0));
  return vec4(col * a, a);
}
vec4 mainGlow(float t) {
  vec3 c0 = vec3(238.0, 252.0, 247.0) / 255.0, c1 = vec3(166.0, 230.0, 218.0) / 255.0;
  vec3 c2 = vec3(88.0, 169.0, 220.0) / 255.0, c3 = vec3(39.0, 72.0, 200.0) / 255.0;
  if (t < 0.14) return vec4(mix(c0, c1, t / 0.14), 1.0);
  if (t < 0.32) return vec4(mix(c1, c2, (t - 0.14) / 0.18), 1.0);
  if (t < 0.54) return vec4(mix(c2, c3, (t - 0.32) / 0.22), 1.0);
  float a = 1.0 - clamp((t - 0.54) / 0.24, 0.0, 1.0);
  return vec4(c3 * a, a);
}

// The light behind the glass, so the refraction has something to bend.
vec4 halo(vec2 p, vec3 col) {
  vec2 d = (p - uHalo.xy) / uHalo.z;
  float a = uHalo.w * exp(-dot(d, d));
  a *= smoothstep(uHaloBand.x, uHaloBand.x + 60.0, p.y) * (1.0 - smoothstep(uHaloBand.y - 60.0, uHaloBand.y, p.y));
  return vec4(col * a, a);
}

// The hero glow's layers, premultiplied, before the night behind them, at a point of its box (uv, y down). Its
// main gradient fills the ellipse centred at (0.5, 1.08), radii (0.85, 0.55).
vec4 layers(vec2 b) {
  vec4 g = soft(b, vec2(0.94, 0.72), vec2(0.6, 0.5), vec3(30.0, 58.0, 190.0) / 255.0, 0.55);
  g = over(soft(b, vec2(0.06, 0.72), vec2(0.6, 0.5), vec3(30.0, 58.0, 190.0) / 255.0, 0.55), g);
  g = over(mainGlow(length((b - vec2(0.5, 1.08)) / vec2(0.85, 0.55))), g);
  g = screen(g, soft(b, vec2(0.34, 1.02), vec2(0.5, 0.35), vec3(39.0, 72.0, 200.0) / 255.0, 0.6));
  return screen(g, soft(b, vec2(0.66, 1.02), vec2(0.5, 0.35), vec3(31.0, 157.0, 139.0) / 255.0, 0.55));
}

// A window point in the glow's box, as the glow is on screen (it follows the mouse, breathes and recedes).
vec2 glowBox(vec2 p) {
  vec2 box = uRes + 80.0;                       // .hero-glow overscans the hero by 40px
  vec2 o = vec2(uRes.x * 0.5, uRes.y + 40.0);   // transform-origin 50% 100%
  vec2 q = o + (p - uGlow.xy - o) / uGlow.z;
  q = o + (q - o) / uGlow.w;
  return (q + 40.0) / box;
}
vec4 glowLayers(vec2 p) { return layers(glowBox(p)); }

// The sheet's own light, at its base only (the person's note, 2026-09-19): the hero glow's centre and palette, spread
// wide across the bottom and soft. A gaussian falloff and colours that blend over the whole reach, so there is no ring
// and no line of colour: turquoise low, sky blue, brand blue higher. No side lobes (removed at the person's request).
// Nothing above the middle of the sheet, where the glass stands.
vec4 wideLight(vec2 b) {
  float t = length((b - vec2(0.5, 1.08)) / vec2(1.6, 0.62));
  float a = exp(-2.3 * t * t) * smoothstep(0.42, 0.75, b.y);
  vec3 c = mix(vec3(127.0, 224.0, 207.0), vec3(88.0, 169.0, 220.0), smoothstep(0.0, 0.5, t));
  c = mix(c, vec3(39.0, 72.0, 200.0), smoothstep(0.35, 1.1, t)) / 255.0;
  return vec4(c * a, a);
}


vec3 hero(vec2 p) {
  vec4 g = screen(glowLayers(p), halo(p, vec3(83.0, 148.0, 204.0) / 255.0));  // halfway between brand blue and turquoise
  g *= uGlowAlpha;
  return g.rgb + vec3(5.0, 6.0, 10.0) / 255.0 * (1.0 - g.a);
}

vec3 sectors(vec2 p) {
  float t = length((p / uRes - uSpot) / uSpotSize) / 0.72;
  float a = 0.45 * (1.0 - clamp(t, 0.0, 1.0));
  vec4 g = screen(vec4(uSpotColor * a, a), halo(p, uSpotColor));
  return g.rgb + vec3(10.0, 11.0, 15.0) / 255.0 * (1.0 - g.a);
}

// How much of this pixel the sheet covers: its top edge, rounded at the corners, antialiased over a pixel.
float sheet(vec2 p) {
  vec2 c = vec2(clamp(p.x, uPaper.y, uRes.x - uPaper.y), uPaper.x + uPaper.y);
  float d = p.y >= c.y ? -1.0 : length(p - c) - uPaper.y;
  return clamp(0.5 - d, 0.0, 1.0);
}

// The sheet: white, lit from below, in the hero's place. As its edge comes in it carries the hero's glow itself (no
// seam in the light), which turns into the sheet's own wide, soft light as it rises. The glass may carry a little light
// of its own (uPaper.w; none on the sheet today).
vec3 paper(vec2 p) {
  vec2 b = glowBox(p);
  vec4 g = mix(layers(b), wideLight(b) * uPaperLight.x, uPaperLight.y) * uGlowAlpha;
  vec2 d = (p - uHalo.xy) / uHalo.z;
  float h = uPaper.w * exp(-dot(d, d));
  g = over(vec4(vec3(83.0, 148.0, 204.0) / 255.0 * h, h), g);
  return g.rgb + (1.0 - g.a);
}

// The render target stores sRGB, so the colour computed in sRGB (like CSS) is written as linear light.
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec3 col;
  if (uRegion > 0.5) col = sectors(p);
  else {
    // The hero's shade (a CSS layer) stops at the sheet's straight edge; the corners below it are shaded here.
    float s = sheet(p);
    if (s >= 1.0) col = paper(p);
    else {
      col = hero(p) * (p.y >= uPaper.x ? 1.0 - uPaper.z : 1.0);
      if (s > 0.0) col = mix(col, paper(p), s);
    }
  }
  gl_FragColor = vec4(toLinear(clamp(col, 0.0, 1.0)), 1.0);
}
`;
