const EARTH_RADIUS_KM = 6371;

export function isValidLatitude(lat) {
  const n = Number(lat);
  return Number.isFinite(n) && n >= -90 && n <= 90;
}

export function isValidLongitude(lng) {
  const n = Number(lng);
  return Number.isFinite(n) && n >= -180 && n <= 180;
}

/**
 * Haversine distance in km between two WGS84 points.
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  if (
    !isValidLatitude(lat1) ||
    !isValidLongitude(lng1) ||
    !isValidLatitude(lat2) ||
    !isValidLongitude(lng2)
  ) {
    return NaN;
  }

  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export function roundKm(km) {
  return Math.round(km * 1000) / 1000;
}
