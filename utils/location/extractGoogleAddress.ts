/**
 * utils/location/extractGoogleAddress.ts
 * ────────────────────────────────────────
 * Extracts structured address components from a Google Places API response.
 * Used ONLY for the interactive UI autocomplete — never for CSV imports.
 */

export interface GoogleAddressComponents {
  locality: string        // sublocality or locality (most specific)
  city: string            // city / district
  state: string           // state / province
  postalCode: string
  country: string
  formattedAddress: string
  placeId: string
  latitude: number | null
  longitude: number | null
}

type AddressComponent = {
  long_name: string
  short_name: string
  types: string[]
}

function getComponent(
  components: AddressComponent[],
  ...types: string[]
): string {
  for (const type of types) {
    const match = components.find(c => c.types.includes(type))
    if (match) return match.long_name
  }
  return ''
}

/**
 * Extract the most specific locality name from Google address components.
 * Fallback hierarchy: sublocality_level_1 → sublocality → locality → admin_area_2
 */
export function extractLocality(components: AddressComponent[]): string {
  return getComponent(
    components,
    'sublocality_level_1',
    'sublocality',
    'locality',
    'administrative_area_level_2'
  )
}

export function extractCity(components: AddressComponent[]): string {
  return getComponent(
    components,
    'locality',
    'administrative_area_level_2',
    'administrative_area_level_1'
  )
}

export function extractState(components: AddressComponent[]): string {
  return getComponent(components, 'administrative_area_level_1')
}

export function extractPostalCode(components: AddressComponent[]): string {
  return getComponent(components, 'postal_code')
}

export function extractCountry(components: AddressComponent[]): string {
  return getComponent(components, 'country')
}

/**
 * Parse a full Google Places detail response into a structured object.
 */
export function extractGoogleAddress(
  place: google.maps.places.PlaceResult
): GoogleAddressComponents {
  const components = (place.address_components ?? []) as AddressComponent[]

  return {
    locality:         extractLocality(components),
    city:             extractCity(components),
    state:            extractState(components),
    postalCode:       extractPostalCode(components),
    country:          extractCountry(components),
    formattedAddress: place.formatted_address ?? '',
    placeId:          place.place_id ?? '',
    latitude:         place.geometry?.location?.lat() ?? null,
    longitude:        place.geometry?.location?.lng() ?? null,
  }
}
