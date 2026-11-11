import { NextRequest, NextResponse } from 'next/server';

export type GeocodeResult = {
  id: string;
  text: string;
  place_name: string;
  category_label?: string;
  category_type?: string;
  category_icon?: 'education' | 'health' | 'culture' | 'city' | 'country' | 'business' | 'nature' | 'public' | 'place';
  center: [number, number];
  source: 'openstreetmap' | 'photon' | 'mapbox';
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

  // 1. Universidades e Ensino Superior
  const isUniversity =
    typ === 'university' || typ === 'college' || edu === 'university' || edu === 'college' ||
    typ === 'faculty' || allText.includes('universidade') || allText.includes('faculdade') ||
    allText.includes('instituto federal') || allText.includes('campus universit') ||
    allText.includes('unirio') || allText.includes('ufrj') || allText.includes('usp') ||
    allText.includes('ufal') || allText.includes('unicamp') || allText.includes('ufmg') ||
    allText.includes('unesp') || allText.includes('cefet') || allText.includes('fatec') ||
    allText.includes('puc-') || allText.includes('puc ') ||
    (allText.includes('campus') && !allText.includes('posto'));
  if (isUniversity) return { label: 'Universidade / Ensino Superior', iconType: 'education' };

  // 2. Escolas e Educação Básica
  if (
    typ === 'school' || typ === 'kindergarten' || edu === 'school' || typ === 'research_institute' ||
    allText.includes('escola') || allText.includes('colégio') || allText.includes('colegio') || allText.includes('creche')
  ) return { label: 'Instituição de Ensino / Escola', iconType: 'education' };

  if (typ === 'library' || allText.includes('biblioteca')) return { label: 'Biblioteca', iconType: 'education' };

  // 3. Saúde
  if (
    typ === 'hospital' || typ === 'clinic' || typ === 'doctors' || typ === 'pharmacy' || typ === 'health_post' ||
    allText.includes('hospital') || allText.includes('pronto socorro') || allText.includes('maternidade') ||
    allText.includes('upa 24') || allText.includes('posto de saúde') || allText.includes('policlínica') || allText.includes('policlinica')
  ) return { label: 'Hospital / Unidade de Saúde', iconType: 'health' };

  // 4. Monumentos, Museus, Patrimônio e Pontos Turísticos (inclui landmarks mundiais)
  if (
    typ === 'museum' || cat === 'historic' || typ === 'monument' || typ === 'memorial' ||
    typ === 'archaeological_site' || typ === 'heritage' || typ === 'arts_centre' || typ === 'theatre' ||
    typ === 'tower' || typ === 'castle' || typ === 'ruins' || typ === 'fort' || typ === 'city_gate' ||
    typ === 'palace' || cat === 'tourism' || typ === 'attraction' || typ === 'viewpoint' || typ === 'theme_park' ||
    allText.includes('museu') || allText.includes('memorial') || allText.includes('teatro') ||
    allText.includes('centro cultural') || allText.includes('cristo redentor') || allText.includes('torre') ||
    allText.includes('castelo') || allText.includes('palácio') || allText.includes('palacio') ||
    allText.includes('monumento') || allText.includes('pirâmide') || allText.includes('piramide')
  ) {
    if (typ === 'monument' || typ === 'memorial' || typ === 'tower' || allText.includes('monumento') || allText.includes('torre'))
      return { label: 'Monumento / Ponto Histórico', iconType: 'culture' };
    if (typ === 'museum' || allText.includes('museu'))
      return { label: 'Museu / Patrimônio Cultural', iconType: 'culture' };
    if (typ === 'castle' || typ === 'palace' || typ === 'fort')
      return { label: 'Castelo / Palácio / Fortaleza', iconType: 'culture' };
    if (typ === 'attraction' || typ === 'viewpoint' || cat === 'tourism')
      return { label: 'Ponto Turístico / Atrativo', iconType: 'culture' };
    return { label: 'Espaço Cultural / Histórico', iconType: 'culture' };
  }

  // 5. Hotéis e Hospedagem
  if (typ === 'hotel' || typ === 'hostel' || typ === 'guest_house' || typ === 'motel' || allText.includes('hotel') || allText.includes('pousada') || allText.includes('resort'))
    return { label: 'Hotel / Hospedagem', iconType: 'business' };

  // 6. Divisões Territoriais
  if (addrType === 'country' || typ === 'country') return { label: 'País', iconType: 'country' };
  if (addrType === 'state' || addrType === 'province' || typ === 'state' || typ === 'province') return { label: 'Estado / Província', iconType: 'country' };
  if (addrType === 'city' || typ === 'city') return { label: 'Cidade', iconType: 'city' };
  if (addrType === 'municipality' || typ === 'municipality' || addrType === 'town' || typ === 'town') return { label: 'Município', iconType: 'city' };
  if (addrType === 'suburb' || addrType === 'neighbourhood' || addrType === 'quarter' || typ === 'suburb' || typ === 'neighbourhood') return { label: 'Bairro', iconType: 'place' };
  if (addrType === 'village' || addrType === 'hamlet' || typ === 'village' || typ === 'hamlet') return { label: 'Distrito / Povoado', iconType: 'place' };

  // 7. Órgãos Públicos
  if (
    typ === 'townhall' || typ === 'courthouse' || typ === 'police' || typ === 'post_office' ||
    typ === 'government' || typ === 'embassy' || typ === 'consulate' ||
    allText.includes('prefeitura') || allText.includes('câmara municipal') || allText.includes('tribunal') ||
    allText.includes('fórum') || allText.includes('forum') || allText.includes('delegacia') || allText.includes('ministério público')
  ) return { label: 'Órgão Público / Governamental', iconType: 'public' };

  // 8. Comércio e Empresas
  if (cat === 'office' || typ === 'company' || typ === 'commercial' || typ === 'bank' || typ === 'supermarket' || typ === 'mall' || typ === 'department_store' || allText.includes('empresa') || allText.includes('shopping') || allText.includes('banco ')) {
    if (typ === 'bank' || allText.includes('banco ')) return { label: 'Instituição Financeira', iconType: 'business' };
    if (typ === 'mall' || allText.includes('shopping')) return { label: 'Shopping / Centro Comercial', iconType: 'business' };
    return { label: 'Empresa / Comercial', iconType: 'business' };
  }
  if (typ === 'restaurant' || typ === 'cafe' || typ === 'bar' || typ === 'fast_food') return { label: 'Gastronomia / Restaurante', iconType: 'business' };

  // 9. Transporte
  if (typ === 'airport' || typ === 'aerodrome' || allText.includes('aeroporto')) return { label: 'Aeroporto', iconType: 'place' };
  if (typ === 'bus_station' || allText.includes('rodoviária') || allText.includes('terminal rodoviário')) return { label: 'Terminal Rodoviário', iconType: 'place' };
  if (typ === 'subway_entrance' || typ === 'subway' || allText.includes('estação de metrô')) return { label: 'Estação de Metrô', iconType: 'place' };
  if (typ === 'train_station' || (typ === 'station' && (cat === 'railway' || allText.includes('trem') || allText.includes('ferrovi')))) return { label: 'Estação Ferroviária', iconType: 'place' };
  if (typ === 'ferry_terminal' || allText.includes('barca') || allText.includes('balsa')) return { label: 'Terminal Hidroviário', iconType: 'place' };
  if (typ === 'bus_stop' || typ === 'platform' || (cat === 'highway' && typ === 'bus_stop')) return { label: 'Ponto de Ônibus', iconType: 'place' };
  if (typ === 'bicycle_rental') return { label: 'Estação Bike / Bicicletário', iconType: 'place' };

  // 10. Parques e Natureza
  if (cat === 'leisure' || typ === 'park' || typ === 'nature_reserve' || typ === 'garden' || typ === 'beach' || typ === 'forest')
    return { label: 'Parque / Área Natural', iconType: 'nature' };

  // 11. Logradouros
  if (addrType === 'road' || addrType === 'street' || cat === 'highway' || typ === 'house')
    return { label: 'Logradouro / Endereço', iconType: 'place' };

  // 12. Edificação
  if (cat === 'building') return { label: 'Edificação / Prédio', iconType: 'place' };

  return { label: 'Localidade', iconType: 'place' };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeout = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || 'pk.eyJ1Ijoiam9wcGkiLCJhIjoiY210c3VyODYzMDJ4bjJ6cTQ0aG51dHYwcSJ9.Oekl-_45YuUzHvIFg2o01A';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() || '';
  if (query.length < 2 || query.length > 200) {
    return NextResponse.json({ results: [] });
  }

  const qLower = query.toLowerCase();
  const isTransitSearch = ['ponto', 'onibus', 'ônibus', 'parada', 'estação', 'estacao', 'terminal', 'bike', 'bicicleta', 'metro', 'metrô', 'trem'].some(k => qLower.includes(k));

  const osmHeaders = {
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    'User-Agent': 'NUGEP-Maps/2.0 (geocoding; contato@nugep.ufal.br)',
  };

  // Busca simultânea em 3 fontes sem restrição de país (busca mundial)
  const nomParams = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '10',
    addressdetails: '1',
    extratags: '1',
    namedetails: '1',
    'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
  });

  const phoParams = new URLSearchParams({
    q: query,
    limit: '10',
    lang: 'pt',
  });

  const mapboxParams = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    limit: '8',
    language: 'pt',
    types: 'country,region,postcode,district,place,locality,neighborhood,address,poi',
  });

  const candidates: GeocodeResult[] = [];

  const [nomSettled, phoSettled, mapboxSettled] = await Promise.allSettled([
    fetchWithTimeout(`https://nominatim.openstreetmap.org/search?${nomParams}`, { headers: osmHeaders })
      .then(res => res.ok ? res.json() : [])
      .catch(() => []),
    fetchWithTimeout(`https://photon.komoot.io/api/?${phoParams}`, { headers: osmHeaders })
      .then(res => res.ok ? res.json() : {})
      .catch(() => ({})),
    fetchWithTimeout(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${mapboxParams}`,
      {}
    )
      .then(res => res.ok ? res.json() : {})
      .catch(() => ({})),
  ]);

  // 1. Resultados do Photon (excelente para POIs e nomes locais)
  if (phoSettled.status === 'fulfilled' && phoSettled.value?.features) {
    for (const [index, feature] of (phoSettled.value.features as any[]).entries()) {
      const props = feature.properties || {};
      const name = props.name || props.street || props.city;
      const coords = feature.geometry?.coordinates;
      if (!name || !Array.isArray(coords) || coords.length < 2) continue;

      const classification = classifyPlace({ category: props.osm_key, type: props.osm_value, name });
      const streetInfo = props.street && props.housenumber ? `${props.street}, ${props.housenumber}` : props.street;
      const contextParts = [
        streetInfo !== name ? streetInfo : null,
        props.district || props.suburb,
        props.city,
        props.state,
        props.country
      ].filter(Boolean);

      candidates.push({
        id: `photon_${props.osm_id || index}`,
        text: name,
        place_name: contextParts.join(', ') || name,
        category_label: classification.label,
        category_type: props.osm_value || props.osm_key,
        category_icon: classification.iconType,
        center: [Number(coords[0]), Number(coords[1])],
        source: 'photon',
      });
    }
  }

  // 2. Resultados do Nominatim (muito bom para endereços e divisões administrativas)
  if (nomSettled.status === 'fulfilled' && Array.isArray(nomSettled.value)) {
    for (const item of nomSettled.value) {
      const address = item.address || {};
      const name =
        item.name ||
        item.namedetails?.name ||
        address.amenity ||
        address.building ||
        address.tourism ||
        address.road ||
        item.display_name?.split(',')[0]?.trim();

      const lng = Number(item.lon);
      const lat = Number(item.lat);
      if (!name || !Number.isFinite(lng) || !Number.isFinite(lat)) continue;

      const classification = classifyPlace({
        category: item.category,
        type: item.type,
        addresstype: item.addresstype,
        extratags: item.extratags,
        name,
        display_name: item.display_name
      });

      const streetInfo = address.road && address.house_number ? `${address.road}, ${address.house_number}` : address.road;
      const contextParts = [
        streetInfo !== name ? streetInfo : null,
        address.suburb || address.neighbourhood,
        address.city || address.town || address.village || address.municipality,
        address.state,
        address.country
      ].filter(Boolean);

      candidates.push({
        id: `osm_${item.place_id}`,
        text: name,
        place_name: contextParts.join(', ') || item.display_name,
        category_label: classification.label,
        category_type: item.type || item.addresstype || item.category,
        category_icon: classification.iconType,
        center: [lng, lat],
        source: 'openstreetmap',
      });
    }
  }

  // 3. Resultados do Mapbox (excelente para landmarks globais e cobertura mundial)
  if (mapboxSettled.status === 'fulfilled' && mapboxSettled.value?.features) {
    for (const f of (mapboxSettled.value.features as any[])) {
      const name = f.text;
      const coords = f.center;
      if (!name || !Array.isArray(coords) || coords.length < 2) continue;

      const placeType = f.place_type?.[0] || '';
      const cat = (f.properties?.category || '').toLowerCase();
      let iconType: GeocodeResult['category_icon'] = 'place';
      let label = 'Localidade';

      if (placeType === 'country') { label = 'País'; iconType = 'country'; }
      else if (placeType === 'region') { label = 'Estado / Região'; iconType = 'country'; }
      else if (placeType === 'place' || placeType === 'locality') { label = 'Cidade / Município'; iconType = 'city'; }
      else if (placeType === 'neighborhood' || placeType === 'district') { label = 'Bairro'; iconType = 'place'; }
      else if (placeType === 'poi') {
        if (cat.includes('museum') || cat.includes('monument') || cat.includes('historic') || cat.includes('tourism') || cat.includes('landmark') || cat.includes('attraction')) {
          label = 'Ponto Turístico / Monumento'; iconType = 'culture';
        } else if (cat.includes('education') || cat.includes('university') || cat.includes('school')) {
          label = 'Instituição de Ensino'; iconType = 'education';
        } else if (cat.includes('hospital') || cat.includes('health')) {
          label = 'Hospital / Saúde'; iconType = 'health';
        } else if (cat.includes('park') || cat.includes('nature')) {
          label = 'Parque / Área Natural'; iconType = 'nature';
        } else {
          label = 'Ponto de Interesse'; iconType = 'business';
        }
      } else if (placeType === 'address') {
        label = 'Endereço'; iconType = 'place';
      }

      candidates.push({
        id: `mapbox_${f.id}`,
        text: name,
        place_name: f.place_name || name,
        category_label: label,
        category_type: placeType,
        category_icon: iconType,
        center: [Number(coords[0]), Number(coords[1])],
        source: 'mapbox',
      });
    }
  }

  // Filtro: remove infraestrutura menor quando há resultados relevantes
  function isMinorInfrastructure(type: string): boolean {
    const t = (type || '').toLowerCase();
    return t === 'bus_stop' || t === 'platform' || t === 'bicycle_rental' || t === 'bench' || t === 'waste_basket' || t === 'post_box';
  }

  let filtered = candidates;
  const hasMajorEntity = candidates.some(c => !isMinorInfrastructure(c.category_type || ''));
  if (!isTransitSearch && hasMajorEntity) {
    filtered = candidates.filter(c => !isMinorInfrastructure(c.category_type || ''));
  }

  // Deduplicação por proximidade geográfica (~150m) e nome/tipo similar
  const deduplicated: GeocodeResult[] = [];
  for (const item of filtered) {
    const isDupe = deduplicated.some(existing => {
      const dLng = Math.abs(item.center[0] - existing.center[0]);
      const dLat = Math.abs(item.center[1] - existing.center[1]);
      const isVeryClose = (dLng * dLng + dLat * dLat) < 0.0000015;
      const isSameName = item.text.toLowerCase().trim() === existing.text.toLowerCase().trim();
      return (isVeryClose && isSameName) || (isVeryClose && item.category_icon === existing.category_icon);
    });
    if (!isDupe) deduplicated.push(item);
  }

  // Ordenação por relevância: landmarks e monumentos têm prioridade
  function getRelevanceScore(item: GeocodeResult): number {
    const textLower = item.text.toLowerCase();
    let score = 0;
    if (textLower === qLower) score += 80;
    else if (textLower.startsWith(qLower)) score += 50;
    else if (textLower.includes(qLower)) score += 30;

    switch (item.category_icon) {
      case 'culture': score += 100; break;
      case 'education': score += 95; break;
      case 'health': score += 90; break;
      case 'city': score += 85; break;
      case 'country': score += 80; break;
      case 'public': score += 75; break;
      case 'business': score += 65; break;
      case 'nature': score += 60; break;
      default: score += 40; break;
    }

    if (item.source === 'photon') score += 5;
    else if (item.source === 'openstreetmap') score += 4;
    else if (item.source === 'mapbox') score += 3;

    return score;
  }

  deduplicated.sort((a, b) => getRelevanceScore(b) - getRelevanceScore(a));

  return NextResponse.json(
    { results: deduplicated.slice(0, 8) },
    { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } }
  );
}
