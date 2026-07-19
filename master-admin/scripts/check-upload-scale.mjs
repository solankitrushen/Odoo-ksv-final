/** One runnable check: uploadScale math used by compress-image-for-upload. */
function uploadScale(width, height, maxEdge = 1600) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { w: width, h: height };
  const scale = maxEdge / longest;
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

const a = uploadScale(3200, 2400);
if (a.w !== 1600 || a.h !== 1200) {
  console.error("fail: landscape", a);
  process.exit(1);
}
const b = uploadScale(800, 600);
if (b.w !== 800 || b.h !== 600) {
  console.error("fail: already small", b);
  process.exit(1);
}
console.log("uploadScale ok");
