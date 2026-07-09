import type {
  GeoAddress,
  GeoBoundingBox,
  GeoPlace,
  GeoTravelMode,
} from "../../../domain/geo";
import type { NominatimResult } from "./nominatim-types";
import type { OverpassElement } from "./overpass-types";

/** Map Nominatim jsonv2 results into vendor-neutral places. */
export function mapNominatimResults(results: NominatimResult[]): GeoPlace[] {
  return results
    .map(mapNominatimResult)
    .filter((place): place is GeoPlace => place !== null);
}

export function mapNominatimResult(raw: NominatimResult): GeoPlace | null {
  const lat = Number(raw.lat);
  const lng = Number(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const osmType = raw.osm_type?.toLowerCase();
  const osmId = raw.osm_id != null ? String(raw.osm_id) : undefined;
  const id =
    osmType && osmId
      ? `${osmType}/${osmId}`
      : raw.place_id != null
        ? `nominatim:${raw.place_id}`
        : `coord:${lat},${lng}`;

  const category = raw.category ?? raw.class;
  const type = raw.type ?? raw.addresstype;
  const categories = [category, type].filter(
    (value): value is string => Boolean(value),
  );

  const name =
    raw.name?.trim() ||
    raw.namedetails?.name?.trim() ||
    firstAddressName(raw.address) ||
    raw.display_name.split(",")[0]?.trim() ||
    id;

  return {
    id,
    name,
    label: raw.display_name,
    lat,
    lng,
    categories,
    address: mapNominatimAddress(raw.address),
    boundingBox: mapBoundingBox(raw.boundingbox),
    phone: raw.extratags?.phone ?? raw.extratags?.["contact:phone"],
    website: raw.extratags?.website ?? raw.extratags?.["contact:website"],
    openingHours: raw.extratags?.opening_hours
      ? [raw.extratags.opening_hours]
      : undefined,
    extras: raw.extratags ? { ...raw.extratags } : undefined,
  };
}

export function mapOverpassElements(elements: OverpassElement[]): GeoPlace[] {
  return elements
    .map(mapOverpassElement)
    .filter((place): place is GeoPlace => place !== null);
}

export function mapOverpassElement(element: OverpassElement): GeoPlace | null {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (lat === undefined || lng === undefined) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const tags = element.tags ?? {};
  const name =
    tags.name?.trim() ||
    tags["name:en"]?.trim() ||
    tags.brand?.trim() ||
    tags.amenity?.trim() ||
    tags.tourism?.trim() ||
    tags.shop?.trim() ||
    `${element.type}/${element.id}`;

  const categories = [
    tags.amenity,
    tags.tourism,
    tags.shop,
    tags.leisure,
    tags.historic,
    tags.cuisine,
  ].filter((value): value is string => Boolean(value));

  const labelParts = [
    name,
    tags["addr:street"],
    tags["addr:city"] ?? tags["addr:town"],
    tags["addr:country"],
  ].filter(Boolean);

  return {
    id: `${element.type}/${element.id}`,
    name,
    label: labelParts.join(", "),
    lat,
    lng,
    categories,
    address: {
      houseNumber: tags["addr:housenumber"],
      road: tags["addr:street"],
      city: tags["addr:city"] ?? tags["addr:town"] ?? tags["addr:village"],
      postcode: tags["addr:postcode"],
      country: tags["addr:country"],
      countryCode: tags["addr:country"]?.length === 2
        ? tags["addr:country"].toLowerCase()
        : undefined,
    },
    phone: tags.phone ?? tags["contact:phone"],
    website: tags.website ?? tags["contact:website"],
    openingHours: tags.opening_hours ? [tags.opening_hours] : undefined,
    extras: Object.keys(tags).length > 0 ? { ...tags } : undefined,
  };
}

export function osmTravelProfile(mode: GeoTravelMode): string {
  switch (mode) {
    case "walking":
      return "foot";
    case "cycling":
      return "bike";
    case "transit":
      // Public OSRM demos do not offer transit; fall back to driving.
      return "driving";
    case "driving":
    default:
      return "driving";
  }
}

function mapNominatimAddress(
  address: NominatimResult["address"],
): GeoAddress | undefined {
  if (!address) return undefined;
  return {
    houseNumber: address.house_number,
    road: address.road,
    neighbourhood: address.neighbourhood,
    suburb: address.suburb,
    city:
      address.city ??
      address.town ??
      address.village ??
      address.municipality,
    county: address.county,
    state: address.state,
    postcode: address.postcode,
    country: address.country,
    countryCode: address.country_code,
  };
}

function mapBoundingBox(
  box: NominatimResult["boundingbox"],
): GeoBoundingBox | undefined {
  if (!box || box.length !== 4) return undefined;
  const south = Number(box[0]);
  const north = Number(box[1]);
  const west = Number(box[2]);
  const east = Number(box[3]);
  if (
    ![south, north, west, east].every((value) => Number.isFinite(value))
  ) {
    return undefined;
  }
  return { south, north, west, east };
}

function firstAddressName(
  address: NominatimResult["address"],
): string | undefined {
  if (!address) return undefined;
  return (
    address.attraction ??
    address.amenity ??
    address.tourism ??
    address.building ??
    address.road
  );
}
