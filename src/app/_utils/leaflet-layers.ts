import * as L from 'leaflet';

/**
 * Add base layers + a Street/Satellite toggle to a Leaflet map.
 *
 * - Street: standard OpenStreetMap (roads, labels, building footprints).
 * - Satellite: Esri World Imagery (real rooftops/buildings) with a transparent
 *   street + place-label overlay so names stay readable.
 *
 * All sources are free and key-free, consistent with the rest of the app.
 * The control sits bottom-left to avoid the zoom (top-left) and the custom
 * fullscreen button (top-right).
 */
export function addBaseLayers(
  map: L.Map,
  defaultLayer: 'street' | 'satellite' = 'street',
): void {
  const street = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap' },
  );

  const imagery = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, attribution: 'Imagery © Esri' },
  );
  const placeLabels = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, attribution: '© Esri' },
  );
  const streetLabels = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, attribution: '© Esri' },
  );
  // Imagery + labels behave as one selectable "Satellite" option.
  const satellite = L.layerGroup([imagery, streetLabels, placeLabels]);

  (defaultLayer === 'satellite' ? satellite : street).addTo(map);

  L.control
    .layers(
      { Street: street, Satellite: satellite },
      {},
      { position: 'bottomleft', collapsed: true },
    )
    .addTo(map);
}
