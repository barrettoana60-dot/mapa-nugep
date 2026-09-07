import { NextRequest, NextResponse } from 'next/server';

type GeocodeResult = {
  id: string;
  text: string;
  place_name: string;
  center: [number, number];
  source: 'openstreetmap' | 'photon';
};

const BRAZIL_BIAS = { lat: -9.17, lng: -36.06 };

async function fetchWithTimeout(url: string, init: RequestInit, timeout = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() || '';
  if (query.length < 2 || query.length > 180) {
    return NextResponse.json({ results: [] });
  }

  const headers = {
    'Accept-Language': 'pt-BR,pt;q=0.9',
    // Nominatim exige um identificador de cliente em requisições de servidor.
    'User-Agent': 'NUGEP-Maps/1.0 (geocoding)',
  };

  try {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '6',
      addressdetails: '1',
      countrycodes: 'br',
      'accept-language': 'pt-BR',
      viewbox: `${BRAZIL_BIAS.lng - 15},${BRAZIL_BIAS.lat + 10},${BRAZIL_BIAS.lng + 15},${BRAZIL_BIAS.lat - 10}`,
      bounded: '0',
    });
    const response = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?${params}`, { headers });
    const data = response.ok ? await response.json() : [];

    if (Array.isArray(data) && data.length) {
      const results: GeocodeResult[] = data
        .map((item: any) => {
          const address = item.address || {};
          const name = address.road || address.amenity || address.building || address.tourism || item.name || item.display_name?.split(',')[0];
          const context = [address.suburb || address.neighbourhood, address.city || address.town || address.village || address.municipality, address.state]
            .filter(Boolean)
            .join(', ');
          const lng = Number(item.lon);
          const lat = Number(item.lat);
          if (!name || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
          return {
            id: `osm_${item.place_id}`,
            text: name,
            place_name: context ? `${name} — ${context}` : item.display_name,
            center: [lng, lat] as [number, number],
            source: 'openstreetmap' as const,
          };
        })
        .filter(Boolean) as GeocodeResult[];
      if (results.length) {
        return NextResponse.json({ results }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
      }
    }
  } catch {
    // O Photon abaixo é o fallback para indisponibilidade temporária do Nominatim.
  }

  try {
    const params = new URLSearchParams({ q: query, limit: '6', lang: 'pt', lat: String(BRAZIL_BIAS.lat), lon: String(BRAZIL_BIAS.lng) });
    const response = await fetchWithTimeout(`https://photon.komoot.io/api/?${params}`, { headers });
    const data = response.ok ? await response.json() : {};
    const results: GeocodeResult[] = (data.features || []).map((feature: any, index: number) => {
      const props = feature.properties || {};
      const name = props.name || props.street || props.city || 'Localidade';
      const context = [props.street && props.housenumber ? `${props.street}, ${props.housenumber}` : '', props.district || props.city, props.state]
        .filter(Boolean)
        .join(', ');
      return {
        id: `photon_${props.osm_id || index}`,
        text: name,
        place_name: context ? `${name} — ${context}` : name,
        center: feature.geometry.coordinates as [number, number],
        source: 'photon' as const,
      };
    });
    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'public, s-maxage=900' } });
  } catch {
    return NextResponse.json({ results: [] }, { status: 200 });
  }
}
