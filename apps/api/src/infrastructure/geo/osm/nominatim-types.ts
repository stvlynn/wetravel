/** Nominatim jsonv2 search / reverse / lookup response shapes. */

export interface NominatimAddress {
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
  [key: string]: string | undefined;
}

export interface NominatimResult {
  place_id?: number | string;
  osm_type?: string;
  osm_id?: number | string;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  category?: string;
  class?: string;
  type?: string;
  addresstype?: string;
  boundingbox?: [string, string, string, string];
  address?: NominatimAddress;
  extratags?: Record<string, string>;
  namedetails?: Record<string, string>;
}
