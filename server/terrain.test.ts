import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OpenMeteoTerrainProvider,
  TerrainUnavailableError,
  getTerrainProvider,
  resetTerrainProviderForTests,
  setTerrainProvider,
  type LatLng,
} from "./terrain";

function points(n: number): LatLng[] {
  return Array.from({ length: n }, (_, i) => ({ lat: 40 + i * 0.001, lng: -3 - i * 0.001 }));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function coordCount(url: string): number {
  return new URL(url).searchParams.get("latitude")!.split(",").length;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetTerrainProviderForTests();
});

describe("OpenMeteoTerrainProvider", () => {
  it("batches 250 points into 100/100/50 and concatenates in order", async () => {
    let counter = 0;
    const fetchMock = vi.fn(async (url: string) => {
      const n = coordCount(url);
      return jsonResponse({ elevation: Array.from({ length: n }, () => counter++) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenMeteoTerrainProvider().elevations(points(250));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([u]) => coordCount(u))).toEqual([100, 100, 50]);
    expect(result).toEqual(Array.from({ length: 250 }, (_, i) => i));
  });

  it("rounds coordinates to 5 decimals and honours the base URL override", async () => {
    vi.stubEnv("OPEN_METEO_ELEVATION_URL", "http://localhost:9999/elev");
    const fetchMock = vi.fn(async () => jsonResponse({ elevation: [12] }));
    vi.stubGlobal("fetch", fetchMock);

    await new OpenMeteoTerrainProvider().elevations([{ lat: 40.123456789, lng: -3.987654321 }]);

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe("http://localhost:9999/elev?latitude=40.12346&longitude=-3.98765");
  });

  it("returns [] for empty input without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await new OpenMeteoTerrainProvider().elevations([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries once on a 500 and then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ elevation: [5, 6] }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await new OpenMeteoTerrainProvider().elevations(points(2))).toEqual([5, 6]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries once on a network error and gives up after the second failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("boom"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new OpenMeteoTerrainProvider().elevations(points(1))).rejects.toBeInstanceOf(
      TerrainUnavailableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry on a 400", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: true }, 400));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new OpenMeteoTerrainProvider().elevations(points(1))).rejects.toBeInstanceOf(
      TerrainUnavailableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on a length mismatch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ elevation: [1] })),
    );
    await expect(new OpenMeteoTerrainProvider().elevations(points(2))).rejects.toThrow(
      TerrainUnavailableError,
    );
  });

  it("throws on a non-finite value", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ elevation: [1, null] })),
    );
    await expect(new OpenMeteoTerrainProvider().elevations(points(2))).rejects.toThrow(
      TerrainUnavailableError,
    );
  });

  it.each([
    { lat: NaN, lng: 0 },
    { lat: 0, lng: Infinity },
    { lat: 91, lng: 0 },
    { lat: 0, lng: -181 },
  ])("rejects invalid coordinate %j without calling fetch", async (bad) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(new OpenMeteoTerrainProvider().elevations([...points(1), bad])).rejects.toThrow(
      TerrainUnavailableError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getTerrainProvider", () => {
  it("is null when unset, empty or none", () => {
    vi.stubEnv("TERRAIN_PROVIDER", "");
    expect(getTerrainProvider()).toBeNull();
    resetTerrainProviderForTests();
    vi.stubEnv("TERRAIN_PROVIDER", "none");
    expect(getTerrainProvider()).toBeNull();
    resetTerrainProviderForTests();
    vi.unstubAllEnvs();
    delete process.env.TERRAIN_PROVIDER;
    expect(getTerrainProvider()).toBeNull();
  });

  it("returns a cached open-meteo provider", () => {
    vi.stubEnv("TERRAIN_PROVIDER", "open-meteo");
    const p = getTerrainProvider();
    expect(p?.name).toBe("open-meteo");
    expect(getTerrainProvider()).toBe(p);
  });

  it("warns once and returns null for unknown values", () => {
    vi.stubEnv("TERRAIN_PROVIDER", "mapbox");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getTerrainProvider()).toBeNull();
    expect(getTerrainProvider()).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("setTerrainProvider overrides the env, including with null", () => {
    vi.stubEnv("TERRAIN_PROVIDER", "open-meteo");
    const fake = { name: "fake", elevations: async () => [] };
    setTerrainProvider(fake);
    expect(getTerrainProvider()).toBe(fake);
    setTerrainProvider(null);
    expect(getTerrainProvider()).toBeNull();
  });
});

describe("terrainSampleLimit", () => {
  it("defaults to 500 and clamps configured values", async () => {
    const { terrainSampleLimit } = await import("./terrain.js");
    expect(terrainSampleLimit({})).toBe(500);
    expect(terrainSampleLimit({ TERRAIN_MAX_SAMPLES: "120" })).toBe(120);
    expect(terrainSampleLimit({ TERRAIN_MAX_SAMPLES: "5" })).toBe(20);
    expect(terrainSampleLimit({ TERRAIN_MAX_SAMPLES: "99999" })).toBe(2000);
    expect(terrainSampleLimit({ TERRAIN_MAX_SAMPLES: "abc" })).toBe(500);
  });
});
