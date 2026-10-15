import type { Sport } from "./mock-data";

export type GpsSample = {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  timestamp: number;
};

export type GpsTrack = {
  distanceM: number;
  elevationGainM: number;
  lastSample: GpsSample | null;
  altitudeAnchorM: number | null;
  points: number;
  altitudePoints: number;
};

export const emptyGpsTrack: GpsTrack = {
  distanceM: 0,
  elevationGainM: 0,
  lastSample: null,
  altitudeAnchorM: null,
  points: 0,
  altitudePoints: 0,
};

export function resetTrackingBaseline(track: GpsTrack): GpsTrack {
  return { ...track, lastSample: null, altitudeAnchorM: null };
}

function distanceBetweenMeters(a: GpsSample, b: GpsSample) {
  const radians = Math.PI / 180;
  const latitudeDelta = (b.latitude - a.latitude) * radians;
  const longitudeDelta = (b.longitude - a.longitude) * radians;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(a.latitude * radians) *
      Math.cos(b.latitude * radians) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6371000 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function usableAltitude(sample: GpsSample) {
  return sample.altitude !== null &&
    Number.isFinite(sample.altitude) &&
    (sample.altitudeAccuracy === null || sample.altitudeAccuracy <= 25)
    ? sample.altitude
    : null;
}

export function addGpsSample(track: GpsTrack, sample: GpsSample, sport: Sport): GpsTrack {
  if (
    !Number.isFinite(sample.latitude) ||
    !Number.isFinite(sample.longitude) ||
    !Number.isFinite(sample.accuracy) ||
    sample.accuracy < 0 ||
    sample.accuracy > 50 ||
    !Number.isFinite(sample.timestamp)
  ) {
    return track;
  }

  const altitude = usableAltitude(sample);
  if (!track.lastSample) {
    return {
      ...track,
      lastSample: sample,
      altitudeAnchorM: altitude,
      points: track.points + 1,
      altitudePoints: track.altitudePoints + Number(altitude !== null),
    };
  }

  const seconds = (sample.timestamp - track.lastSample.timestamp) / 1000;
  if (seconds <= 0) return track;

  const segmentM = distanceBetweenMeters(track.lastSample, sample);
  const noiseFloorM = Math.max(4, sample.accuracy / 2, track.lastSample.accuracy / 2);
  const maximumSpeedMps = sport === "Ride" ? 35 : 15;
  if (segmentM < noiseFloorM || segmentM / seconds > maximumSpeedMps) return track;

  let elevationGainM = track.elevationGainM;
  let altitudeAnchorM = track.altitudeAnchorM;
  if (altitude === null) {
    altitudeAnchorM = null;
  } else if (altitudeAnchorM === null) {
    altitudeAnchorM = altitude;
  } else {
    const changeM = altitude - altitudeAnchorM;
    const altitudeNoiseM = Math.max(4, (sample.altitudeAccuracy ?? 8) / 2);
    if (Math.abs(changeM) >= altitudeNoiseM) {
      if (changeM > 0) elevationGainM += changeM;
      altitudeAnchorM = altitude;
    }
  }

  return {
    distanceM: track.distanceM + segmentM,
    elevationGainM,
    lastSample: sample,
    altitudeAnchorM,
    points: track.points + 1,
    altitudePoints: track.altitudePoints + Number(altitude !== null),
  };
}
