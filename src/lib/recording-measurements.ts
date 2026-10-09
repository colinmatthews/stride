export interface GpsPoint {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  timestamp: number;
}

export interface GpsAccumulator {
  previous: GpsPoint | null;
  distanceMeters: number;
  elevationGainM: number | null;
}

export function toGpsPoint(position: GeolocationPosition): GpsPoint {
  const { latitude, longitude, accuracy, altitude, altitudeAccuracy } = position.coords;
  return {
    latitude,
    longitude,
    accuracy,
    altitude,
    altitudeAccuracy,
    timestamp: position.timestamp,
  };
}

export function distanceBetweenMeters(a: GpsPoint, b: GpsPoint) {
  const radians = Math.PI / 180;
  const latitudeDelta = (b.latitude - a.latitude) * radians;
  const longitudeDelta = (b.longitude - a.longitude) * radians;
  const h =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(a.latitude * radians) *
      Math.cos(b.latitude * radians) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function addGpsPoint(state: GpsAccumulator, point: GpsPoint): GpsAccumulator {
  if (!Number.isFinite(point.accuracy) || point.accuracy > 50 || point.accuracy < 0) return state;
  const previous = state.previous;
  if (!previous) return { ...state, previous: point };
  const deltaSeconds = (point.timestamp - previous.timestamp) / 1000;
  if (deltaSeconds <= 0) return state;
  const distance = distanceBetweenMeters(previous, point);
  const threshold = Math.max(5, Math.min(20, Math.max(previous.accuracy, point.accuracy) / 2));
  if (distance / deltaSeconds > 25) return state;
  if (distance < threshold) return state;
  const validAltitude =
    point.altitude !== null &&
    previous.altitude !== null &&
    point.altitudeAccuracy !== null &&
    previous.altitudeAccuracy !== null &&
    point.altitudeAccuracy <= 15 &&
    previous.altitudeAccuracy <= 15;
  const climb = validAltitude ? Math.max(0, point.altitude! - previous.altitude! - 3) : 0;
  return {
    previous: point,
    distanceMeters: state.distanceMeters + distance,
    elevationGainM: validAltitude ? (state.elevationGainM ?? 0) + climb : state.elevationGainM,
  };
}
