// FME/GIS integratie-placeholder
// Vervang deze functie later door een request naar FME Flow / een interne API.
// Verwachte output: { context: { gis_rup_bpa, gis_heritage, gis_water, gis_vulnerable, zone, ... } }
export async function fetchParcelContext(address) {
  console.info('FME placeholder - adres ontvangen:', address);
  // TODO: koppel aan FME endpoint, bv.:
  // const response = await fetch(`/api/fme/perceelcontext?address=${encodeURIComponent(address)}`);
  // return await response.json();
  return { source: 'dummy', context: null };
}
