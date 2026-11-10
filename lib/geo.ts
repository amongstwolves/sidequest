const EARTH_RADIUS_METERS = 6_371_000;

/** Great-circle distance in meters (haversine). Fine for ~10 seeded operators; PostGIS is post-hackathon. */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function formatDistance(meters: number): string {
  const miles = meters / 1609.344;
  return miles < 0.1 ? "< 0.1 mi" : `${miles.toFixed(1)} mi`;
}
