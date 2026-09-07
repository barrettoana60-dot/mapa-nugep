import { NextRequest, NextResponse } from 'next/server';

export type GeocodeResult = {
  id: string;
  text: string;
  place_name: string;
  category_label?: string;
  category_type?: string;
  category_icon?: 'education' | 'health' | 'culture' | 'city' | 'country' | 'business' | 'nature' | 'public' | 'place';
  center: [number, number];
  source: 'openstreetmap' | 'photon';
};

// Classificador inteligente de locais, instituições, empresas e divisões territoriais
function classifyPlace(item: {
  category?: string;
  type?: string;
  addresstype?: string;
  extratags?: Record<string, string>;
  name?: string;
  display_name?: string;
}): { label: string; iconType: 'education' | 'health' | 'culture' | 'city' | 'country' | 'business' | 'nature' | 'public' | 'place' } {
  const cat = (item.category || '').toLowerCase();
  const typ = (item.type || '').toLowerCase();
  const addrType = (item.addresstype || '').toLowerCase();
  const edu = (item.extratags?.education || '').toLowerCase();
  const allText = `${item.name || ''} ${item.display_name || ''}`.toLowerCase();

  // 1. Instituições de Ensino Superior e Pesquisa (Universidades, Faculdades)
  if (
    typ === 'university' ||
    typ === 'college' ||
    edu === 'university' ||
    edu === 'college' ||
    typ === 'faculty' ||
    allText.includes('universidade') ||
    allText.includes('faculdade') ||
    allText.includes('instituto federal') ||
    allText.includes('campus universit')
  ) {
    return { label: 'Universidade / Ensino Superior', iconType: 'education' };
  }

  // 2. Escolas e Educação Básica / Técnica
  if (
    typ === 'school' ||
    typ === 'kindergarten' ||
    edu === 'school' ||
    typ === 'research_institute' ||
    allText.includes('escola') ||
    allText.includes('colégio')
  ) {
    return { label: 'Instituição de Ensino / Pesquisa', iconType: 'education' };
  }

  if (typ === 'library' || allText.includes('biblioteca')) {
    return { label: 'Biblioteca', iconType: 'education' };
  }

  // 3. Saúde, Hospitais e Clínicas
  if (
    typ === 'hospital' ||
    typ === 'clinic' ||
    typ === 'doctors' ||
    typ === 'pharmacy' ||
    typ === 'health_post' ||
    allText.includes('hospital') ||
    allText.includes('pronto socorro') ||
    allText.includes('maternidade')
  ) {
    return { label: 'Hospital / Unidade de Saúde', iconType: 'health' };
  }

  // 4. Museus, Centros Culturais e Patrimônio Histórico
  if (
    typ === 'museum' ||
    cat === 'historic' ||
    typ === 'monument' ||
    typ === 'memorial' ||
    typ === 'archaeological_site' ||
    typ === 'heritage' ||
    typ === 'arts_centre' ||
    typ === 'theatre' ||
    allText.includes('museu') ||
    allText.includes('memorial') ||
    allText.includes('teatro')
  ) {
    if (typ === 'museum' || allText.includes('museu')) return { label: 'Museu / Patrimônio Cultural', iconType: 'culture' };
    if (typ === 'monument' || typ === 'memorial' || allText.includes('monumento')) return { label: 'Monumento Histórico', iconType: 'culture' };
    return { label: 'Espaço Cultural / Histórico', iconType: 'culture' };
  }

  // 5. Pontos Turísticos e Hospedagem
  if (cat === 'tourism' || typ === 'attraction' || typ === 'viewpoint' || typ === 'theme_park') {
    return { label: 'Ponto Turístico / Atrativo', iconType: 'culture' };
  }
  if (typ === 'hotel' || typ === 'hostel' || typ === 'guest_house' || allText.includes('hotel') || allText.includes('pousada')) {
    return { label: 'Hotel / Hospedagem', iconType: 'business' };
  }

  // 6. Cidades, Países e Divisões Territoriais
  if (addrType === 'country' || typ === 'country') {
    return { label: 'País', iconType: 'country' };
  }
  if (addrType === 'state' || addrType === 'province' || typ === 'state' || typ === 'province') {
    return { label: 'Estado / Província', iconType: 'country' };
  }
  if (addrType === 'city' || typ === 'city') {
    return { label: 'Cidade', iconType: 'city' };
  }
  if (addrType === 'municipality' || typ === 'municipality' || addrType === 'town' || typ === 'town') {
    return { label: 'Município', iconType: 'city' };
  }
  if (addrType === 'suburb' || addrType === 'neighbourhood' || addrType === 'quarter' || typ === 'suburb' || typ === 'neighbourhood') {
    return { label: 'Bairro', iconType: 'place' };
  }
  if (addrType === 'village' || addrType === 'hamlet' || typ === 'village' || typ === 'hamlet') {
    return { label: 'Distrito / Povoado', iconType: 'place' };
  }

  // 7. Órgãos Públicos e Governamentais
  if (
    typ === 'townhall' ||
    typ === 'courthouse' ||
    typ === 'police' ||
    typ === 'post_office' ||
    typ === 'government' ||
    typ === 'embassy' ||
    typ === 'consulate' ||
    allText.includes('prefeitura') ||
    allText.includes('câmara municipal') ||
    allText.includes('fórum')
  ) {
    return { label: 'Órgão Público / Governamental', iconType: 'public' };
  }

  // 8. Empresas, Comércio e Centros Financeiros
  if (
    cat === 'office' ||
    typ === 'company' ||
    typ === 'commercial' ||
    typ === 'bank' ||
    typ === 'supermarket' ||
    typ === 'mall' ||
    allText.includes('empresa') ||
    allText.includes('shopping')
  ) {
    if (typ === 'bank' || allText.includes('banco')) return { label: 'Instituição Financeira', iconType: 'business' };
    if (typ === 'mall' || allText.includes('shopping')) return { label: 'Shopping / Centro Comercial', iconType: 'business' };
    return { label: 'Empresa / Comercial', iconType: 'business' };
  }
  if (typ === 'restaurant' || typ === 'cafe' || typ === 'bar') {
    return { label: 'Gastronomia / Restaurante', iconType: 'business' };
  }

  // 9. Transporte
  if (typ === 'airport' || typ === 'aerodrome' || allText.includes('aeroporto')) {
    return { label: 'Aeroporto', iconType: 'place' };
  }
  if (typ === 'station' || typ === 'subway_entrance' || typ === 'bus_station' || typ === 'bus_stop' || typ === 'ferry_terminal') {
    return { label: 'Terminal / Estação', iconType: 'place' };
  }

  // 10. Parques e Natureza
  if (cat === 'leisure' || typ === 'park' || typ === 'nature_reserve' || typ === 'garden' || typ === 'beach' || typ === 'forest') {
    return { label: 'Parque / Área Verde', iconType: 'nature' };
  }

  // 11. Logradouros e Endereços
  if (addrType === 'road' || addrType === 'street' || cat === 'highway') {
    return { label: 'Logradouro / Rua', iconType: 'place' };
  }

  // 12. Edificação
  if (cat === 'building') {
    return { label: 'Edificação / Prédio', iconType: 'place' };
  }

  return { label: 'Localidade', iconType: 'place' };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeout = 6000) {
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
  if (query.length < 2 || query.length > 200) {
    return NextResponse.json({ results: [] });
  }

  const headers = {
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    'User-Agent': 'NUGEP-Maps/2.0 (geocoding; contato@nugep.ufal.br)',
  };

  // 1. Consulta Nominatim (OpenStreetMap) global, com detalhes de endereço e extratags
  try {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '8',
      addressdetails: '1',
      extratags: '1',
      namedetails: '1',
      'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
    });
    const response = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?${params}`, { headers });
    const data = response.ok ? await response.json() : [];

    if (Array.isArray(data) && data.length) {
      const results: GeocodeResult[] = data
        .map((item: any) => {
          const address = item.address || {};
          const name = 
            item.name || 
            item.namedetails?.name || 
            address.amenity || 
            address.building || 
            address.tourism || 
            address.road || 
            item.display_name?.split(',')[0]?.trim();

          const classification = classifyPlace({
            category: item.category,
            type: item.type,
            addresstype: item.addresstype,
            extratags: item.extratags,
            name,
            display_name: item.display_name
          });

          // Monta o contexto de endereço sem repetir o nome
          const streetInfo = address.road && address.house_number ? `${address.road}, ${address.house_number}` : address.road;
          const contextParts = [
            streetInfo !== name ? streetInfo : null,
            address.suburb || address.neighbourhood,
            address.city || address.town || address.village || address.municipality,
            address.state,
            address.country
          ].filter(Boolean);

          const context = contextParts.join(', ') || item.display_name;
          const lng = Number(item.lon);
          const lat = Number(item.lat);
          if (!name || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;

          return {
            id: `osm_${item.place_id}`,
            text: name,
            place_name: context,
            category_label: classification.label,
            category_type: item.type || item.addresstype || item.category,
            category_icon: classification.iconType,
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
    // Continua para Photon se o Nominatim falhar
  }

  // 2. Fallback: Photon Geocoder (OpenStreetMap indexado pela Komoot)
  try {
    const params = new URLSearchParams({ q: query, limit: '8', lang: 'pt' });
    const response = await fetchWithTimeout(`https://photon.komoot.io/api/?${params}`, { headers });
    const data = response.ok ? await response.json() : {};

    const results: GeocodeResult[] = (data.features || []).map((feature: any, index: number) => {
      const props = feature.properties || {};
      const name = props.name || props.street || props.city || 'Localidade';
      const classification = classifyPlace({
        category: props.osm_key,
        type: props.osm_value,
        name,
      });

      const streetInfo = props.street && props.housenumber ? `${props.street}, ${props.housenumber}` : props.street;
      const context = [
        streetInfo !== name ? streetInfo : null,
        props.district || props.suburb,
        props.city,
        props.state,
        props.country
      ].filter(Boolean).join(', ') || name;

      return {
        id: `photon_${props.osm_id || index}`,
        text: name,
        place_name: context,
        category_label: classification.label,
        category_type: props.osm_value || props.osm_key,
        category_icon: classification.iconType,
        center: feature.geometry.coordinates as [number, number],
        source: 'photon' as const,
      };
    });

    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'public, s-maxage=1800' } });
  } catch {
    return NextResponse.json({ results: [] }, { status: 200 });
  }
}
