import type { GeoPoint } from "./types";

export function getCurrentPosition(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Location is not available in this browser"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) =>
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? "Location permission denied. Allow location access and try again."
              : "Could not get your location. Try again.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  });
}
