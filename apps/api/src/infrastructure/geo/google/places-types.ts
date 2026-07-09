/** Google Places API (New) response shapes used by the Google geo provider. */

export interface GoogleLocalizedText {
  text?: string;
  languageCode?: string;
}

export interface GoogleLatLng {
  latitude?: number;
  longitude?: number;
}

export interface GooglePlace {
  id?: string;
  name?: string;
  displayName?: GoogleLocalizedText;
  formattedAddress?: string;
  location?: GoogleLatLng;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
  };
  reviews?: GoogleReview[];
}

export interface GoogleReview {
  name?: string;
  relativePublishTimeDescription?: string;
  rating?: number;
  text?: GoogleLocalizedText;
  originalText?: GoogleLocalizedText;
  authorAttribution?: {
    displayName?: string;
    uri?: string;
    photoUri?: string;
  };
  publishTime?: string;
  flagContentUri?: string;
  googleMapsUri?: string;
}

export interface GooglePlacesSearchResponse {
  places?: GooglePlace[];
}
