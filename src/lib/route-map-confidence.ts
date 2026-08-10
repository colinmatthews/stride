// Maps a confidence segment's startT/endT fractions onto point indices along
// the rendered path. Kept out of RouteMap.tsx so that file only exports the
// component (mixing exports there breaks Vite's fast-refresh boundary).
export function computeConfidenceIndexRange(startT: number, endT: number, pointCount: number) {
  const startIdx = Math.max(0, Math.floor(startT * (pointCount - 1)));
  const endIdx = Math.max(
    startIdx + 1,
    Math.min(pointCount - 1, Math.ceil(endT * (pointCount - 1))),
  );
  return { startIdx, endIdx };
}
