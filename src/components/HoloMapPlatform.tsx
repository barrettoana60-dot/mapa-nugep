'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Map, { Source, Layer, Marker, NavigationControl, MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import Papa from 'papaparse';
import { 
  Search, Layers, Settings, Info, Upload, X, Check, Download, 
  Trash2, Mountain, Ruler, MapPin, Compass, Eye, EyeOff, 
  FileSpreadsheet, Edit3, Save, Sun, Moon, 
  RotateCcw, Hexagon, Globe, Building2, CloudSun,
  CheckCircle2, AlertCircle, FileText, MousePointer, Landmark,
  Printer, ShieldCheck, Undo2, ChevronRight, LocateFixed, Wrench,
  GraduationCap
} from 'lucide-react';
import { NUGEP_LOGO } from '../assets/logo';

// Paleta de Cores Oficial do Logotipo NUGEP
export const NUGEP_PALETTE = {
  blue: '#0F3E8C',        // Azul Clássico Greco-Romano
  blueLight: '#1E4DB7',   // Azul Destaque
  gold: '#F4B205',        // Ouro Solar / Âmbar
  goldLight: '#FBBF24',   // Ouro Claro
  orange: '#F57602',      // Cerâmica / Barro Terracota
  red: '#CB0F32',         // Carmim Terracota
  green: '#0E8953',       // Verde Botânico
  cream: '#F8E3BB'        // Papiro / Contorno
};

export const NUGEP_COLOR_PRESETS = [
  { name: 'Terracota Oficial', hex: '#F57602' },
  { name: 'Ouro Solar', hex: '#F4B205' },
  { name: 'Azul Clássico', hex: '#0F3E8C' },
  { name: 'Verde Botânico', hex: '#0E8953' },
  { name: 'Carmim Terracota', hex: '#CB0F32' },
];

// Tipagem dos Pontos Georreferenciados
export type ObjetoCultural = {
  id: string;
  autor: string;
  titulo: string;
  ano: string;
  objeto: string;
  latitude: number;
  longitude: number;
  altura: number;
  datasetName?: string;
  anotacoes?: string;
  extraProps?: Record<string, any>;
};

// Tipagem dos Territórios Demarcados
export type DemarcatedTerritory = {
  id: string;
  nome: string;
  descricao?: string;
  cor: string;
  pontos: [number, number][]; // [lng, lat]
  areaM2: number;
  areaHectares: number;
  areaKm2: number;
  perimetroKm: number;
  criadoEm: string;
  visivel: boolean;
};

// Tipagem de Planilha
type ParsedSpreadsheet = {
  fileName: string;
  headers: string[];
  rows: Record<string, any>[];
};

type CoordinateReference = 'geographic' | 'utm';

type ImportedCoordinate = {
  lng: number;
  lat: number;
  row: Record<string, any>;
  index: number;
};

// Token Mapbox
const tk1 = 'pk.eyJ1Ijoiam9wcGkiLCJhIjoiY21w';
const tk2 = 'OTN4MWFwMGo3bzJ1cG9xbnd2azk5ei';
const tk3 = 'J9.w2MglW4vvG2zJh8wV7QxzQ';
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || (tk1 + tk2 + tk3);

// Cálculo de distância geodésica (Haversine em km)
function calculateDistance(points: number[][]): number {
  if (points.length < 2) return 0;
  let dist = 0;
  const R = 6371; 
  for (let i = 0; i < points.length - 1; i++) {
     const [lon1, lat1] = points[i];
     const [lon2, lat2] = points[i+1];
     const dLat = (lat2 - lat1) * Math.PI / 180;
     const dLon = (lon2 - lon1) * Math.PI / 180;
     const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLon/2) * Math.sin(dLon/2);
     const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
     dist += R * c;
  }
  return dist;
}

// Cálculo de perímetro em km
function calculatePerimeter(points: [number, number][]): number {
  if (points.length < 2) return 0;
  const closed = [...points, points[0]];
  return calculateDistance(closed);
}

// Cálculo de área esférica (Shoelace geodésico em m²)
function calculatePolygonArea(coords: [number, number][]): number {
  if (coords.length < 3) return 0;
  const radius = 6378137; // raio da Terra em metros
  let area = 0;
  const len = coords.length;
  for (let i = 0; i < len; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % len];
    area += ((p2[0] - p1[0]) * Math.PI / 180) * (2 + Math.sin(p1[1] * Math.PI / 180) + Math.sin(p2[1] * Math.PI / 180));
  }
  area = Math.abs(area * radius * radius / 2);
  return area;
}

// Conversor de coordenada numérica
function parseCoord(val: any): number {
  if (val === null || val === undefined) return NaN;
  if (typeof val === 'number') return isNaN(val) ? NaN : val;
  let str = String(val)
    .trim()
    .replace(/\u00a0/g, ' ')    // non-breaking space
    .replace(/^\uFEFF/, '')      // BOM
    .replace(/\u2212/g, '-');   // unicode minus → ASCII minus

  // Remove texto de prefixo ("Lat:", "Long:", "Coord:", etc.)
  str = str.replace(/^[a-zA-Z\u00C0-\u024F .:()\-_]+:/i, '').trim();

  // Parênteses negativos ex: (9.17)S ou (9.17) → negativo
  const parenNeg = str.match(/^\(([0-9.,]+)\)\s*([SsWwOo])?$/);
  if (parenNeg) {
    const num = parseFloat(parenNeg[1].replace(',', '.'));
    return isNaN(num) ? NaN : -Math.abs(num);
  }

  // Formato DMS: 9°10'30"S ou 9° 10' 30.5" S ou 9 10 30 S
  const dms = str.match(
    /^(-?\d{1,3})[°º\s]+(\d{1,2})['\u2032\s]+([0-9.]+)["\u2033\s]*([NSEWSOosweEW]?)$/i
  );
  if (dms) {
    const deg = parseFloat(dms[1]);
    const min = parseFloat(dms[2]);
    const sec = parseFloat(dms[3]);
    const hem = dms[4].toUpperCase();
    let dd = Math.abs(deg) + min / 60 + sec / 3600;
    if (hem === 'S' || hem === 'O' || hem === 'W') dd = -dd;
    else if (deg < 0) dd = -dd;
    return dd;
  }

  // Formato DM: 9°10.5'S
  const dm = str.match(/^(-?\d{1,3})[°º\s]+([0-9.]+)['\u2032\s]*([NSEWSOosweEW]?)$/i);
  if (dm) {
    const deg = parseFloat(dm[1]);
    const min = parseFloat(dm[2].replace(',', '.'));
    const hem = dm[3].toUpperCase();
    let dd = Math.abs(deg) + min / 60;
    if (hem === 'S' || hem === 'O' || hem === 'W') dd = -dd;
    else if (deg < 0) dd = -dd;
    return dd;
  }

  // Hemisfério no final: "9.17S" ou "9S" → negativo
  const hemSuffix = str.match(/^(-?[0-9]+(?:[.,][0-9]+)?)\s*([NSEWSOosweEW])$/i);
  if (hemSuffix) {
    const num = parseFloat(hemSuffix[1].replace(',', '.'));
    const hem = hemSuffix[2].toUpperCase();
    if (isNaN(num)) return NaN;
    return (hem === 'S' || hem === 'O' || hem === 'W') ? -Math.abs(num) : Math.abs(num);
  }

  // Decimal normal — substitui vírgula por ponto e extrai o número
  const cleaned = str.replace(',', '.').replace(/[^0-9.\-+]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? NaN : parsed;
}

// Converte UTM (SIRGAS 2000 / WGS84) para latitude/longitude decimal.
// Em Alagoas, por exemplo, use a zona 24 e hemisfério Sul.
function utmToWgs84(easting: number, northing: number, zone: number, hemisphere: 'N' | 'S'): [number, number] | null {
  if (!Number.isFinite(easting) || !Number.isFinite(northing) || !Number.isInteger(zone) || zone < 1 || zone > 60 ||
      easting < 100000 || easting > 900000 || northing < 0 || northing > 10000000) return null;

  const a = 6378137;
  const eccSquared = 0.00669438;
  const k0 = 0.9996;
  const eccPrimeSquared = eccSquared / (1 - eccSquared);
  const x = easting - 500000;
  let y = northing;
  if (hemisphere === 'S') y -= 10000000;
  const longOrigin = (zone - 1) * 6 - 180 + 3;
  const m = y / k0;
  const mu = m / (a * (1 - eccSquared / 4 - (3 * eccSquared ** 2) / 64 - (5 * eccSquared ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - eccSquared)) / (1 + Math.sqrt(1 - eccSquared));
  const phi1Rad = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu);
  const n1 = a / Math.sqrt(1 - eccSquared * Math.sin(phi1Rad) ** 2);
  const t1 = Math.tan(phi1Rad) ** 2;
  const c1 = eccPrimeSquared * Math.cos(phi1Rad) ** 2;
  const r1 = a * (1 - eccSquared) / Math.pow(1 - eccSquared * Math.sin(phi1Rad) ** 2, 1.5);
  const d = x / (n1 * k0);
  const lat = phi1Rad - (n1 * Math.tan(phi1Rad) / r1) * (
    d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * eccPrimeSquared) * d ** 4 / 24
    + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * eccPrimeSquared - 3 * c1 ** 2) * d ** 6 / 720
  );
  const lng = (d - (1 + 2 * t1 + c1) * d ** 3 / 6
    + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * eccPrimeSquared + 24 * t1 ** 2) * d ** 5 / 120) / Math.cos(phi1Rad);

  const latitude = lat * 180 / Math.PI;
  const longitude = longOrigin + lng * 180 / Math.PI;
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? [longitude, latitude] : null;
}

// Corrige colunas invertidas (comum em planilhas brasileiras: lng na coluna "Latitude")
function normalizeLatLng(lat: number, lng: number): [number, number] | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let la = lat;
  let ln = lng;
  if (Math.abs(la) > 90 && Math.abs(ln) <= 90) [la, ln] = [ln, la];
  else if (Math.abs(la) > 35 && Math.abs(ln) <= 35 && Math.abs(la) <= 180) [la, ln] = [ln, la];
  if (Math.abs(la) <= 90 && Math.abs(ln) <= 180) return [ln, la];
  return null;
}

// Parser unificado: decimal, DMS, hemisfério e pares "-9.17, -36.06"
function parseCoordinatePair(input: string): [number, number] | null {
  const raw = String(input ?? '').trim().replace(/^\uFEFF/, '').replace(/[()]/g, '');
  if (!raw) return null;

  const parts = raw.split(/[,;|/]\s*|\s+(?=[-+]\d)/).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const normalized = normalizeLatLng(parseCoord(parts[0]), parseCoord(parts[1]));
    if (normalized) return normalized;
  }

  const match = raw.match(/^([-+]?\d{1,3}(?:[.,]\d+)?)(?:\s*;\s*|\s{1,}|\s*,\s*(?=[-+]))([-+]?\d{1,3}(?:[.,]\d+)?)$/);
  if (match) {
    return normalizeLatLng(parseFloat(match[1].replace(',', '.')), parseFloat(match[2].replace(',', '.')));
  }

  return null;
}


export default function HoloMapPlatform() {
  const mapRef = useRef<MapRef>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchRequestRef = useRef(0);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  // Estados principais
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [uiScale, setUiScale] = useState<'compact' | 'standard' | 'expanded'>('standard');
  const [objetos, setObjetos] = useState<ObjetoCultural[]>([]);
  const [demarcatedTerritories, setDemarcatedTerritories] = useState<DemarcatedTerritory[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<ObjetoCultural | null>(null);
  const [activeTerritory, setActiveTerritory] = useState<DemarcatedTerritory | null>(null);
  const [exportTarget, setExportTarget] = useState<'territory' | 'point'>('territory');
  const [territoriesListTab, setTerritoriesListTab] = useState<'territories' | 'points'>('territories');

  // Modos de ferramentas
  const [activeTool, setActiveTool] = useState<'navigate' | 'point' | 'measure' | 'polygon'>('navigate');
  const [isToolsOpen, setIsToolsOpen] = useState(false);

  // A abertura é cartográfica e legível. Relevo, satélite e 3D são escolhas
  // explícitas do usuário — não um efeito que esconda os dados do projeto.
  const [activeLayers, setActiveLayers] = useState<string[]>([
    'territories',
    'markers'
  ]);

  // Modais
  const [activeModal, setActiveModal] = useState<
    'layers' | 'settings' | 'info' | 'spreadsheet' | 'territories_list' | 'export_dossier' | null
  >(null);

  // Busca no mapa com animações e estado spotlight
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isSearchClicked, setIsSearchClicked] = useState(false);
  const [searchCategoryFilter, setSearchCategoryFilter] = useState<'all' | 'territories' | 'points' | 'coords'>('all');
  const [searchedLocation, setSearchedLocation] = useState<{ lng: number; lat: number; label: string; category?: string } | null>(null);

  // Medição e rascunho de polígono
  const [measurementPoints, setMeasurementPoints] = useState<[number, number][]>([]);
  const [polygonDraft, setPolygonDraft] = useState<[number, number][]>([]);
  const [draftTerritoryName, setDraftTerritoryName] = useState('Novo Território');
  const [draftTerritoryColor, setDraftTerritoryColor] = useState('#F57602');

  // Planilha Importada
  const [parsedSpreadsheet, setParsedSpreadsheet] = useState<ParsedSpreadsheet | null>(null);
  const [latColumn, setLatColumn] = useState('');
  const [lngColumn, setLngColumn] = useState('');
  const [coordinateColumn, setCoordinateColumn] = useState('');
  const [titleColumn, setTitleColumn] = useState('');
  const [categoryColumn, setCategoryColumn] = useState('');
  const [sheetAnnotation, setSheetAnnotation] = useState('');
  const [descColumn, setDescColumn] = useState('');
  const [coordinateReference, setCoordinateReference] = useState<CoordinateReference>('geographic');
  const [utmZone, setUtmZone] = useState('24');
  const [utmHemisphere, setUtmHemisphere] = useState<'N' | 'S'>('S');
  const [importMode, setImportMode] = useState<'points' | 'territory'>('points');
  const [isHydrated, setIsHydrated] = useState(false);

  // Toast e Processamento
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [printImage, setPrintImage] = useState<string | null>(null);

  // Vista inicial em 2D, própria para leitura e demarcação de coordenadas.
  const [viewState, setViewState] = useState({
    longitude: -36.065,
    latitude: -9.17,
    zoom: 13,
    pitch: 0,
    bearing: 0
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Carregar dados salvos do localStorage
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('nugep_theme') as 'dark' | 'light';
      if (savedTheme) setTheme(savedTheme);

      const savedScale = localStorage.getItem('nugep_ui_scale') as 'compact' | 'standard' | 'expanded';
      if (savedScale) setUiScale(savedScale);

      const savedPoints = localStorage.getItem('nugep_points_v4');
      if (savedPoints) setObjetos(JSON.parse(savedPoints));

      const savedTerritories = localStorage.getItem('nugep_territories_v4');
      if (savedTerritories) setDemarcatedTerritories(JSON.parse(savedTerritories));
    } catch (e) {
      console.warn('Falha ao restaurar dados:', e);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Persistência automática
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem('nugep_theme', theme);
      localStorage.setItem('nugep_ui_scale', uiScale);
      localStorage.setItem('nugep_points_v4', JSON.stringify(objetos));
      localStorage.setItem('nugep_territories_v4', JSON.stringify(demarcatedTerritories));
    } catch (e) {}
  }, [theme, uiScale, objetos, demarcatedTerritories, isHydrated]);

  useEffect(() => () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
  }, []);

  // Atalhos de teclado globais (⌘K / Ctrl+K para busca e ESC para fechar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchFocused(true);
        setIsSearchClicked(true);
        setShowSearchDropdown(true);
        setTimeout(() => setIsSearchClicked(false), 320);
      } else if (e.key === 'Escape') {
        if (isToolsOpen) {
          setIsToolsOpen(false);
        }
        if (isSearchFocused || showSearchDropdown) {
          setIsSearchFocused(false);
          setShowSearchDropdown(false);
          searchInputRef.current?.blur();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchFocused, showSearchDropdown, isToolsOpen]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setIsToolsOpen(false);
      }
    };
    if (isToolsOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isToolsOpen]);

  // Alternador de Camadas
  const toggleLayer = (layerKey: string) => {
    if (layerKey === 'relevo') {
      if (!activeLayers.includes('relevo')) {
        setViewState(prev => ({ ...prev, pitch: 45 }));
      } else {
        setViewState(prev => ({ ...prev, pitch: 0 }));
      }
    }
    setActiveLayers(prev => 
      prev.includes(layerKey) ? prev.filter(k => k !== layerKey) : [...prev, layerKey]
    );
  };

  // Alternar Inclinação 3D
  const toggle3DCamera = () => {
    if (viewState.pitch <= 20) {
      setActiveLayers(prev => Array.from(new Set([...prev, 'relevo', 'buildings'])));
    }
    setViewState(prev => ({
      ...prev,
      pitch: prev.pitch > 20 ? 0 : 58,
      bearing: prev.pitch > 20 ? 0 : 25
    }));
  };

  // Estilo do Mapa
  const mapStyleUrl = useMemo(() => {
    if (activeLayers.includes('satellite')) {
      return 'mapbox://styles/mapbox/satellite-streets-v12';
    }
    return theme === 'light' 
      ? 'mapbox://styles/mapbox/light-v11'
      : 'mapbox://styles/mapbox/dark-v11';
  }, [activeLayers, theme]);

  const parseCoordinates = (input: string): [number, number] | null => parseCoordinatePair(input);

  const getImportedCoordinates = useCallback((): ImportedCoordinate[] => {
    if (!parsedSpreadsheet || (!coordinateColumn && (!latColumn || !lngColumn))) return [];
    const zone = Number.parseInt(utmZone, 10);
    return parsedSpreadsheet.rows.reduce<ImportedCoordinate[]>((valid, row, index) => {
      if (coordinateColumn) {
        const parsed = parseCoordinatePair(String(row[coordinateColumn] ?? ''));
        if (parsed) valid.push({ lng: parsed[0], lat: parsed[1], row, index });
        return valid;
      }
      const first = parseCoord(row[latColumn]);
      const second = parseCoord(row[lngColumn]);
      let coordinate: [number, number] | null;

      if (coordinateReference === 'utm') {
        // No mapeamento UTM, Latitude recebe Norte (Y) e Longitude recebe Leste (X).
        coordinate = utmToWgs84(second, first, zone, utmHemisphere);
      } else {
        coordinate = normalizeLatLng(first, second);
      }

      if (coordinate) valid.push({ lng: coordinate[0], lat: coordinate[1], row, index });
      return valid;
    }, []);
  }, [parsedSpreadsheet, latColumn, lngColumn, coordinateColumn, coordinateReference, utmZone, utmHemisphere]);

  const importedCoordinates = useMemo(() => getImportedCoordinates(), [getImportedCoordinates]);
  const importedCoordinateByRow = useMemo(
    // "Map" também é o componente importado do react-map-gl; usar globalThis
    // garante que este índice use o construtor nativo durante o prerender.
    () => new globalThis.Map(importedCoordinates.map(item => [item.index, item])),
    [importedCoordinates]
  );

  const fitMapToCoordinates = useCallback((coordinates: [number, number][]) => {
    if (!coordinates.length) return;
    if (coordinates.length === 1) {
      setViewState(prev => ({ ...prev, longitude: coordinates[0][0], latitude: coordinates[0][1], zoom: 16, pitch: 45 }));
      return;
    }
    const lngs = coordinates.map(([lng]) => lng);
    const lats = coordinates.map(([, lat]) => lat);
    const west = Math.min(...lngs);
    const east = Math.max(...lngs);
    const south = Math.min(...lats);
    const north = Math.max(...lats);
    // Evita um fitBounds inválido quando todos os registros têm a mesma posição.
    if (Math.abs(east - west) < 0.00001 && Math.abs(north - south) < 0.00001) {
      setViewState(prev => ({ ...prev, longitude: west, latitude: south, zoom: 16, pitch: 0, bearing: 0 }));
      return;
    }
    mapRef.current?.fitBounds(
      [[west, south], [east, north]],
      { padding: typeof window !== 'undefined' && window.innerWidth >= 768 ? { top: 110, right: 130, bottom: 100, left: 90 } : 64, duration: 900, maxZoom: 15 }
    );
  }, []);

  // Buscar sugestões de endereço — Brasil + Nordeste como prioridade
  const fetchAddressSuggestions = async (query: string): Promise<any[]> => {
    const q = query.trim();
    if (!q || q.length < 2) return [];

    const coords = parseCoordinates(q);
    if (coords) {
      return [{
        id: 'coord_exact',
        text: 'Coordenada Geográfica',
        place_name: `Latitude: ${coords[1].toFixed(6)}°, Longitude: ${coords[0].toFixed(6)}°`,
        center: coords,
        isCoord: true
      }];
    }

    // A consulta passa pela rota do sistema: isso evita as restrições de CORS e
    // User-Agent impostas pelos provedores de geocodificação no navegador.
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.results) && data.results.length) return data.results;
      }
    } catch {}

    // Último fallback no cliente caso a infraestrutura da rota esteja indisponível.
    try {
      const params = new URLSearchParams({
        access_token: MAPBOX_TOKEN,
        limit: '6',
        language: 'pt',
        types: 'country,region,postcode,district,place,locality,neighborhood,address,poi',
      });
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?${params}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.features && data.features.length > 0) {
          return data.features.map((f: any) => {
            const placeType = f.place_type?.[0] || '';
            let label = 'Localidade';
            let iconType = 'place';
            if (placeType === 'country') {
              label = 'País';
              iconType = 'country';
            } else if (placeType === 'region' || placeType === 'place' || placeType === 'locality') {
              label = 'Cidade / Município';
              iconType = 'city';
            } else if (placeType === 'district' || placeType === 'neighborhood') {
              label = 'Bairro';
              iconType = 'place';
            } else if (placeType === 'poi') {
              const cat = (f.properties?.category || '').toLowerCase();
              if (cat.includes('college') || cat.includes('university') || cat.includes('school') || cat.includes('education')) {
                label = 'Universidade / Instituição de Ensino';
                iconType = 'education';
              } else if (cat.includes('hospital') || cat.includes('health') || cat.includes('clinic')) {
                label = 'Hospital / Saúde';
                iconType = 'health';
              } else if (cat.includes('museum') || cat.includes('monument') || cat.includes('historic') || cat.includes('culture')) {
                label = 'Patrimônio Cultural / Museu';
                iconType = 'culture';
              } else {
                label = 'Ponto de Interesse / Estabelecimento';
                iconType = 'business';
              }
            } else if (placeType === 'address') {
              label = 'Endereço / Logradouro';
              iconType = 'place';
            }

            return {
              id: f.id,
              text: f.text,
              place_name: f.place_name,
              category_label: label,
              category_type: placeType,
              category_icon: iconType,
              center: f.center as [number, number]
            };
          });
        }
      }
    } catch (e) {}

    return [];
  };


  // Efeito de clique tátil e foco na barra de busca
  const handleSearchClick = () => {
    setIsSearchClicked(true);
    setIsSearchFocused(true);
    setShowSearchDropdown(true);
    setTimeout(() => setIsSearchClicked(false), 320);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && searchSuggestions.length) {
      event.preventDefault();
      setActiveSuggestionIndex(prev => Math.min(prev + 1, searchSuggestions.length - 1));
    } else if (event.key === 'ArrowUp' && searchSuggestions.length) {
      event.preventDefault();
      setActiveSuggestionIndex(prev => Math.max(prev - 1, 0));
    } else if (event.key === 'Escape') {
      setShowSearchDropdown(false);
      setIsSearchFocused(false);
      searchInputRef.current?.blur();
    }
  };

  const locateUser = () => {
    if (!navigator.geolocation) {
      showToast('A localização não é compatível com este navegador.', 'error');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude: lat, longitude: lng } = coords;
        setViewState(prev => ({ ...prev, latitude: lat, longitude: lng, zoom: 16, pitch: 45 }));
        setSearchedLocation({ lat, lng, label: 'Sua localização' });
        setIsLocating(false);
        showToast('Localização encontrada.', 'success');
      },
      () => {
        setIsLocating(false);
        showToast('Não foi possível acessar sua localização. Verifique a permissão do navegador.', 'error');
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
    );
  };

  // Busca por endereço, território, ponto cultural ou coordenadas com debounce
  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    setActiveSuggestionIndex(-1);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    const requestId = ++searchRequestRef.current;

    const q = value.trim().toLowerCase();

    // 1. Verificar se é coordenada geográfica direta
    const coords = parseCoordinates(value);
    if (coords) {
      setSearchSuggestions([{
        id: 'coord_exact',
        text: 'Coordenada Geográfica GPS',
        place_name: `Lat: ${coords[1].toFixed(6)}°, Lng: ${coords[0].toFixed(6)}° (SIRGAS 2000)`,
        center: coords,
        isCoord: true
      }]);
      setIsSearching(false);
      setShowSearchDropdown(true);
      return;
    }

    if (q.length < 2) {
      setSearchSuggestions([]);
      setIsSearching(false);
      return;
    }

    // 2. Busca local instantânea nos territórios demarcados e pontos culturais
    const includeTerritories = searchCategoryFilter === 'all' || searchCategoryFilter === 'territories';
    const includePoints = searchCategoryFilter === 'all' || searchCategoryFilter === 'points';

    const localTerritories = includeTerritories ? demarcatedTerritories.filter(t => 
      t.nome.toLowerCase().includes(q) || (t.descricao && t.descricao.toLowerCase().includes(q))
    ).map(t => {
      const lats = t.pontos.map(p => p[1]);
      const lngs = t.pontos.map(p => p[0]);
      return {
        id: `local_terr_${t.id}`,
        text: t.nome,
        place_name: `Território Demarcado • ${t.areaHectares} ha • ${t.pontos.length} vértices`,
        center: [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2] as [number, number],
        isTerritory: true,
        territoryData: t
      };
    }) : [];

    const localPoints = includePoints ? objetos.filter(o => {
      const indexedText = [o.titulo, o.objeto, o.autor, o.anotacoes, ...Object.values(o.extraProps || {})]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('pt-BR');
      return indexedText.includes(q);
    }).map(o => ({
      id: `local_point_${o.id}`,
      text: o.titulo,
      place_name: `${o.objeto || 'Patrimônio Cultural'} • ${o.autor || 'Território'} (${o.latitude.toFixed(4)}, ${o.longitude.toFixed(4)})`,
      center: [o.longitude, o.latitude] as [number, number],
      isPoint: true,
      pointData: o
    })) : [];

    // Se houver dados locais demarcados, exibe na hora
    if (localTerritories.length > 0 || localPoints.length > 0) {
      setSearchSuggestions([...localTerritories, ...localPoints]);
      setShowSearchDropdown(true);
    } else if (searchCategoryFilter !== 'all' && searchCategoryFilter !== 'coords') {
      setSearchSuggestions([]);
    }

    if (searchCategoryFilter === 'coords') {
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setShowSearchDropdown(true);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await fetchAddressSuggestions(value);
        if (requestId === searchRequestRef.current) {
          setSearchSuggestions([...localTerritories, ...localPoints, ...results]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (requestId === searchRequestRef.current) setIsSearching(false);
      }
    }, 280);
  };

  // Submeter busca ao pressionar Enter ou clicar no botão de busca
  const handleSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    const coords = parseCoordinates(searchQuery);
    if (coords) {
      setViewState(prev => ({ ...prev, longitude: coords[0], latitude: coords[1], zoom: 16, pitch: 0, bearing: 0 }));
      setSearchedLocation({ lng: coords[0], lat: coords[1], label: 'Coordenada pesquisada' });
      setShowSearchDropdown(false);
      setIsSearchFocused(false);
      showToast(`Localizado: ${coords[1].toFixed(5)}°, ${coords[0].toFixed(5)}°`, 'success');
      return;
    }

    if (searchSuggestions.length > 0) {
      handleSelectSuggestion(searchSuggestions[Math.max(0, activeSuggestionIndex)]);
      return;
    }

    try {
      setIsSearching(true);
      const results = await fetchAddressSuggestions(searchQuery);
      if (results.length > 0) {
        handleSelectSuggestion(results[0]);
      } else {
        showToast('Nenhum endereço encontrado para esta busca.', 'error');
      }
    } catch (err) {
      showToast('Erro ao buscar endereço.', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSuggestion = (item: any) => {
    setShowSearchDropdown(false);
    setIsSearchFocused(false);
    if (item.isTerritory && item.territoryData) {
      setActiveTerritory(item.territoryData);
    }
    if (item.isPoint && item.pointData) {
      setSelectedPoint(item.pointData);
    }
    if (item.center && Array.isArray(item.center)) {
      const [lng, lat] = item.center;

      // Zoom inteligente adaptativo conforme a escala geográfica do local
      let targetZoom = 16.5;
      const type = (item.category_type || '').toLowerCase();
      const icon = item.category_icon;
      if (icon === 'country' || type === 'country') {
        targetZoom = 5;
      } else if (icon === 'city' || type === 'city' || type === 'municipality' || type === 'town' || type === 'region' || type === 'state') {
        targetZoom = 12;
      } else if (type === 'suburb' || type === 'neighbourhood' || type === 'district' || type === 'locality') {
        targetZoom = 14.5;
      } else {
        targetZoom = 16.5;
      }

      setViewState(prev => ({ ...prev, longitude: lng, latitude: lat, zoom: targetZoom, pitch: 0, bearing: 0 }));
      if (!item.isTerritory && !item.isPoint) {
        setSearchedLocation({ 
          lng, 
          lat, 
          label: item.text,
          category: item.category_label 
        });
      }
      const labelBadge = item.category_label ? ` [${item.category_label}]` : '';
      showToast(`Localizado: ${item.text}${labelBadge}`, 'success');
    }
  };

  // Clique no Mapa
  const handleMapClick = async (e: any) => {
    const target = e.originalEvent?.target;
    if (target && target.closest && target.closest('button, input, textarea, select, .no-map-click, .mapboxgl-ctrl')) {
      return;
    }

    const mapFeature = e.features?.[0];
    if (activeTool === 'navigate' && mapFeature?.layer?.id === 'unclustered-points') {
      const point = objetos.find(obj => obj.id === mapFeature.properties?.id);
      if (point) {
        setSelectedPoint(point);
        return;
      }
    }
    if (activeTool === 'navigate' && mapFeature?.layer?.id === 'point-clusters') {
      setViewState(prev => ({ ...prev, longitude: e.lngLat.lng, latitude: e.lngLat.lat, zoom: Math.min(prev.zoom + 2, 18) }));
      return;
    }

    const lat = e.lngLat.lat;
    const lng = e.lngLat.lng;

    // Medição
    if (activeTool === 'measure') {
      setMeasurementPoints(prev => [...prev, [lng, lat]]);
      return;
    }

    // Demarcação de Território (Polígono)
    if (activeTool === 'polygon') {
      setPolygonDraft(prev => {
        const next = [...prev, [lng, lat] as [number, number]];
        showToast(`Vértice #${next.length} adicionado`, 'info');
        return next;
      });
      return;
    }

    // Marcador Pontual
    if (activeTool === 'point') {
      const tempId = `p_${Date.now()}`;
      const newObj: ObjetoCultural = {
        id: tempId,
        autor: 'Ponto Registrado',
        titulo: `Ponto (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        ano: new Date().getFullYear().toString(),
        objeto: 'Registro Cartográfico',
        latitude: lat,
        longitude: lng,
        altura: 0,
        datasetName: 'NUGEP MAPS'
      };

      setObjetos(prev => [newObj, ...prev]);
      setSelectedPoint(newObj);

      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
        const data = await res.json();
        if (data && data.display_name) {
          const title = data.display_name.split(',')[0];
          const author = data.display_name.split(',').slice(1, 3).join(', ').trim();
          const updated = { ...newObj, titulo: title, autor: author || 'Localidade' };
          setObjetos(prev => prev.map(o => o.id === tempId ? updated : o));
          setSelectedPoint(updated);
        }
      } catch (err) {}
      return;
    }
  };

  // Concluir e Criar Território
  const finishPolygonDemarcation = () => {
    if (polygonDraft.length < 3) {
      showToast('O território precisa de pelo menos 3 pontos para formar uma área.', 'error');
      return;
    }

    const areaM2 = calculatePolygonArea(polygonDraft);
    const areaHectares = areaM2 / 10000;
    const areaKm2 = areaM2 / 1000000;
    const perimetroKm = calculatePerimeter(polygonDraft);

    const newTerritory: DemarcatedTerritory = {
      id: `terr_${Date.now()}`,
      nome: draftTerritoryName || `Território #${demarcatedTerritories.length + 1}`,
      descricao: `Demarcado via NUGEP MAPS em ${new Date().toLocaleDateString('pt-BR')}`,
      cor: draftTerritoryColor,
      pontos: polygonDraft,
      areaM2: Math.round(areaM2),
      areaHectares: parseFloat(areaHectares.toFixed(2)),
      areaKm2: parseFloat(areaKm2.toFixed(4)),
      perimetroKm: parseFloat(perimetroKm.toFixed(2)),
      criadoEm: new Date().toISOString(),
      visivel: true
    };

    setDemarcatedTerritories(prev => [newTerritory, ...prev]);
    setActiveTerritory(newTerritory);
    setPolygonDraft([]);
    setActiveTool('navigate');
    showToast(`Território demarcado com sucesso: ${newTerritory.areaHectares} ha!`);
  };

  // Salvar alterações no Território Ativo
  const handleSaveActiveTerritory = () => {
    if (!activeTerritory) return;
    setDemarcatedTerritories(prev => prev.map(t => t.id === activeTerritory.id ? activeTerritory : t));
    showToast('Território atualizado e salvo com sucesso!');
  };

  // Excluir Território Ativo
  const handleDeleteActiveTerritory = () => {
    if (!activeTerritory) return;
    setDemarcatedTerritories(prev => prev.filter(t => t.id !== activeTerritory.id));
    setActiveTerritory(null);
    showToast('Território excluído.');
  };

  // Salvar alterações no Ponto Selecionado
  const handleSaveActivePoint = () => {
    if (!selectedPoint) return;
    setObjetos(prev => {
      const updatedList = prev.some(o => o.id === selectedPoint.id)
        ? prev.map(o => o.id === selectedPoint.id ? selectedPoint : o)
        : [selectedPoint, ...prev];
      try {
        localStorage.setItem('nugep_points_v4', JSON.stringify(updatedList));
      } catch (e) {}
      return updatedList;
    });
    showToast('Ponto e anotações salvos com sucesso!');
  };

  // Excluir Ponto
  const handleDeleteActivePoint = (idToDelete?: string) => {
    const id = idToDelete || selectedPoint?.id;
    if (!id) return;
    setObjetos(prev => {
      const updatedList = prev.filter(o => o.id !== id);
      try {
        localStorage.setItem('nugep_points_v4', JSON.stringify(updatedList));
      } catch (e) {}
      return updatedList;
    });
    if (selectedPoint?.id === id) setSelectedPoint(null);
    showToast('Ponto removido.');
  };

  // Exportar Dossiê do Ponto em PDF com Marca d'Água do NUGEP
  const handleExportPointPDF = (pointToExport?: ObjetoCultural) => {
    const target = pointToExport || selectedPoint;
    if (!target) return;
    setSelectedPoint(target);
    setExportTarget('point');

    if (mapRef.current) {
      try {
        const canvas = mapRef.current.getMap().getCanvas();
        setPrintImage(canvas.toDataURL('image/png'));
      } catch (err) {}
    }

    setActiveModal('export_dossier');
  };

  // Exportar Dossiê do Território em PDF com Marca d'Água do NUGEP
  const handleExportTerritoryPDF = (territoryToExport?: DemarcatedTerritory) => {
    const target = territoryToExport || activeTerritory;
    if (target) setActiveTerritory(target);
    setExportTarget('territory');

    // Capturar snapshot do mapa
    if (mapRef.current) {
      try {
        const canvas = mapRef.current.getMap().getCanvas();
        setPrintImage(canvas.toDataURL('image/png'));
      } catch (err) {}
    }

    setActiveModal('export_dossier');
  };

  // Disparar Impressão Nativa (PDF)
  const triggerNativePrint = () => {
    if (mapRef.current) {
      try {
        const canvas = mapRef.current.getMap().getCanvas();
        setPrintImage(canvas.toDataURL('image/png'));
      } catch (err) {}
    }
    setTimeout(() => {
      window.print();
    }, 400);
  };

  // Importar Planilha (CSV, TSV, TXT, XLSX, XLS)
  const handleSpreadsheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setSheetAnnotation('');
    setDescColumn('');
    setTitleColumn('');
    setCategoryColumn('');
    setLatColumn('');
    setLngColumn('');
    setCoordinateColumn('');
    setCoordinateReference('geographic');

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isExcel = ext === 'xlsx' || ext === 'xls';

    // Helper: detectar colunas automaticamente com aliases ampliados
    const autoDetectColumns = (headers: string[]) => {
      const lowerHeaders = headers.map(h => ({
        orig: h,
        clean: h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_]/g, ' ').trim()
      }));

      const LAT_ALIASES = [
        'latitude', 'lat', 'lat dd', 'lat grau', 'lat graus', 'lat decimal', 'lat (dd)',
        'latitude (dd)', 'latitude (graus)', 'latitude dd', 'latitudine', 'lat_dd', 'lat_grau',
        'coord y', 'coordenada y', 'y', 'y coord', 'y (m)', 'y utm', 'northing',
        'latitude geografica', 'lat geo', 'latitude wgs84'
      ];
      const LNG_ALIASES = [
        'longitude', 'long', 'lng', 'lon', 'lon dd', 'lng dd', 'lon grau', 'long decimal',
        'lon (dd)', 'longitude (dd)', 'longitude (graus)', 'longitude dd', 'long_dd',
        'coord x', 'coordenada x', 'x', 'x coord', 'x (m)', 'x utm', 'easting',
        'longitude geografica', 'lon geo', 'longitude wgs84', 'longitudine'
      ];
      const TITLE_ALIASES = [
        'nome', 'name', 'titulo', 'title', 'local', 'localizacao', 'lugar', 'descricao breve',
        'objeto', 'patrimonio', 'bem', 'denominacao', 'edificacao', 'sitio', 'localidade',
        'nome do local', 'nome do sitio', 'identificacao', 'label', 'rotulo', 'descricao curta'
      ];
      const CAT_ALIASES = [
        'categoria', 'tipo', 'type', 'class', 'classificacao', 'natureza', 'especie',
        'modalidade', 'grupo', 'setor', 'area', 'uso', 'funcao', 'finalidade'
      ];
      const DESC_ALIASES = [
        'descricao', 'description', 'observacao', 'observacoes', 'obs', 'nota', 'notas',
        'informacao', 'detalhes', 'historico', 'contexto', 'texto', 'comentario', 'info'
      ];
      const PAIR_ALIASES = [
        'coordenadas', 'coordenada', 'coord', 'gps', 'lat lng', 'lat long', 'latitude longitude',
        'localizacao gps', 'geolocalizacao', 'ponto gps', 'position', 'geometry'
      ];

      const findCol = (aliases: string[]) =>
        lowerHeaders.find(h => aliases.some(a => h.clean === a)) ||
        lowerHeaders.find(h => aliases.some(a => {
          const words = h.clean.split(/\s+/);
          return words.includes(a) || h.clean.startsWith(`${a} `) || h.clean.endsWith(` ${a}`);
        }));

      const foundLat = findCol(LAT_ALIASES);
      const foundLng = findCol(LNG_ALIASES);
      const foundTitle = findCol(TITLE_ALIASES);
      const foundCat = findCol(CAT_ALIASES);
      const foundDesc = findCol(DESC_ALIASES);
      const foundPair = findCol(PAIR_ALIASES);
      const looksLikeUtm = /\b(utm|northing|easting)\b/i.test(headers.join(' '));

      if (foundLat) setLatColumn(foundLat.orig);
      if (foundLng) setLngColumn(foundLng.orig);

      if (foundTitle) setTitleColumn(foundTitle.orig);
      if (foundCat) setCategoryColumn(foundCat.orig);
      if (foundDesc) setDescColumn(foundDesc.orig);
      if (foundPair && !looksLikeUtm) setCoordinateColumn(foundPair.orig);
      if (looksLikeUtm) setCoordinateReference('utm');
      setImportMode('points');
    };

    if (isExcel) {
      // Ler .xlsx via SheetJS (importado dinamicamente para não bloquear bundle)
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const XLSX = await import('xlsx');
          const data = new Uint8Array(ev.target!.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array', cellDates: true });
          const wsName = wb.SheetNames[0];
          const ws = wb.Sheets[wsName];
          const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, {
            raw: false,
            defval: ''
          });

          if (!rawRows || rawRows.length === 0) {
            setIsProcessing(false);
            showToast('Planilha Excel vazia ou sem dados.', 'error');
            return;
          }

          const headers = Object.keys(rawRows[0]);
          setParsedSpreadsheet({ fileName: file.name, headers, rows: rawRows });
          autoDetectColumns(headers);
          setActiveModal('spreadsheet');
          setIsProcessing(false);
          showToast(`Excel carregado: ${rawRows.length} registros encontrados.`);
        } catch (err) {
          setIsProcessing(false);
          showToast('Erro ao ler arquivo Excel. Verifique se o arquivo não está corrompido.', 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // CSV / TSV / TXT via PapaParse
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        complete: (results) => {
          setIsProcessing(false);
          if (!results.data || results.data.length === 0) {
            showToast('Planilha vazia.', 'error');
            return;
          }

          const headers = results.meta.fields || Object.keys(results.data[0] || {});
          const rows = results.data as Record<string, any>[];

          setParsedSpreadsheet({ fileName: file.name, headers, rows });
          autoDetectColumns(headers);
          setActiveModal('spreadsheet');
          showToast(`Planilha carregada: ${rows.length} registros prontos.`);
        },
        error: () => {
          setIsProcessing(false);
          showToast('Falha ao processar planilha.', 'error');
        }
      });
    }

    e.target.value = '';
  };


  // Aplicar Planilha como Pontos ou Território (sem duplicar marcadores)
  const applySpreadsheet = () => {
    if (!parsedSpreadsheet || (!coordinateColumn && (!latColumn || !lngColumn))) {
      showToast('Selecione as colunas de Latitude e Longitude (ou uma coluna com o par de coordenadas).', 'error');
      return;
    }

    const validRows = importedCoordinates;
    const importedAt = Date.now();
    const mappedPoints: ObjetoCultural[] = validRows.map(({ lat, lng, row, index }) => {
      const title = titleColumn && row[titleColumn] ? String(row[titleColumn]) : `Ponto #${index + 1}`;
      const category = categoryColumn && row[categoryColumn] ? String(row[categoryColumn]) : 'Importado';
      const description = descColumn && row[descColumn] ? String(row[descColumn]) : '';
      const notes = [description, sheetAnnotation].filter(Boolean).join(description && sheetAnnotation ? '\n\n' : '');
      return {
        id: `sheet_${importedAt}_${index}`,
        autor: parsedSpreadsheet.fileName,
        titulo: title,
        ano: new Date().getFullYear().toString(),
        objeto: category,
        latitude: lat,
        longitude: lng,
        altura: 0,
        datasetName: parsedSpreadsheet.fileName,
        anotacoes: notes || undefined,
        extraProps: { ...row, _descricao: description, _anotacao_geral: sheetAnnotation }
      };
    });
    const validCoords = validRows.map(({ lng, lat }) => [lng, lat] as [number, number]);

    if (mappedPoints.length === 0) {
      showToast('Nenhuma coordenada válida. Verifique o mapeamento das colunas e o formato (ex: -9.17, -36.06).', 'error');
      return;
    }

    const baseDesc = sheetAnnotation
      ? `${sheetAnnotation}\n\nFonte: ${parsedSpreadsheet.fileName} (${validCoords.length} pontos).`
      : `Importado de: ${parsedSpreadsheet.fileName} (${validCoords.length} pontos).`;

    if (importMode === 'points') {
      setObjetos(prev => [...mappedPoints, ...prev]);
      showToast(`✅ ${mappedPoints.length} pontos demarcados no mapa com anotações.`);
    } else if (validCoords.length >= 3) {
      const areaM2 = calculatePolygonArea(validCoords);
      const perimetroKm = calculatePerimeter(validCoords);
      const newTerritory: DemarcatedTerritory = {
        id: `terr_sheet_${Date.now()}`,
        nome: `Território: ${parsedSpreadsheet.fileName.replace(/\.[^/.]+$/, '')}`,
        descricao: baseDesc,
        cor: '#0F3E8C',
        pontos: validCoords,
        areaM2: Math.round(areaM2),
        areaHectares: parseFloat((areaM2 / 10000).toFixed(2)),
        areaKm2: parseFloat((areaM2 / 1000000).toFixed(4)),
        perimetroKm: parseFloat(perimetroKm.toFixed(2)),
        criadoEm: new Date().toISOString(),
        visivel: true
      };
      setDemarcatedTerritories(prev => [newTerritory, ...prev]);
      setActiveTerritory(newTerritory);
      showToast(`✅ Polígono criado — ${newTerritory.areaHectares} ha · ${validCoords.length} vértices`);
    } else {
      showToast('Para criar um polígono, são necessários pelo menos 3 coordenadas válidas.', 'error');
      return;
    }

    fitMapToCoordinates(validCoords);
    setActiveModal(null);
  };

  // Exportar planilha importada como Excel (.xlsx)
  const exportSpreadsheetAsExcel = async () => {
    if (!parsedSpreadsheet) return;
    try {
      const XLSX = await import('xlsx');

      // Aba 1: Pontos com status de validade
      const pontoRows = parsedSpreadsheet.rows.map((row, idx) => {
        const found = importedCoordinateByRow.get(idx);
        const valid = Boolean(found);
        return {
          '#': idx + 1,
          'Status': valid ? '✅ Válida' : '❌ Inválida',
          'Latitude (DD)': found ? found.lat.toFixed(7) : '',
          'Longitude (DD)': found ? found.lng.toFixed(7) : '',
          ...row
        };
      });

      // Aba 2: Resumo
      const validCount = pontoRows.filter(r => r['Status'].startsWith('✅')).length;
      const resumoRows = [
        { 'Campo': 'Arquivo', 'Valor': parsedSpreadsheet.fileName },
        { 'Campo': 'Data de Importação', 'Valor': new Date().toLocaleString('pt-BR') },
        { 'Campo': 'Total de Registros', 'Valor': parsedSpreadsheet.rows.length },
        { 'Campo': 'Coordenadas Válidas', 'Valor': validCount },
        { 'Campo': 'Coordenadas Inválidas', 'Valor': parsedSpreadsheet.rows.length - validCount },
        { 'Campo': 'Coluna Latitude', 'Valor': latColumn },
        { 'Campo': 'Coluna Longitude', 'Valor': lngColumn },
        { 'Campo': 'Coluna Título', 'Valor': titleColumn || '—' },
        { 'Campo': 'Coluna Categoria', 'Valor': categoryColumn || '—' },
        { 'Campo': 'Coluna Descrição', 'Valor': descColumn || '—' },
        { 'Campo': 'Sistema de Coordenadas', 'Valor': coordinateReference === 'utm' ? `UTM zona ${utmZone || '—'} ${utmHemisphere}` : 'Latitude / Longitude (decimal)' },
        { 'Campo': 'Anotação do Usuário', 'Valor': sheetAnnotation || '—' },
      ];

      const wb = XLSX.utils.book_new();
      const wsPontos = XLSX.utils.json_to_sheet(pontoRows);
      const wsResumo = XLSX.utils.json_to_sheet(resumoRows);

      XLSX.utils.book_append_sheet(wb, wsPontos, 'Pontos');
      XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

      const fileName = parsedSpreadsheet.fileName.replace(/\.[^/.]+$/, '') + '_nugep_export.xlsx';
      XLSX.writeFile(wb, fileName);
      showToast('Excel exportado com sucesso!');
    } catch (err) {
      showToast('Erro ao exportar Excel.', 'error');
    }
  };


  // Centralizar no Território NUGEP
  const flyToPreset = (preset: 'nugep') => {
    if (preset === 'nugep') {
      setViewState({
        longitude: -36.065,
        latitude: -9.17,
        zoom: 13,
        pitch: 0,
        bearing: 0
      });
      showToast('Território Central NUGEP', 'info');
    }
    setActiveModal(null);
  };

  // GeoJSON dos Territórios Salvos
  const territoriesGeoJSON = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: demarcatedTerritories.filter(t => t.visivel && t.pontos.length >= 3).map(t => ({
        type: 'Feature',
        properties: {
          id: t.id,
          nome: t.nome,
          cor: t.cor,
          areaHectares: t.areaHectares
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[...t.pontos, t.pontos[0]]]
        }
      }))
    };
  }, [demarcatedTerritories]);

  // Pontos em GeoJSON para que o Mapbox agrupe milhares de registros sem
  // criar um elemento React/HTML para cada marcador importado.
  const pointsGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: objetos
      .filter(obj => Number.isFinite(obj.latitude) && Number.isFinite(obj.longitude))
      .map(obj => ({
        type: 'Feature' as const,
        properties: { id: obj.id, title: obj.titulo, category: obj.objeto || 'Ponto' },
        geometry: { type: 'Point' as const, coordinates: [obj.longitude, obj.latitude] }
      }))
  }), [objetos]);

  const focusPoint = (point: ObjetoCultural) => {
    setSelectedPoint(point);
    setActiveTerritory(null);
    setViewState(prev => ({ ...prev, longitude: point.longitude, latitude: point.latitude, zoom: 17, pitch: 0, bearing: 0 }));
  };

  const focusTerritory = (territory: DemarcatedTerritory) => {
    setActiveTerritory(territory);
    setSelectedPoint(null);
    fitMapToCoordinates(territory.pontos);
  };

  // GeoJSON do rascunho de polígono
  const draftPolygonGeoJSON = useMemo(() => {
    if (polygonDraft.length < 3) return null;
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[...polygonDraft, polygonDraft[0]]]
      }
    };
  }, [polygonDraft]);

  const draftLineGeoJSON = useMemo(() => {
    if (polygonDraft.length < 2) return null;
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: polygonDraft
      }
    };
  }, [polygonDraft]);

  // GeoJSON da régua
  const measurementGeoJSON = useMemo(() => {
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: measurementPoints
      }
    };
  }, [measurementPoints]);

  const currentDistance = calculateDistance(measurementPoints);
  const currentDraftArea = polygonDraft.length >= 3 ? calculatePolygonArea(polygonDraft) : 0;
  const currentDraftPerimeter = polygonDraft.length >= 2 ? calculatePerimeter(polygonDraft) : 0;

  const isDark = theme === 'dark';
  const themeClass = isDark ? 'theme-dark' : 'theme-light';
  const scaleClass = uiScale === 'compact' ? 'scale-compact' : uiScale === 'expanded' ? 'scale-expanded' : 'scale-standard';

  const uiZoomStyle = useMemo(() => {
    if (uiScale === 'compact') return { zoom: 0.85 };
    if (uiScale === 'expanded') return { zoom: 1.18 };
    return { zoom: 1 };
  }, [uiScale]);

  return (
    <div className={`w-full h-[100dvh] flex flex-col font-sans select-none overflow-hidden relative ${themeClass} ${scaleClass} ${isDark ? 'bg-[#06080C] text-gray-100' : 'bg-[#f4f6f9] text-gray-900'} print:h-auto print:overflow-visible print:bg-white print:text-black`}>
      
      {/* TODA A INTERFACE INTERATIVA DO SISTEMA (OCULTADA TOTALMENTE DURANTE A IMPRESSÃO DO PDF) */}
      <div className="no-print w-full h-full relative overflow-hidden flex flex-col">
        {/* Toast Notification */}
      {toast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl liquid-glass flex items-center gap-3 anim-slide-up-spring shadow-2xl border border-white/20 anim-glow-pulse">
          {toast.type === 'success' && <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />}
          {toast.type === 'error' && <AlertCircle size={18} className="text-red-400 shrink-0" />}
          {toast.type === 'info' && <img src={NUGEP_LOGO} alt="NUGEP" className="w-5 h-5 object-contain shrink-0" />}
          <p className="text-xs md:text-sm font-medium leading-none">{toast.message}</p>
        </div>
      )}

      {/* OVERLAY DE FOCO / SPOTLIGHT DA BUSCA */}
      {isSearchFocused && (
        <div 
          onClick={() => {
            setIsSearchFocused(false);
            setShowSearchDropdown(false);
          }}
          className="fixed inset-0 z-30 bg-black/45 backdrop-blur-[2px] transition-all duration-300 pointer-events-auto animate-in fade-in"
        />
      )}

      {/* =========================================================================
          BARRA SUPERIOR RESPONSIVA: BRANDING + BUSCA
          ========================================================================= */}
      <div 
        style={uiZoomStyle}
        className="ui-scale-target absolute inset-x-0 top-0 z-40 flex h-[72px] items-center gap-3 border-b border-white/10 bg-[#101317]/92 px-3 shadow-[0_5px_24px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:px-5 pointer-events-none origin-top"
      >
        {/* BRANDING: NUGEP MAPS + LOGO OFICIAL DO NUGEP */}
        <div 
          onClick={() => flyToPreset('nugep')}
          className="rounded-xl px-1.5 sm:px-2 py-1.5 flex items-center gap-2 sm:gap-3 cursor-pointer hover:bg-white/5 active:scale-95 transition-all duration-200 pointer-events-auto shrink-0 group"
          title="Centralizar Território NUGEP"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#0F3E8C]/30 border border-[#F4B205]/40 flex items-center justify-center overflow-hidden p-0.5 group-hover:border-[#F4B205]/70 transition-all duration-300">
            <img src={NUGEP_LOGO} alt="NUGEP MAPS" className="w-full h-full object-contain filter drop-shadow group-hover:scale-110 transition-transform duration-300" />
          </div>
          <div className="flex items-center gap-1.5 font-bold tracking-[0.12em] text-xs sm:text-sm text-white">
            <span>NUGEP</span><span className="text-[#F4B205]">MAPS</span>
          </div>
        </div>

        {/* BARRA DE BUSCA CENTRAL COM EXPANSÃO E ANIMAÇÃO AO CLICAR */}
        <div className={`pointer-events-auto relative search-container-wrap ${
          isSearchFocused ? 'flex-1 max-w-[720px]' : 'flex-1 max-w-[720px]'
        }`}>


          <form 
            onSubmit={handleSearchSubmit}
            onClick={handleSearchClick}
            className={`search-bar-modern rounded-xl bg-black/25 p-1 sm:p-1.5 flex items-center gap-1.5 sm:gap-2 border border-white/15 shadow-sm transition-all duration-300 ${
              isSearchFocused ? 'is-focused' : 'hover:border-white/30'
            } ${isSearchClicked ? 'search-bar-clicked' : ''}`}
          >
            <button 
              type="submit" 
              className={`pl-2 sm:pl-3 text-[#F4B205] transition-all duration-300 cursor-pointer focus:outline-none shrink-0 ${
                isSearchFocused ? 'scale-110' : 'hover:scale-125 active:scale-90'
              }`}
              title="Buscar no mapa (Enter)"
            >
              <Search size={16} />
            </button>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => handleSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => {
                setIsSearchFocused(true);
                setShowSearchDropdown(true);
              }}
              placeholder={isSearchFocused ? "Endereço, cidade, território ou coordenadas GPS" : "Buscar endereço, local ou coordenadas"}
              role="combobox"
              aria-expanded={showSearchDropdown}
              aria-controls="map-search-results"
              aria-activedescendant={activeSuggestionIndex >= 0 ? `map-search-result-${activeSuggestionIndex}` : undefined}
              className="w-full bg-transparent text-xs sm:text-sm outline-none placeholder:text-gray-400/60 font-medium transition-colors duration-300 focus:placeholder:text-[#F4B205]/45 text-white"
            />
            {isSearching && (
              <div className="w-3.5 h-3.5 border-2 border-[#F4B205] border-t-transparent rounded-full animate-spin shrink-0 mr-1" />
            )}
            {searchQuery && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchQuery('');
                  setSearchSuggestions([]);
                  setActiveSuggestionIndex(-1);
                }}
                className="p-1.5 hover:bg-white/10 rounded-full opacity-60 hover:opacity-100 mr-1 transition-all duration-200 hover:rotate-90 text-gray-300 hover:text-white"
                title="Limpar busca"
              >
                <X size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); locateUser(); }}
              className="p-1.5 rounded-full hover:bg-white/10 text-[#F4B205] transition-all hover:scale-110 disabled:opacity-50"
              title="Usar minha localização"
              disabled={isLocating}
            >
              <LocateFixed size={15} className={isLocating ? 'animate-spin' : ''} />
            </button>

            {/* Indicador de Atalho Moderno */}
            <div className="hidden sm:flex items-center pr-1.5 shrink-0">
              {isSearchFocused ? (
                <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded-lg bg-white/10 text-[#F4B205] border border-[#F4B205]/30 shadow-sm animate-in fade-in">
                  ESC
                </kbd>
              ) : (
                <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded-lg bg-white/5 text-white/40 border border-white/10 shadow-sm group-hover:border-[#F4B205]/40 transition-colors">
                  ⌘K
                </kbd>
              )}
            </div>
          </form>

          {/* SPOTLIGHT DROPDOWN: SUGESTÕES & PAINEL DE DESCOBERTA RÁPIDA */}
          {showSearchDropdown && isSearchFocused && (
            <div className="absolute left-0 right-0 top-full mt-2.5 w-full liquid-glass rounded-3xl border border-white/20 overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.7)] z-50 flex flex-col max-h-[75vh] overflow-y-auto custom-scrollbar search-dropdown-enter backdrop-blur-2xl">
              
              {/* QUANDO O USUÁRIO AINDA NÃO DIGITOU OU BUSCA VAZIA: PAINEL SPOTLIGHT RÁPIDO */}
              {searchQuery.trim().length === 0 ? (
                <div className="p-3 sm:p-4 flex flex-col gap-3">
                  
                  {/* Chips de Categorias Rápidas */}
                  <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
                    <button 
                      onClick={() => setSearchCategoryFilter('all')}
                      className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-all shrink-0 ${
                        searchCategoryFilter === 'all' 
                          ? 'bg-[#0F3E8C] text-[#F4B205] border border-[#F4B205]/50 shadow-md' 
                          : 'bg-white/5 hover:bg-white/10 text-gray-300'
                      }`}
                    >
                      Explorar Tudo
                    </button>
                    <button 
                      onClick={() => setSearchCategoryFilter('territories')}
                      className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-all shrink-0 flex items-center gap-1 ${
                        searchCategoryFilter === 'territories' 
                          ? 'bg-[#0F3E8C] text-[#F4B205] border border-[#F4B205]/50 shadow-md' 
                          : 'bg-white/5 hover:bg-white/10 text-gray-300'
                      }`}
                    >
                      <Hexagon size={12} />
                      <span>Territórios ({demarcatedTerritories.length})</span>
                    </button>
                    <button 
                      onClick={() => setSearchCategoryFilter('points')}
                      className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-all shrink-0 flex items-center gap-1 ${
                        searchCategoryFilter === 'points' 
                          ? 'bg-[#0F3E8C] text-[#F4B205] border border-[#F4B205]/50 shadow-md' 
                          : 'bg-white/5 hover:bg-white/10 text-gray-300'
                      }`}
                    >
                      <MapPin size={12} />
                      <span>Pontos ({objetos.length})</span>
                    </button>
                    <button 
                      onClick={() => setSearchCategoryFilter('coords')}
                      className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-all shrink-0 flex items-center gap-1 ${
                        searchCategoryFilter === 'coords' 
                          ? 'bg-[#0F3E8C] text-[#F4B205] border border-[#F4B205]/50 shadow-md' 
                          : 'bg-white/5 hover:bg-white/10 text-gray-300'
                      }`}
                    >
                      <Compass size={12} />
                      <span>GPS SIRGAS</span>
                    </button>
                  </div>

                  {/* 1. Territórios Demarcados Salvos */}
                  {(searchCategoryFilter === 'all' || searchCategoryFilter === 'territories') && demarcatedTerritories.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#F4B205] opacity-80 px-1">
                        Territórios Demarcados Salvos ({demarcatedTerritories.length})
                      </span>
                      {demarcatedTerritories.slice(0, 4).map((terr) => (
                        <div
                          key={terr.id}
                          onClick={() => {
                            focusTerritory(terr);
                            setIsSearchFocused(false);
                            setShowSearchDropdown(false);
                            showToast(`Território: ${terr.nome}`, 'info');
                          }}
                          className="p-2.5 rounded-2xl bg-white/5 hover:bg-[#0F3E8C]/25 border border-white/10 hover:border-white/25 cursor-pointer transition-all duration-200 flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: terr.cor }} />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white group-hover:text-[#F4B205] transition-colors truncate">{terr.nome}</p>
                              <p className="text-[10px] opacity-60 truncate">{terr.areaHectares} ha • {terr.pontos.length} vértices</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-white/10 text-gray-300 shrink-0">Ver no 3D</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 3. Pontos Culturais Marcados */}
                  {(searchCategoryFilter === 'all' || searchCategoryFilter === 'points') && objetos.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#F4B205] opacity-80 px-1">
                        Pontos Culturais Marcados ({objetos.length})
                      </span>
                      {objetos.slice(0, 3).map((obj) => (
                        <div
                          key={obj.id}
                          onClick={() => {
                            focusPoint(obj);
                            setIsSearchFocused(false);
                            setShowSearchDropdown(false);
                            showToast(`Ponto: ${obj.titulo}`, 'info');
                          }}
                          className="p-2.5 rounded-2xl bg-white/5 hover:bg-[#0F3E8C]/25 border border-white/10 hover:border-white/25 cursor-pointer transition-all duration-200 flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-xl bg-[#0F3E8C]/20 border border-[#F4B205]/40 flex items-center justify-center text-[#F4B205] shrink-0">
                              <MapPin size={13} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white group-hover:text-[#F4B205] transition-colors truncate">{obj.titulo}</p>
                              <p className="text-[10px] opacity-60 truncate">{obj.objeto || 'Patrimônio'} ({obj.latitude.toFixed(4)}, {obj.longitude.toFixed(4)})</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-white/10 text-gray-300 shrink-0">Localizar</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 4. Sugestão de Coordenadas GPS */}
                  {(searchCategoryFilter === 'all' || searchCategoryFilter === 'coords') && (
                    <div 
                      onClick={() => {
                        handleSearchInput('-9.1700, -36.0650');
                      }}
                      className="p-2.5 rounded-2xl bg-white/5 hover:bg-[#0F3E8C]/20 border border-dashed border-white/15 cursor-pointer transition-all flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <Compass size={14} className="text-[#F4B205]" />
                        <span className="text-xs font-semibold text-gray-200">Exemplo GPS: -9.1700, -36.0650</span>
                      </div>
                      <span className="text-[10px] text-[#F4B205] font-bold">Inserir</span>
                    </div>
                  )}

                  {/* Rodapé Informativo com Dica */}
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] opacity-60 px-1">
                    <span>Dica: Digite qualquer rua, bairro, cidade ou coordenada GPS</span>
                    <span className="hidden sm:inline">ESC para fechar</span>
                  </div>

                </div>
              ) : (
                /* QUANDO O USUÁRIO DIGITOU: RESULTADOS DE BUSCA */
                <div id="map-search-results" role="listbox">
                  <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar border-b border-white/10 px-3 py-2">
                    {([
                      { key: 'all', label: 'Tudo' },
                      { key: 'territories', label: 'Territórios' },
                      { key: 'points', label: 'Pontos' },
                      { key: 'coords', label: 'GPS' },
                    ] as const).map(chip => (
                      <button
                        key={chip.key}
                        type="button"
                        onClick={() => {
                          setSearchCategoryFilter(chip.key);
                          handleSearchInput(searchQuery);
                        }}
                        className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-bold transition ${
                          searchCategoryFilter === chip.key
                            ? 'bg-[#0F3E8C] text-[#F4B205] border border-[#F4B205]/40'
                            : 'bg-white/5 text-gray-400 hover:bg-white/10'
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                  {searchSuggestions.length === 0 && !isSearching ? (
                    <div className="p-6 text-center opacity-70">
                      <Search size={28} className="mx-auto mb-2 opacity-40 text-[#F4B205]" />
                      <p className="text-xs font-semibold">Nenhum resultado encontrado para "{searchQuery}"</p>
                      <p className="text-[11px] opacity-60 mt-1">Verifique a ortografia ou tente digitar coordenadas como -9.17, -36.06</p>
                    </div>
                  ) : (
                    <div>
                      {searchSuggestions.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          id={`map-search-result-${idx}`}
                          role="option"
                          aria-selected={idx === activeSuggestionIndex}
                          onClick={() => handleSelectSuggestion(item)}
                          className={`px-4 py-3 cursor-pointer border-b border-white/5 last:border-0 flex items-center justify-between gap-3 transition-all duration-200 hover:pl-5 group anim-stagger-${Math.min(idx + 1, 8)} ${idx === activeSuggestionIndex ? 'bg-[#0F3E8C]/35 ring-1 ring-inset ring-[#F4B205]/40' : 'hover:bg-[#0F3E8C]/25'}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
                              item.isTerritory 
                                ? 'bg-amber-500/20 border-amber-500/50 text-[#F4B205]' 
                                : item.isPoint 
                                  ? 'bg-[#0F3E8C]/30 border-[#F4B205]/40 text-[#F4B205]' 
                                  : item.category_icon === 'education'
                                    ? 'bg-sky-500/20 border-sky-500/40 text-sky-400'
                                    : item.category_icon === 'health'
                                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                                      : item.category_icon === 'culture'
                                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                                        : item.category_icon === 'city'
                                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                                          : item.category_icon === 'country'
                                            ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400'
                                            : item.category_icon === 'business'
                                              ? 'bg-amber-500/15 border-amber-500/35 text-[#F4B205]'
                                              : item.category_icon === 'public'
                                                ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                                                : 'bg-white/10 border-white/15 text-gray-300'
                            }`}>
                              {item.isTerritory ? (
                                <Hexagon size={15} />
                              ) : item.isPoint ? (
                                <MapPin size={15} />
                              ) : item.category_icon === 'education' ? (
                                <GraduationCap size={15} />
                              ) : item.category_icon === 'city' ? (
                                <Building2 size={15} />
                              ) : item.category_icon === 'country' ? (
                                <Globe size={15} />
                              ) : item.category_icon === 'culture' || item.category_icon === 'public' ? (
                                <Landmark size={15} />
                              ) : item.category_icon === 'business' ? (
                                <Building2 size={15} />
                              ) : (
                                <MapPin size={15} />
                              )}
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs sm:text-sm font-bold text-white group-hover:text-[#F4B205] transition-colors truncate">
                                  {item.text}
                                </span>
                                {item.isTerritory && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-[#F4B205] font-bold border border-amber-500/30 shrink-0">
                                    TERRITÓRIO
                                  </span>
                                )}
                                {item.isPoint && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#0F3E8C]/40 text-amber-300 font-bold border border-blue-400/30 shrink-0">
                                    PONTO CULTURAL
                                  </span>
                                )}
                                {!item.isTerritory && !item.isPoint && item.category_label && (
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border shrink-0 ${
                                    item.category_icon === 'education'
                                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                                      : item.category_icon === 'health'
                                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                        : item.category_icon === 'culture'
                                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                          : item.category_icon === 'city'
                                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                            : item.category_icon === 'country'
                                              ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                                              : item.category_icon === 'public'
                                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                                : item.category_icon === 'business'
                                                  ? 'bg-amber-500/15 text-amber-200 border-amber-500/30'
                                                  : 'bg-white/10 text-white/70 border-white/20'
                                  }`}>
                                    {item.category_label}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] opacity-60 truncate">{item.place_name}</span>
                            </div>
                          </div>
                          <ChevronRight size={16} className="text-[#F4B205] opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          ESPAÇO DE TRABALHO: DOCK VERTICAL EM CÁPSULA (MODELO EXATO DA IMAGEM)
          ========================================================================= */}
      {/* =========================================================================
          ESPAÇO DE TRABALHO: DOCK RESPONSIVO (BARRA INFERIOR NO MOBILE, LATERAL NO DESKTOP)
          ========================================================================= */}
      <nav 
        style={uiZoomStyle}
        className="ui-scale-target fixed bottom-3 inset-x-3 max-w-sm sm:max-w-md mx-auto h-14 md:h-auto md:max-w-none md:inset-x-auto md:left-4 md:top-[5.25rem] md:bottom-4 md:w-13 z-40 liquid-glass rounded-full border border-white/15 shadow-[0_12px_40px_rgba(0,0,0,0.55)] flex flex-row md:flex-col items-center justify-between px-3 py-1.5 md:px-0 md:py-4 pointer-events-auto origin-bottom md:origin-left anim-slide-up-spring overflow-visible"
      >
        {/* Grupo Superior / Inicial: Territórios/Pontos, Importar Planilha, Camadas */}
        <div className="flex flex-row md:flex-col items-center justify-around md:justify-start gap-1 sm:gap-2 md:gap-3.5 flex-1 md:flex-initial overflow-visible">
          {/* Territórios e Pontos Demarcados (Lista) */}
          <div className="relative group flex items-center justify-center">
            <button
              onClick={() => setActiveModal(prev => prev === 'territories_list' ? null : 'territories_list')}
              className={`w-9 h-9 sm:w-9.5 sm:h-9.5 rounded-full flex items-center justify-center active:scale-90 transition-all duration-300 ${
                activeModal === 'territories_list' 
                  ? 'bg-[#0F3E8C] text-[#F4B205] border border-[#F4B205]/50 shadow-lg shadow-[#0F3E8C]/40 anim-glow-pulse' 
                  : 'text-gray-300 hover:text-white hover:bg-white/10 hover:scale-110'
              }`}
            >
              <Hexagon size={19} />
            </button>
            {(demarcatedTerritories.length > 0 || objetos.length > 0) && (
              <span className="absolute -top-1 -right-1 z-30 min-w-4.5 h-4.5 px-1 bg-[#F4B205] text-black text-[9px] font-black rounded-full flex items-center justify-center shadow-lg anim-badge-pop pointer-events-none ring-2 ring-black/70">
                {demarcatedTerritories.length + objetos.length}
              </span>
            )}
            <div className="hidden md:block nugep-tooltip left-full ml-3.5 top-1/2">Territórios & Pontos</div>
          </div>

          {/* Importar Planilha */}
          <div className="relative group flex items-center justify-center">
            <label 
              className="w-9 h-9 sm:w-9.5 sm:h-9.5 rounded-full flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 active:scale-90 transition-all duration-300 hover:scale-110 cursor-pointer relative"
            >
              {isProcessing ? (
                <div className="w-4 h-4 border-2 border-[#F4B205] border-t-transparent rounded-full animate-spin" />
              ) : (
                <Upload size={19} />
              )}
              <input 
                ref={fileInputRef}
                type="file" 
                accept=".csv,.tsv,.txt,.xlsx,.xls" 
                className="hidden" 
                onChange={handleSpreadsheetUpload}
                disabled={isProcessing}
              />
            </label>
            <div className="hidden md:block nugep-tooltip left-full ml-3.5 top-1/2">Importar Planilha</div>
          </div>

          {/* Camadas 3D e Satélite */}
          <div className="relative group flex items-center justify-center">
            <button
              onClick={() => setActiveModal(prev => prev === 'layers' ? null : 'layers')}
              className={`w-9 h-9 sm:w-9.5 sm:h-9.5 rounded-full flex items-center justify-center active:scale-90 transition-all duration-300 ${
                activeModal === 'layers' 
                  ? 'bg-[#0F3E8C] text-[#F4B205] border border-[#F4B205]/50 shadow-lg shadow-[#0F3E8C]/40 anim-glow-pulse' 
                  : 'text-gray-300 hover:text-white hover:bg-white/10 hover:scale-110'
              }`}
            >
              <Layers size={19} />
            </button>
            <div className="hidden md:block nugep-tooltip left-full ml-3.5 top-1/2">Camadas & 3D</div>
          </div>
        </div>

        {/* Divisor vertical suave no mobile */}
        <div className="h-5 w-px bg-white/10 md:hidden my-auto" />

        {/* Grupo Inferior / Final: Configurações, Informações */}
        <div className="flex flex-row md:flex-col items-center justify-around md:justify-end gap-1 sm:gap-2 md:gap-3.5 flex-1 md:flex-initial">
          {/* Configurações */}
          <div className="relative group flex items-center justify-center">
            <button
              onClick={() => setActiveModal(prev => prev === 'settings' ? null : 'settings')}
              className={`w-9 h-9 sm:w-9.5 sm:h-9.5 rounded-full flex items-center justify-center active:scale-90 transition-all duration-300 ${
                activeModal === 'settings' 
                  ? 'bg-[#0F3E8C] text-[#F4B205] border border-[#F4B205]/50 shadow-lg shadow-[#0F3E8C]/40 anim-glow-pulse' 
                  : 'text-gray-300 hover:text-white hover:bg-white/10 hover:scale-110 hover:rotate-45'
              }`}
            >
              <Settings size={19} />
            </button>
            <div className="hidden md:block nugep-tooltip left-full ml-3.5 top-1/2">Configurações</div>
          </div>

          {/* Sobre / Informações */}
          <div className="relative group flex items-center justify-center">
            <button
              onClick={() => setActiveModal(prev => prev === 'info' ? null : 'info')}
              className={`w-9 h-9 sm:w-9.5 sm:h-9.5 rounded-full flex items-center justify-center active:scale-90 transition-all duration-300 ${
                activeModal === 'info' 
                  ? 'bg-[#0F3E8C] text-[#F4B205] border border-[#F4B205]/50 shadow-lg shadow-[#0F3E8C]/40 anim-glow-pulse' 
                  : 'text-gray-300 hover:text-white hover:bg-white/10 hover:scale-110'
              }`}
            >
              <Info size={19} />
            </button>
            <div className="hidden md:block nugep-tooltip left-full ml-3.5 top-1/2">Sobre o NUGEP MAPS</div>
          </div>
        </div>
      </nav>

      {/* Ferramentas de edição: botão único expansível com todas as funcionalidades */}
      <div 
        ref={toolsMenuRef}
        style={uiZoomStyle} 
        className="ui-scale-target fixed right-3 md:right-4 top-[5.25rem] z-30 pointer-events-auto origin-top-right flex flex-col items-end"
      >
        {/* Botão de disparo com ícone */}
        <div className="relative group flex items-center justify-center">
          <button
            onClick={() => setIsToolsOpen(prev => !prev)}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full liquid-glass border border-white/15 shadow-2xl flex items-center justify-center active:scale-90 transition-all duration-300 ${
              isToolsOpen || activeTool !== 'navigate'
                ? 'bg-[#0F3E8C] text-[#F4B205] border-[#F4B205]/50 shadow-lg shadow-[#0F3E8C]/40 anim-glow-pulse'
                : 'text-gray-300 hover:text-white hover:bg-white/10 hover:scale-110'
            }`}
          >
            {activeTool === 'point' ? (
              <MapPin size={18} />
            ) : activeTool === 'measure' ? (
              <Ruler size={18} />
            ) : activeTool === 'polygon' ? (
              <Hexagon size={18} />
            ) : (
              <Wrench size={18} />
            )}
            {activeTool !== 'navigate' && !isToolsOpen && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#F4B205] border-2 border-black" />
            )}
          </button>
          {!isToolsOpen && (
            <div className="hidden md:block nugep-tooltip right-full mr-3.5 top-1/2">Ferramentas</div>
          )}
        </div>

        {/* Menu suspenso com todas as funcionalidades */}
        {isToolsOpen && (
          <div className="mt-2 w-48 rounded-2xl border border-white/15 bg-[#101317]/96 p-2 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-2 pt-1 pb-1.5 border-b border-white/10 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Ferramentas</span>
              <button 
                onClick={() => setIsToolsOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
              >
                <X size={13} />
              </button>
            </div>

            {[
              { key: 'navigate' as const, label: 'Navegar', icon: MousePointer, action: () => { setActiveTool('navigate'); setIsToolsOpen(false); } },
              { key: 'point' as const, label: 'Adicionar ponto', icon: MapPin, action: () => { setActiveTool('point'); setIsToolsOpen(false); showToast('Clique no mapa para criar um ponto.', 'info'); } },
              { key: 'measure' as const, label: 'Medir distância', icon: Ruler, action: () => { if (activeTool === 'measure') { setActiveTool('navigate'); setMeasurementPoints([]); } else { setActiveTool('measure'); setMeasurementPoints([]); showToast('Clique para medir distância.', 'info'); } setIsToolsOpen(false); } },
              { key: 'polygon' as const, label: 'Demarcar área', icon: Hexagon, action: () => { if (activeTool === 'polygon') { setActiveTool('navigate'); setPolygonDraft([]); } else { setActiveTool('polygon'); setPolygonDraft([]); showToast('Clique nos vértices da área a demarcar.', 'info'); } setIsToolsOpen(false); } },
            ].map(tool => {
              const Icon = tool.icon;
              const active = activeTool === tool.key;
              return (
                <button
                  key={tool.key}
                  onClick={tool.action}
                  className={`mb-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all duration-150 ${
                    active ? 'bg-[#0F3E8C] text-white shadow-md' : 'text-gray-400 hover:bg-white/[0.08] hover:text-white'
                  }`}
                  title={tool.label}
                >
                  <Icon size={15} className={active ? 'text-[#F4B205] shrink-0' : 'shrink-0'} />
                  <span className="text-xs font-medium truncate">{tool.label}</span>
                </button>
              );
            })}

            <div className="my-1.5 h-px bg-white/10 mx-1" />

            <button
              onClick={() => { toggle3DCamera(); }}
              className={`mb-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all duration-150 ${viewState.pitch > 20 ? 'bg-[#0F3E8C]/50 text-white' : 'text-gray-400 hover:bg-white/[0.08] hover:text-white'}`}
              title="Alternar perspectiva 2D/3D"
            >
              <span className="w-[15px] text-center text-[11px] font-bold text-[#F4B205] shrink-0">{viewState.pitch > 20 ? '3D' : '2D'}</span>
              <span className="text-xs font-medium">Perspectiva {viewState.pitch > 20 ? '3D' : '2D'}</span>
            </button>

            <button
              onClick={() => { setViewState(prev => ({ ...prev, bearing: 0 })); setIsToolsOpen(false); showToast('Norte redefinido.', 'info'); }}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-gray-400 transition hover:bg-white/[0.08] hover:text-white"
              title="Resetar norte"
            >
              <Compass size={15} className="shrink-0" style={{ transform: `rotate(${-viewState.bearing}deg)` }} />
              <span className="text-xs font-medium">Resetar norte</span>
            </button>
          </div>
        )}
      </div>

      {/* =========================================================================
          BARRA DE AÇÃO DA DEMARCAÇÃO EM ANDAMENTO (QUANDO ATIVA)
          ========================================================================= */}
      {activeTool === 'polygon' && (
        <div 
          style={uiZoomStyle}
          className="ui-scale-target fixed md:absolute bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 liquid-glass rounded-3xl p-3 sm:p-4 border border-[#F4B205]/60 shadow-[0_16px_50px_rgba(0,0,0,0.6)] flex flex-col md:flex-row items-center gap-3 sm:gap-4 anim-slide-up-spring pointer-events-auto max-w-[95vw] md:max-w-[92vw] backdrop-blur-2xl"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0F3E8C]/40 border border-[#F4B205]/60 flex items-center justify-center text-[#F4B205] shadow-[0_0_15px_rgba(244,178,5,0.25)] shrink-0">
              <Hexagon size={20} strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(244,178,5,0.8)]" />
                <p className="text-xs font-bold uppercase tracking-wider text-amber-400">Demarcando Território</p>
              </div>
              <div className="flex items-center gap-2 text-[11px] opacity-80 mt-0.5">
                <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10">
                  Vértices: <strong className="text-white">{polygonDraft.length}</strong>
                </span>
                <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10">
                  Área: <strong className="text-amber-300">{(currentDraftArea / 10000).toFixed(2)} ha</strong>
                </span>
                <span className="hidden sm:inline px-2 py-0.5 rounded-md bg-white/5 border border-white/10">
                  Perímetro: <strong className="text-white">{currentDraftPerimeter.toFixed(2)} km</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={draftTerritoryName}
              onChange={e => setDraftTerritoryName(e.target.value)}
              placeholder="Nome do Território"
              className="bg-white/10 px-3 py-2 rounded-xl text-xs border border-white/20 outline-none w-36 font-semibold focus:border-[#F4B205] focus:bg-black/30 transition-all text-white"
            />
            {/* Paleta Rápida NUGEP */}
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl bg-black/30 border border-white/10">
              {NUGEP_COLOR_PRESETS.map(preset => (
                <button
                  key={preset.hex}
                  type="button"
                  onClick={() => setDraftTerritoryColor(preset.hex)}
                  className={`w-5 h-5 rounded-full transition-all duration-200 hover:scale-125 border ${
                    draftTerritoryColor === preset.hex ? 'ring-2 ring-white scale-110 border-white shadow-[0_0_8px_rgba(255,255,255,0.6)]' : 'border-black/30 opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: preset.hex }}
                  title={preset.name}
                />
              ))}
            </div>
            <input
              type="color"
              value={draftTerritoryColor}
              onChange={e => setDraftTerritoryColor(e.target.value)}
              className="w-8 h-8 rounded-xl bg-transparent cursor-pointer border border-white/20"
              title="Cor customizada"
            />
            {polygonDraft.length > 0 && (
              <button
                onClick={() => setPolygonDraft(prev => prev.slice(0, -1))}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 text-xs transition-all duration-200 hover:scale-105 active:scale-95"
                title="Desfazer vértice"
              >
                <Undo2 size={16} />
              </button>
            )}
            <button
              onClick={finishPolygonDemarcation}
              disabled={polygonDraft.length < 3}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-[0_0_15px_rgba(16,185,129,0.35)] flex items-center gap-1.5 active:scale-95 hover-lift"
            >
              <Check size={14} />
              <span>Concluir</span>
            </button>
            <button
              onClick={() => {
                setPolygonDraft([]);
                setActiveTool('navigate');
              }}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-gray-300 transition-all duration-200 active:scale-95"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Régua de Medição Linear */}
      {activeTool === 'measure' && measurementPoints.length > 0 && (
        <div 
          style={uiZoomStyle}
          className="ui-scale-target fixed md:absolute bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 liquid-glass rounded-3xl px-5 py-3 border border-[#F4B205]/40 shadow-[0_16px_50px_rgba(0,0,0,0.6)] flex items-center gap-4 anim-slide-up-spring pointer-events-auto backdrop-blur-2xl"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#0F3E8C]/30 border border-[#F4B205]/40 flex items-center justify-center text-[#F4B205]">
              <Ruler size={16} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#F4B205] font-bold">Distância Linear</p>
              <p className="text-lg font-bold text-white tracking-wide">
                {currentDistance < 1 
                  ? `${(currentDistance * 1000).toFixed(0)} m` 
                  : `${currentDistance.toFixed(2)} km`}
              </p>
            </div>
          </div>
          <button
            onClick={() => setMeasurementPoints([])}
            className="p-2 rounded-xl bg-white/10 hover:bg-red-500/20 text-gray-300 hover:text-red-400 transition-all duration-200 hover:scale-105 active:scale-95"
            title="Limpar medição"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}

      {/* =========================================================================
          MOTOR MAPBOX GL 3D (CANVAS PRINCIPAL)
          ========================================================================= */}
      <div className="w-full h-full relative cursor-default" style={{ cursor: activeTool === 'polygon' || activeTool === 'point' ? 'crosshair' : 'default' }}>
        <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          {...viewState}
          onMove={evt => setViewState(evt.viewState)}
          onClick={handleMapClick}
          interactiveLayerIds={activeLayers.includes('markers') ? ['point-clusters', 'unclustered-points'] : []}
          onDblClick={(e) => {
            if (activeTool === 'polygon' && polygonDraft.length >= 3) {
              e.preventDefault();
              finishPolygonDemarcation();
            }
          }}
          mapStyle={mapStyleUrl}
          terrain={activeLayers.includes('relevo') ? { source: 'mapbox-dem', exaggeration: 1.8 } : undefined}
          preserveDrawingBuffer={true}
          projection={{ name: 'globe' }}
          minZoom={2}
          fog={activeLayers.includes('atmosphere') ? {
            range: [0.5, 8],
            color: isDark ? '#101726' : '#d4e4fa',
            'high-color': isDark ? '#1e293b' : '#60a5fa',
            'space-color': '#020408',
            'star-intensity': 0.95,
            'horizon-blend': 0.3
          } : undefined}
        >
          <NavigationControl position="bottom-right" />

          {/* DEM de Relevo Topográfico 3D (Montanhas e Elevações Reais) */}
          <Source 
            id="mapbox-dem" 
            type="raster-dem" 
            url="mapbox://mapbox.mapbox-terrain-dem-v1" 
            tileSize={512} 
            maxzoom={14} 
          />

          {/* Céu e Atmosfera 3D */}
          {activeLayers.includes('atmosphere') && (
            <Layer
              id="sky"
              type="sky"
              paint={{
                'sky-type': 'atmosphere',
                'sky-atmosphere-sun': [0.0, 90.0],
                'sky-atmosphere-sun-intensity': 15,
                'sky-atmosphere-halo-color': isDark ? 'rgba(244, 178, 5, 0.35)' : 'rgba(255, 255, 255, 0.75)',
                'sky-atmosphere-color': isDark ? 'rgba(15, 62, 140, 0.85)' : 'rgba(186, 230, 253, 0.85)'
              }}
            />
          )}

          {/* Prédios e Edificações em 3D (Extrusão Volumétrica e Sombreamento na Paleta Oficial NUGEP) */}
          {activeLayers.includes('buildings') && (
            <Layer
              id="3d-buildings"
              source="composite"
              source-layer="building"
              type="fill-extrusion"
              minzoom={11}
              paint={{
                'fill-extrusion-color': [
                  'interpolate',
                  ['linear'],
                  ['coalesce', ['get', 'height'], 15],
                  0, isDark ? '#162b55' : '#cbd5e1',
                  25, isDark ? '#0F3E8C' : '#93c5fd',
                  60, isDark ? '#1E4DB7' : '#3b82f6',
                  120, isDark ? '#F57602' : '#ea580c',
                  200, isDark ? '#F4B205' : '#d97706'
                ],
                'fill-extrusion-height': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  11, 0,
                  12, ['coalesce', ['get', 'height'], 16]
                ],
                'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
                'fill-extrusion-opacity': 0.88,
                'fill-extrusion-ambient-occlusion-intensity': 0.65
              }}
            />
          )}

          {/* Territórios Demarcados Salvos */}
          {activeLayers.includes('territories') && demarcatedTerritories.length > 0 && (
            <Source id="demarcated-territories-src" type="geojson" data={territoriesGeoJSON as any}>
              <Layer
                id="territories-fill"
                type="fill"
                paint={{
                  'fill-color': ['get', 'cor'],
                  'fill-opacity': 0.35
                }}
              />
              <Layer
                id="territories-line"
                type="line"
                paint={{
                  'line-color': ['get', 'cor'],
                  'line-width': 3,
                  'line-dasharray': [2, 1]
                }}
              />
            </Source>
          )}

          {/* Rascunho de Demarcação: Polígono Preenchido */}
          {draftPolygonGeoJSON && (
            <Source id="draft-polygon-src" type="geojson" data={draftPolygonGeoJSON as any}>
              <Layer
                id="draft-fill"
                type="fill"
                paint={{
                  'fill-color': draftTerritoryColor,
                  'fill-opacity': 0.35
                }}
              />
            </Source>
          )}

          {/* Rascunho de Demarcação: Linha Perimetral */}
          {draftLineGeoJSON && (
            <Source id="draft-line-src" type="geojson" data={draftLineGeoJSON as any}>
              <Layer
                id="draft-line"
                type="line"
                paint={{
                  'line-color': draftTerritoryColor,
                  'line-width': 2.5,
                  'line-dasharray': [3, 2]
                }}
              />
            </Source>
          )}

          {/* Rascunho: Vértices Numerados */}
          {polygonDraft.map((pt, i) => (
            <Marker key={`draft_pt_${i}`} longitude={pt[0]} latitude={pt[1]} anchor="center">
              <div className="w-5 h-5 rounded-full bg-white border-2 border-[#0F3E8C] shadow-2xl flex items-center justify-center text-[9px] font-black text-[#0F3E8C]">
                {i + 1}
              </div>
            </Marker>
          ))}

          {/* Rota de Medição */}
          {measurementPoints.length > 0 && (
            <Source id="measure-source" type="geojson" data={measurementGeoJSON as any}>
              <Layer 
                id="measure-line" 
                type="line" 
                paint={{ 
                  'line-color': '#F4B205', 
                  'line-width': 3, 
                  'line-dasharray': [2, 2] 
                }} 
              />
              {measurementPoints.map((pt, i) => (
                <Marker key={`meas_${i}`} longitude={pt[0]} latitude={pt[1]}>
                  <div className="w-2.5 h-2.5 bg-white border-2 border-[#F4B205] rounded-full shadow-lg" />
                </Marker>
              ))}
            </Source>
          )}

          {/* Pontos georreferenciados: agrupados para manter o mapa rápido em importações grandes. */}
          {activeLayers.includes('markers') && (
            <Source id="points-source" type="geojson" data={pointsGeoJSON as any} cluster clusterMaxZoom={14} clusterRadius={52}>
              <Layer
                id="point-clusters"
                type="circle"
                filter={['has', 'point_count']}
                paint={{
                  'circle-color': isDark ? '#0F3E8C' : '#1E4DB7',
                  'circle-radius': ['step', ['get', 'point_count'], 18, 20, 22, 100, 28],
                  'circle-opacity': 0.92,
                  'circle-stroke-width': 2,
                  'circle-stroke-color': '#F4B205'
                }}
              />
              <Layer
                id="point-cluster-count"
                type="symbol"
                filter={['has', 'point_count']}
                layout={{ 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'], 'text-size': 12 }}
                paint={{ 'text-color': '#FFFFFF' }}
              />
              <Layer
                id="unclustered-points"
                type="circle"
                filter={['!', ['has', 'point_count']]}
                paint={{
                  'circle-color': selectedPoint ? ['case', ['==', ['get', 'id'], selectedPoint.id], '#F4B205', '#0F3E8C'] : '#0F3E8C',
                  'circle-radius': selectedPoint ? ['case', ['==', ['get', 'id'], selectedPoint.id], 9, 6] : 6,
                  'circle-stroke-width': 2,
                  'circle-stroke-color': '#FFFFFF',
                  'circle-opacity': 0.96
                }}
              />
              <Layer
                id="point-labels"
                type="symbol"
                minzoom={14}
                filter={['!', ['has', 'point_count']]}
                layout={{
                  'text-field': ['get', 'title'],
                  'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
                  'text-size': 11,
                  'text-offset': [0, 1.25],
                  'text-anchor': 'top',
                  'text-max-width': 14
                }}
                paint={{ 'text-color': isDark ? '#FFFFFF' : '#0F172A', 'text-halo-color': isDark ? '#050608' : '#FFFFFF', 'text-halo-width': 1.2 }}
              />
            </Source>
          )}

          {searchedLocation && (
            <Marker longitude={searchedLocation.lng} latitude={searchedLocation.lat} anchor="bottom">
              <div className="relative flex flex-col items-center pointer-events-none">
                <div className="absolute -top-2 w-10 h-10 rounded-full bg-[#F4B205]/25 animate-ping" />
                <div className="relative w-9 h-9 rounded-full bg-[#F4B205] text-[#0F3E8C] border-2 border-white shadow-xl flex items-center justify-center">
                  <Search size={16} strokeWidth={3} />
                </div>
                <div className="mt-1 max-w-56 px-2.5 py-1 rounded-lg bg-[#050608]/90 text-[10px] font-bold text-white border border-[#F4B205]/60 shadow-xl flex flex-col items-center text-center backdrop-blur-md">
                  <span className="truncate max-w-full">{searchedLocation.label}</span>
                  {searchedLocation.category && (
                    <span className="text-[8.5px] text-[#F4B205] font-semibold tracking-wide uppercase mt-0.5">
                      {searchedLocation.category}
                    </span>
                  )}
                </div>
              </div>
            </Marker>
          )}

          {/* Badges Interativas nos Territórios Salvos */}
          {activeLayers.includes('territories') && demarcatedTerritories.filter(t => t.visivel && t.pontos.length >= 3).map(terr => {
            const lats = terr.pontos.map(p => p[1]);
            const lngs = terr.pontos.map(p => p[0]);
            const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
            const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
            return (
              <Marker 
                key={`badge_${terr.id}`} 
                longitude={centerLng} 
                latitude={centerLat}
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setActiveTerritory(terr);
                }}
              >
                <div 
                  className="px-3 py-1.5 rounded-full liquid-glass border border-white/30 text-xs font-bold tracking-wide shadow-2xl cursor-pointer hover:scale-110 transition-transform flex items-center gap-1.5"
                  style={{ borderColor: terr.cor }}
                >
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: terr.cor }} />
                  <span>{terr.nome}</span>
                  <span className="opacity-70 font-mono text-[10px]">({terr.areaHectares} ha)</span>
                </div>
              </Marker>
            );
          })}
        </Map>

      </div>

      {/* =========================================================================
          PAINEL DO TERRITÓRIO DEMARCADO
          ========================================================================= */}
      {activeTerritory && (
        <aside 
          style={uiZoomStyle}
          className="ui-scale-target fixed md:absolute bottom-20 md:bottom-4 inset-x-2 md:inset-x-auto md:left-20 md:top-[92px] md:w-96 max-h-[72vh] md:max-h-[calc(100vh-6.5rem)] liquid-glass rounded-2xl p-4 sm:p-5 border border-[#F4B205]/40 shadow-2xl z-40 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 md:slide-in-from-left-4 duration-300 pointer-events-auto origin-bottom-left md:origin-top-left"
        >
          <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: activeTerritory.cor }} />
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Território Demarcado</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleDeleteActiveTerritory}
                className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition"
                title="Excluir Território"
              >
                <Trash2 size={15} />
              </button>
              <button onClick={() => setActiveTerritory(null)} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-4">
            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider opacity-50 block mb-1">Nome do Território</label>
              <input
                type="text"
                value={activeTerritory.nome}
                onChange={e => {
                  const updated = { ...activeTerritory, nome: e.target.value };
                  setActiveTerritory(updated);
                  setDemarcatedTerritories(prev => prev.map(t => t.id === activeTerritory.id ? updated : t));
                }}
                className="w-full bg-white/10 rounded-xl px-3 py-2 text-sm font-bold border border-white/15 outline-none focus:border-[#F4B205]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-50">Cor da Demarcação</label>
                <span className="text-[10px] opacity-70 font-mono">{activeTerritory.cor}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={activeTerritory.cor}
                  onChange={e => {
                    const updated = { ...activeTerritory, cor: e.target.value };
                    setActiveTerritory(updated);
                    setDemarcatedTerritories(prev => prev.map(t => t.id === activeTerritory.id ? updated : t));
                  }}
                  className="w-8 h-8 rounded-xl bg-transparent cursor-pointer border border-white/20"
                />
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-black/20 border border-white/10">
                  {NUGEP_COLOR_PRESETS.map(preset => (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => {
                        const updated = { ...activeTerritory, cor: preset.hex };
                        setActiveTerritory(updated);
                        setDemarcatedTerritories(prev => prev.map(t => t.id === activeTerritory.id ? updated : t));
                      }}
                      className={`w-5 h-5 rounded-full transition-transform hover:scale-125 border ${
                        activeTerritory.cor === preset.hex ? 'ring-2 ring-white scale-110 border-white' : 'border-black/30'
                      }`}
                      style={{ backgroundColor: preset.hex }}
                      title={preset.name}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400 block">Métricas Geodésicas</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="opacity-60 block text-[10px]">Área em Hectares</span>
                  <span className="font-bold text-amber-300 text-sm">{activeTerritory.areaHectares} ha</span>
                </div>
                <div>
                  <span className="opacity-60 block text-[10px]">Área em km²</span>
                  <span className="font-bold text-white text-sm">{activeTerritory.areaKm2} km²</span>
                </div>
                <div>
                  <span className="opacity-60 block text-[10px]">Área em m²</span>
                  <span className="font-bold text-white text-xs">{activeTerritory.areaM2.toLocaleString('pt-BR')} m²</span>
                </div>
                <div>
                  <span className="opacity-60 block text-[10px]">Perímetro Total</span>
                  <span className="font-bold text-white text-xs">{activeTerritory.perimetroKm} km</span>
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider opacity-50 block mb-1">Descrição / Parecer Técnico</label>
              <textarea
                value={activeTerritory.descricao || ''}
                onChange={e => {
                  const updated = { ...activeTerritory, descricao: e.target.value };
                  setActiveTerritory(updated);
                  setDemarcatedTerritories(prev => prev.map(t => t.id === activeTerritory.id ? updated : t));
                }}
                rows={3}
                placeholder="Parecer técnico ou histórico do território..."
                className="w-full bg-white/10 rounded-xl p-3 text-xs border border-white/10 outline-none resize-none custom-scrollbar"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider opacity-50 block mb-1">
                Vértices do Perímetro ({activeTerritory.pontos.length})
              </label>
              <div className="max-h-32 overflow-y-auto custom-scrollbar rounded-xl border border-white/10 bg-black/20 p-2 font-mono text-[11px] space-y-1">
                {activeTerritory.pontos.map((p, idx) => (
                  <div key={idx} className="flex justify-between border-b border-white/5 py-0.5">
                    <span className="opacity-50">V{idx + 1}</span>
                    <span className="text-amber-300">{p[1].toFixed(5)}°, {p[0].toFixed(5)}°</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 shrink-0">
            <button
              onClick={() => handleExportTerritoryPDF(activeTerritory)}
              className="w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-[#0F3E8C] hover:bg-[#1E4DB7] text-white border border-[#F4B205]/40 transition-all duration-300 flex items-center justify-center gap-2 active:scale-90 shadow-md hover-lift btn-ripple"
            >
              <Download size={14} className="text-[#F4B205]" />
              <span>Exportar em PDF</span>
            </button>
          </div>
        </aside>
      )}

      {/* PAINEL DE PROPRIEDADES DO PONTO */}
      {selectedPoint && (
        <aside 
          style={uiZoomStyle}
          className="ui-scale-target fixed md:absolute bottom-20 md:bottom-4 inset-x-2 md:inset-x-auto md:left-20 md:top-[92px] md:w-96 max-h-[72vh] md:max-h-[calc(100vh-6.5rem)] liquid-glass rounded-2xl p-4 sm:p-5 border border-[#F4B205]/40 shadow-2xl z-40 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 md:slide-in-from-left-4 duration-300 pointer-events-auto origin-bottom-left md:origin-top-left"
        >
          <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-[#F4B205]" />
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Ponto Marcado</span>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => handleDeleteActivePoint()} 
                className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition" 
                title="Excluir Ponto"
              >
                <Trash2 size={15} />
              </button>
              <button onClick={() => setSelectedPoint(null)} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-3.5">
            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider opacity-50 block mb-1">Título do Ponto</label>
              <input
                type="text"
                value={selectedPoint.titulo}
                onChange={e => {
                  const updated = { ...selectedPoint, titulo: e.target.value };
                  setSelectedPoint(updated);
                  setObjetos(prev => prev.map(o => o.id === selectedPoint.id ? updated : o));
                }}
                className="w-full bg-white/10 rounded-xl px-3 py-2 text-sm font-bold border border-white/15 outline-none focus:border-[#F4B205]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-50 block mb-1">Classificação / Tipo</label>
                <input
                  type="text"
                  value={selectedPoint.objeto || ''}
                  placeholder="Ex: Patrimônio Histórico"
                  onChange={e => {
                    const updated = { ...selectedPoint, objeto: e.target.value };
                    setSelectedPoint(updated);
                    setObjetos(prev => prev.map(o => o.id === selectedPoint.id ? updated : o));
                  }}
                  className="w-full bg-white/10 rounded-xl px-3 py-2 text-xs border border-white/10 outline-none focus:border-[#F4B205]"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-50 block mb-1">Autor / Localidade</label>
                <input
                  type="text"
                  value={selectedPoint.autor || ''}
                  placeholder="Ex: Santana do Ipanema"
                  onChange={e => {
                    const updated = { ...selectedPoint, autor: e.target.value };
                    setSelectedPoint(updated);
                    setObjetos(prev => prev.map(o => o.id === selectedPoint.id ? updated : o));
                  }}
                  className="w-full bg-white/10 rounded-xl px-3 py-2 text-xs border border-white/10 outline-none focus:border-[#F4B205]"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-black/20 border border-white/10 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase font-bold tracking-wider opacity-50">Coordenadas Oficiais</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`${selectedPoint.latitude.toFixed(6)}, ${selectedPoint.longitude.toFixed(6)}`);
                    showToast('Coordenadas copiadas!', 'info');
                  }}
                  className="text-[10px] text-[#F4B205] hover:underline"
                >
                  Copiar
                </button>
              </div>
              <p className="font-mono text-amber-300 font-semibold">{selectedPoint.latitude.toFixed(6)}°, {selectedPoint.longitude.toFixed(6)}°</p>
              <p className="text-[10px] opacity-40 mt-0.5">Datum SIRGAS 2000 / WGS 84</p>
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider text-amber-400 block mb-1">
                Anotações e Parecer Técnico de Campo
              </label>
              <textarea
                value={selectedPoint.anotacoes || ''}
                onChange={e => {
                  const updated = { ...selectedPoint, anotacoes: e.target.value };
                  setSelectedPoint(updated);
                  setObjetos(prev => prev.map(o => o.id === selectedPoint.id ? updated : o));
                }}
                rows={4}
                placeholder="Insira anotações de campo, observações históricas, referências de tombamento ou parecer técnico..."
                className="w-full bg-white/10 rounded-xl p-3 text-xs border border-white/10 outline-none focus:border-[#F4B205] resize-none custom-scrollbar"
              />
            </div>

            {selectedPoint.extraProps && Object.keys(selectedPoint.extraProps).some(key => !key.startsWith('_')) && (
              <div className="pt-3 border-t border-white/10">
                <span className="text-[10px] uppercase font-bold tracking-wider opacity-50 block mb-2">Dados originais da planilha</span>
                <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-1 text-[11px]">
                  {Object.entries(selectedPoint.extraProps)
                    .filter(([key, value]) => !key.startsWith('_') && value !== '' && value !== null && value !== undefined)
                    .map(([key, value]) => (
                      <div key={key} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2 py-1 border-b border-white/5">
                        <span className="opacity-55 truncate" title={key}>{key}</span>
                        <span className="text-gray-200 break-words">{String(value)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-white/10 shrink-0">
            <button
              onClick={() => handleExportPointPDF(selectedPoint)}
              className="w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-[#0F3E8C] hover:bg-[#1E4DB7] text-white border border-[#F4B205]/40 transition-all duration-300 flex items-center justify-center gap-2 active:scale-90 shadow-md hover-lift btn-ripple"
            >
              <Download size={14} className="text-[#F4B205]" />
              <span>Exportar em PDF</span>
            </button>
          </div>
        </aside>
      )}

      {/* =========================================================================
          MODAIS E DRAWERS
          ========================================================================= */}

      {/* 1. LISTA DE TERRITÓRIOS E PONTOS DEMARCADOS */}
      {activeModal === 'territories_list' && (
        <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 modal-backdrop-enter">
          <div 
            style={uiZoomStyle}
            className="ui-scale-target liquid-glass rounded-3xl p-4 sm:p-6 w-[94vw] sm:w-full max-w-lg border border-white/20 shadow-2xl relative max-h-[86vh] flex flex-col modal-content-enter overflow-hidden"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0 mb-3">
              <div className="flex items-center gap-2.5">
                <Hexagon size={20} className="text-[#F4B205]" />
                <h3 className="font-bold text-base sm:text-lg">Demarcações do Sistema</h3>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-1.5 hover:bg-white/10 rounded-xl transition-all duration-300 hover:rotate-90 hover:scale-110">
                <X size={18} />
              </button>
            </div>

            {/* ABAS DE NAVEGAÇÃO */}
            <div className="flex gap-2 p-1 bg-white/5 rounded-2xl mb-3 shrink-0">
              <button
                onClick={() => setTerritoriesListTab('territories')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  territoriesListTab === 'territories'
                    ? 'bg-[#0F3E8C] text-[#F4B205] border border-[#F4B205]/40 shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Hexagon size={14} />
                <span>Territórios ({demarcatedTerritories.length})</span>
              </button>
              <button
                onClick={() => setTerritoriesListTab('points')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  territoriesListTab === 'points'
                    ? 'bg-[#0F3E8C] text-[#F4B205] border border-[#F4B205]/40 shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <MapPin size={14} />
                <span>Pontos ({objetos.length})</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2.5">
              {territoriesListTab === 'territories' ? (
                demarcatedTerritories.length === 0 ? (
                  <div className="py-12 text-center opacity-60 anim-fade-blur">
                    <Hexagon size={36} className="mx-auto mb-2 opacity-40 text-[#F4B205] anim-float" />
                    <p className="text-xs">Nenhum território demarcado ainda.</p>
                    <p className="text-[11px] opacity-75 mt-1">Use a ferramenta de polígono no canto direito para traçar um perímetro ou importe uma planilha.</p>
                  </div>
                ) : (
                  demarcatedTerritories.map((terr, idx) => (
                    <div 
                      key={terr.id} 
                      onClick={() => {
                        setActiveTerritory(terr);
                        const lats = terr.pontos.map(p => p[1]);
                        const lngs = terr.pontos.map(p => p[0]);
                        const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
                        const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
                        setViewState(prev => ({ ...prev, latitude: centerLat, longitude: centerLng, zoom: 15 }));
                        setActiveModal(null);
                      }}
                      className={`p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-3 hover:bg-white/10 cursor-pointer transition-all duration-300 group hover-lift hover:border-white/20 anim-stagger-${Math.min(idx + 1, 8)}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-4 h-4 rounded-full shrink-0 transition-transform duration-300 group-hover:scale-125 shadow-sm" style={{ backgroundColor: terr.cor }} />
                        <div className="min-w-0">
                          <h4 className="font-semibold text-sm group-hover:text-amber-300 transition-colors duration-300 truncate">{terr.nome}</h4>
                          <p className="text-[11px] opacity-60 truncate">
                            {terr.areaHectares} hectares | {terr.areaKm2} km² | {terr.pontos.length} vértices
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleExportTerritoryPDF(terr)}
                          className="p-2 rounded-xl bg-[#0F3E8C]/20 hover:bg-[#0F3E8C]/40 text-[#F4B205] text-xs flex items-center gap-1 font-bold transition-all duration-200 hover:scale-110"
                          title="Exportar Dossiê em PDF"
                        >
                          <Download size={14} />
                        </button>

                        <button
                          onClick={() => {
                            setDemarcatedTerritories(prev => prev.filter(t => t.id !== terr.id));
                            if (activeTerritory?.id === terr.id) setActiveTerritory(null);
                            showToast('Território removido.');
                          }}
                          className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition-all duration-200 hover:scale-110"
                          title="Excluir"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )
              ) : (
                objetos.length === 0 ? (
                  <div className="py-12 text-center opacity-60 anim-fade-blur">
                    <MapPin size={36} className="mx-auto mb-2 opacity-40 text-[#F4B205] anim-float" />
                    <p className="text-xs">Nenhum ponto registrado ainda.</p>
                    <p className="text-[11px] opacity-75 mt-1">Use a ferramenta de marcador no canto direito ou importe uma planilha para registrar pontos.</p>
                  </div>
                ) : (
                  objetos.map((obj, idx) => (
                    <div 
                      key={obj.id} 
                      onClick={() => {
                        setSelectedPoint(obj);
                        setViewState(prev => ({ ...prev, latitude: obj.latitude, longitude: obj.longitude, zoom: 16 }));
                        setActiveModal(null);
                      }}
                      className={`p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-3 hover:bg-white/10 cursor-pointer transition-all duration-300 group hover-lift hover:border-white/20 anim-stagger-${Math.min(idx + 1, 8)}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-[#0F3E8C]/20 border border-[#F4B205]/40 flex items-center justify-center text-[#F4B205] shrink-0 transition-all duration-300 group-hover:bg-[#0F3E8C]/40 group-hover:border-[#F4B205]/70">
                          <MapPin size={15} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-semibold text-sm group-hover:text-amber-300 transition-colors duration-300 truncate">{obj.titulo}</h4>
                          <p className="text-[11px] opacity-60 truncate">
                            {obj.objeto || 'Ponto'} • {obj.autor || 'Território'} ({obj.latitude.toFixed(4)}, {obj.longitude.toFixed(4)})
                          </p>
                          {obj.anotacoes && (
                            <p className="text-[10px] text-amber-300/80 line-clamp-1 italic mt-0.5">
                              "{obj.anotacoes}"
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleExportPointPDF(obj)}
                          className="p-2 rounded-xl bg-[#0F3E8C]/20 hover:bg-[#0F3E8C]/40 text-[#F4B205] text-xs flex items-center gap-1 font-bold transition-all duration-200 hover:scale-110"
                          title="Exportar PDF deste Ponto"
                        >
                          <Download size={14} />
                        </button>

                        <button
                          onClick={() => handleDeleteActivePoint(obj.id)}
                          className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition-all duration-200 hover:scale-110"
                          title="Excluir"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. MODAL DE EXPORTAÇÃO DO DOSSIÊ COM MARCA D'ÁGUA DO NUGEP */}
      {activeModal === 'export_dossier' && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 modal-backdrop-enter">
          <div 
            style={uiZoomStyle}
            className="ui-scale-target liquid-glass rounded-3xl p-5 sm:p-8 w-full max-w-3xl max-h-[92vh] border border-[#F4B205]/40 shadow-2xl flex flex-col overflow-hidden relative watermark-nugep modal-content-enter"
          >
            
            <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-black/40 border border-[#F4B205]/40 flex items-center justify-center shadow-lg shrink-0 p-1">
                  <img src={NUGEP_LOGO} alt="NUGEP Logo" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-lg tracking-wide">
                    {exportTarget === 'point' ? 'Dossiê do Ponto Georreferenciado • NUGEP MAPS' : 'Dossiê Cartográfico • NUGEP MAPS'}
                  </h3>
                  <p className="text-[11px] sm:text-xs opacity-60">
                    {exportTarget === 'point'
                      ? 'Registro Oficial de Ponto Georreferenciado com Marca d\'Água do Núcleo'
                      : 'Documento Oficial de Demarcação Territorial com Marca d\'Água do Núcleo'}
                  </p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-2 hover:bg-white/10 rounded-xl">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar my-3 sm:my-4 space-y-3.5 pr-1">
              {/* Snapshot do Mapa */}
              <div className="w-full h-44 sm:h-56 rounded-2xl overflow-hidden border border-white/15 bg-black/40 relative flex items-center justify-center">
                {printImage ? (
                  <img src={printImage} alt="Snapshot Cartográfico" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2 opacity-50">
                    <Globe size={32} />
                    <p className="text-xs">Gerando visualização cartográfica...</p>
                  </div>
                )}
                <div className="absolute bottom-2.5 right-2.5 px-3 py-1 rounded-lg liquid-glass border border-white/20 text-[10px] font-mono flex items-center gap-1.5 shadow-xl">
                  <ShieldCheck size={12} className="text-emerald-400" />
                  <span>NUGEP MAPS • HOMOLOGADO</span>
                </div>
              </div>

              {/* Informações: Ponto ou Território */}
              {exportTarget === 'point' && selectedPoint ? (
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400">Ponto Cartográfico</span>
                      <h4 className="text-base font-bold text-white">{selectedPoint.titulo}</h4>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">Classificação</span>
                      <p className="text-sm font-black text-amber-300">{selectedPoint.objeto || 'Registro Georreferenciado'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-white/10 text-xs">
                    <div>
                      <span className="opacity-60 block text-[10px] uppercase">Autor / Região</span>
                      <span className="font-bold">{selectedPoint.autor || 'Território NUGEP'}</span>
                    </div>
                    <div>
                      <span className="opacity-60 block text-[10px] uppercase">Ano / Registro</span>
                      <span className="font-bold">{selectedPoint.ano || new Date().getFullYear()}</span>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <span className="opacity-60 block text-[10px] uppercase">Sistema Geodésico</span>
                      <span className="font-bold">SIRGAS 2000 / WGS 84</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-black/20 border border-white/10 font-mono text-xs flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-gray-400 block uppercase">Coordenadas Oficiais</span>
                      <span className="text-amber-300 font-bold">{selectedPoint.latitude.toFixed(6)}°, {selectedPoint.longitude.toFixed(6)}°</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(`${selectedPoint.latitude.toFixed(6)}, ${selectedPoint.longitude.toFixed(6)}`);
                        showToast('Coordenadas copiadas!', 'info');
                      }}
                      className="text-[11px] text-[#F4B205] hover:underline"
                    >
                      Copiar
                    </button>
                  </div>

                  <div className="pt-2 border-t border-white/10">
                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-1">
                      Anotações e Parecer Técnico de Campo
                    </span>
                    <div className="p-3 rounded-xl bg-black/20 border border-white/10 text-xs text-gray-200 leading-relaxed whitespace-pre-wrap">
                      {selectedPoint.anotacoes || 'Sem anotações complementares registradas para este ponto.'}
                    </div>
                  </div>
                </div>
              ) : activeTerritory ? (
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400">Território Analisado</span>
                      <h4 className="text-base font-bold text-white">{activeTerritory.nome}</h4>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">Área Homologada</span>
                      <p className="text-base font-black text-amber-300">{activeTerritory.areaHectares} ha</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/10 text-xs">
                    <div>
                      <span className="opacity-60 block text-[10px] uppercase">Área em km²</span>
                      <span className="font-bold">{activeTerritory.areaKm2} km²</span>
                    </div>
                    <div>
                      <span className="opacity-60 block text-[10px] uppercase">Área em m²</span>
                      <span className="font-bold">{activeTerritory.areaM2.toLocaleString('pt-BR')} m²</span>
                    </div>
                    <div>
                      <span className="opacity-60 block text-[10px] uppercase">Perímetro</span>
                      <span className="font-bold">{activeTerritory.perimetroKm} km</span>
                    </div>
                    <div>
                      <span className="opacity-60 block text-[10px] uppercase">Vértices</span>
                      <span className="font-bold">{activeTerritory.pontos.length} coordenadas</span>
                    </div>
                  </div>

                  {activeTerritory.descricao && (
                    <div className="pt-2 border-t border-white/10">
                      <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-1">
                        Parecer Técnico / Descrição
                      </span>
                      <p className="text-xs text-gray-200">{activeTerritory.descricao}</p>
                    </div>
                  )}

                  <div className="pt-2 border-t border-white/10">
                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-1">
                      Coordenadas dos Vértices Perimetrais (Datum SIRGAS 2000 / WGS 84)
                    </span>
                    <div className="max-h-28 overflow-y-auto custom-scrollbar font-mono text-[11px] divide-y divide-white/5">
                      {activeTerritory.pontos.map((p, idx) => (
                        <div key={idx} className="flex justify-between py-0.5">
                          <span className="opacity-50">V{idx + 1}</span>
                          <span className="text-amber-300">{p[1].toFixed(6)}°</span>
                          <span className="text-amber-300">{p[0].toFixed(6)}°</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-xs text-amber-300">
                  Nenhum registro selecionado para exportação.
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-white/10 shrink-0 flex items-center justify-between gap-3">
              <span className="text-xs opacity-60 hidden sm:inline">
                A marca d'água oficial do NUGEP é aplicada no fundo da impressão.
              </span>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-gray-300 transition-all flex-1 sm:flex-initial"
                >
                  Fechar
                </button>
                <button
                  onClick={triggerNativePrint}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#0F3E8C] hover:bg-[#1E4DB7] text-white border border-[#F4B205]/40 transition-all duration-300 shadow-md active:scale-90 flex items-center justify-center gap-2 flex-1 sm:flex-initial hover-lift btn-ripple"
                >
                  <Download size={16} className="text-[#F4B205]" />
                  <span>Exportar em PDF</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. MODAL DE CAMADAS 3D E SATÉLITE */}
      {activeModal === 'layers' && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 modal-backdrop-enter">
          <div 
            style={uiZoomStyle}
            className="ui-scale-target liquid-glass rounded-3xl p-6 w-full max-w-md border border-white/20 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar modal-content-enter"
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
              <div className="flex items-center gap-2">
                <Layers size={20} className="text-[#F4B205]" />
                <h3 className="font-bold text-base">Camadas e Perspectiva 3D</h3>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-1.5 hover:bg-white/10 rounded-xl transition-all duration-300 hover:rotate-90 hover:scale-110">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Espectro Base */}
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-2">Base Cartográfica</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      if (!activeLayers.includes('satellite')) setActiveLayers(prev => [...prev, 'satellite']);
                    }}
                    className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-2 transition-all ${
                      activeLayers.includes('satellite')
                        ? 'bg-[#0F3E8C]/30 border-[#F4B205] text-[#F4B205]'
                        : 'bg-white/5 border-white/10 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <Globe size={24} />
                    <span>Satélite HD 3D</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveLayers(prev => prev.filter(l => l !== 'satellite'));
                    }}
                    className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-2 transition-all ${
                      !activeLayers.includes('satellite')
                        ? 'bg-[#0F3E8C]/30 border-[#F4B205] text-[#F4B205]'
                        : 'bg-white/5 border-white/10 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <Building2 size={24} />
                    <span>{isDark ? 'Dark 3D' : 'Light 3D'}</span>
                  </button>
                </div>
              </div>

              {/* Toggles de Modelagem 3D */}
              <div className="space-y-2 pt-1">
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-1">Modelagem Tridimensional Ativa</label>

                {/* Prédios e Edificações 3D */}
                <div 
                  onClick={() => toggleLayer('buildings')}
                  className="flex items-center justify-between p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3">
                    <Building2 size={18} className="text-indigo-400" />
                    <div>
                      <p className="text-xs font-semibold">Prédios e Edificações 3D</p>
                      <p className="text-[10px] opacity-60">Extrusão volumétrica de edifícios urbanos</p>
                    </div>
                  </div>
                  <div className={`w-10 h-6 rounded-full p-1 transition-colors ${activeLayers.includes('buildings') ? 'bg-[#0F3E8C]' : 'bg-white/20'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${activeLayers.includes('buildings') ? 'translate-x-4' : ''}`} />
                  </div>
                </div>

                {/* Céu e Atmosfera */}
                <div 
                  onClick={() => toggleLayer('atmosphere')}
                  className="flex items-center justify-between p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3">
                    <CloudSun size={18} className="text-amber-400" />
                    <div>
                      <p className="text-xs font-semibold">Céu, Sol e Atmosfera 3D</p>
                      <p className="text-[10px] opacity-60">Iluminação celestial, horizonte e estrelas</p>
                    </div>
                  </div>
                  <div className={`w-10 h-6 rounded-full p-1 transition-colors ${activeLayers.includes('atmosphere') ? 'bg-[#0F3E8C]' : 'bg-white/20'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${activeLayers.includes('atmosphere') ? 'translate-x-4' : ''}`} />
                  </div>
                </div>

                {/* Relevo Topográfico */}
                <div 
                  onClick={() => toggleLayer('relevo')}
                  className="flex items-center justify-between p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3">
                    <Mountain size={18} className="text-emerald-400" />
                    <div>
                      <p className="text-xs font-semibold">Alto Relevo Topográfico (DEM 1.8x)</p>
                      <p className="text-[10px] opacity-60">Montanhas e vales em relevo real</p>
                    </div>
                  </div>
                  <div className={`w-10 h-6 rounded-full p-1 transition-colors ${activeLayers.includes('relevo') ? 'bg-[#0F3E8C]' : 'bg-white/20'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${activeLayers.includes('relevo') ? 'translate-x-4' : ''}`} />
                  </div>
                </div>

                <div className="pt-2">
                  <label className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-1">Dados do Projeto</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => toggleLayer('markers')} className={`p-3 rounded-2xl border text-left transition-all ${activeLayers.includes('markers') ? 'bg-[#0F3E8C]/25 border-[#F4B205]/50' : 'bg-white/5 border-white/10 opacity-60'}`}>
                      <MapPin size={16} className="text-[#F4B205] mb-1" />
                      <span className="block text-xs font-bold">Pontos</span>
                      <span className="text-[10px] opacity-60">{objetos.length} visíveis</span>
                    </button>
                    <button onClick={() => toggleLayer('territories')} className={`p-3 rounded-2xl border text-left transition-all ${activeLayers.includes('territories') ? 'bg-[#0F3E8C]/25 border-[#F4B205]/50' : 'bg-white/5 border-white/10 opacity-60'}`}>
                      <Hexagon size={16} className="text-[#F4B205] mb-1" />
                      <span className="block text-xs font-bold">Territórios</span>
                      <span className="text-[10px] opacity-60">{demarcatedTerritories.length} visíveis</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL DE IMPORTAÇÃO DE PLANILHA */}
      {activeModal === 'spreadsheet' && parsedSpreadsheet && (
        <div className="absolute inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 sm:p-8 modal-backdrop-enter">
          <div 
            style={uiZoomStyle}
            className="ui-scale-target liquid-glass rounded-3xl p-6 sm:p-8 w-full max-w-5xl max-h-[90vh] border border-white/20 shadow-2xl flex flex-col overflow-hidden modal-content-enter"
          >
            {/* Cabeçalho */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-[#0F3E8C]/30 text-[#F4B205] border border-[#F4B205]/30">
                  <FileSpreadsheet size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg">{parsedSpreadsheet.fileName}</h3>
                  <p className="text-xs opacity-60">
                    {parsedSpreadsheet.rows.length} registros ·{' '}
                    {importedCoordinates.length} coordenadas válidas
                  </p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-2 hover:bg-white/10 rounded-xl">
                <X size={20} />
              </button>
            </div>

            <div className={`mt-4 grid grid-cols-1 gap-3 rounded-2xl border p-3 sm:grid-cols-[1fr_auto] ${importedCoordinates.length ? 'border-emerald-400/25 bg-emerald-500/[0.07]' : 'border-amber-400/30 bg-amber-500/[0.08]'}`}>
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${importedCoordinates.length ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'}`}>
                  {importedCoordinates.length ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
                </div>
                <div>
                  <p className="text-xs font-bold text-white">{importedCoordinates.length} de {parsedSpreadsheet.rows.length} registros podem ser posicionados no mapa</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400">Cada ponto mantém os campos da planilha e recebe a anotação geral abaixo. Revise o mapeamento das coordenadas antes de importar.</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400 sm:flex-col sm:items-end">
                <span className="rounded-md bg-black/20 px-2 py-1">1. Mapear</span><span className="text-gray-600">→</span><span className="rounded-md bg-black/20 px-2 py-1">2. Conferir</span><span className="text-gray-600">→</span><span className="rounded-md bg-black/20 px-2 py-1">3. Importar</span>
              </div>
            </div>

            {/* Mapeamento de Colunas */}
            <div className="py-4 grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0 border-b border-white/10">
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-amber-400 block mb-1">{coordinateReference === 'utm' ? 'Norte / Y *' : 'Latitude *'}</label>
                <select
                  value={latColumn}
                  onChange={e => setLatColumn(e.target.value)}
                  disabled={Boolean(coordinateColumn)}
                  className="w-full bg-white/10 border border-amber-400/40 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#F4B205] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <option value="" className="bg-gray-900 text-white">— Selecione a coluna —</option>
                  {parsedSpreadsheet.headers.map(h => (
                    <option key={h} value={h} className="bg-gray-900 text-white">{h}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-amber-400 block mb-1">{coordinateReference === 'utm' ? 'Leste / X *' : 'Longitude *'}</label>
                <select
                  value={lngColumn}
                  onChange={e => setLngColumn(e.target.value)}
                  disabled={Boolean(coordinateColumn)}
                  className="w-full bg-white/10 border border-amber-400/40 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#F4B205] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <option value="" className="bg-gray-900 text-white">— Selecione a coluna —</option>
                  {parsedSpreadsheet.headers.map(h => (
                    <option key={h} value={h} className="bg-gray-900 text-white">{h}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-[#F4B205] block mb-1">Par de coordenadas</label>
                <select
                  value={coordinateColumn}
                  onChange={e => setCoordinateColumn(e.target.value)}
                  disabled={coordinateReference === 'utm'}
                  className="w-full bg-white/10 border border-[#F4B205]/30 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#F4B205] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <option value="" className="bg-gray-900 text-white">— Usar duas colunas —</option>
                  {parsedSpreadsheet.headers.map(h => (
                    <option key={h} value={h} className="bg-gray-900 text-white">{h}</option>
                  ))}
                </select>
                <p className="mt-1 text-[9px] opacity-50">Ex.: “-9.17, -36.06”, DMS ou “9°10&apos;30&quot;S, 36°03&apos;45&quot;W”</p>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-1">Título / Nome</label>
                <select
                  value={titleColumn}
                  onChange={e => setTitleColumn(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs outline-none"
                >
                  <option value="">— Nenhum —</option>
                  {parsedSpreadsheet.headers.map(h => (
                    <option key={h} value={h} className="bg-gray-900 text-white">{h}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-1">Categoria / Tipo</label>
                <select
                  value={categoryColumn}
                  onChange={e => setCategoryColumn(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs outline-none"
                >
                  <option value="">— Nenhum —</option>
                  {parsedSpreadsheet.headers.map(h => (
                    <option key={h} value={h} className="bg-gray-900 text-white">{h}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-1">Descrição / Observação</label>
                <select
                  value={descColumn}
                  onChange={e => setDescColumn(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs outline-none"
                >
                  <option value="">— Nenhum —</option>
                  {parsedSpreadsheet.headers.map(h => (
                    <option key={h} value={h} className="bg-gray-900 text-white">{h}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-[#F4B205] block mb-1">Anotação Geral</label>
                <textarea
                  value={sheetAnnotation}
                  onChange={e => setSheetAnnotation(e.target.value)}
                  placeholder="Adicione uma observação sobre este conjunto de dados..."
                  rows={2}
                  className="w-full bg-white/10 border border-[#F4B205]/30 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#F4B205] resize-none placeholder-white/30"
                />
              </div>

              <div className="col-span-2 sm:col-span-3 flex flex-wrap items-end gap-3 p-3 rounded-xl bg-[#0F3E8C]/15 border border-[#0F3E8C]/30">
                <div className="min-w-[170px]">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-[#F4B205] block mb-1">Sistema de coordenadas</label>
                  <select
                    value={coordinateReference}
                    onChange={e => {
                      const reference = e.target.value as CoordinateReference;
                      setCoordinateReference(reference);
                      if (reference === 'utm') setCoordinateColumn('');
                    }}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs outline-none"
                  >
                    <option value="geographic" className="bg-gray-900 text-white">Geográficas (Latitude / Longitude)</option>
                    <option value="utm" className="bg-gray-900 text-white">UTM (SIRGAS 2000 / WGS 84)</option>
                  </select>
                </div>
                {coordinateReference === 'utm' && <>
                  <div>
                    <label className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-1">Zona</label>
                    <input value={utmZone} onChange={e => setUtmZone(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" className="w-20 bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-1">Hemisfério</label>
                    <select value={utmHemisphere} onChange={e => setUtmHemisphere(e.target.value as 'N' | 'S')} className="bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs outline-none">
                      <option value="S" className="bg-gray-900 text-white">Sul</option>
                      <option value="N" className="bg-gray-900 text-white">Norte</option>
                    </select>
                  </div>
                  <p className="text-[10px] opacity-60 pb-1">Para Alagoas, normalmente: zona 24, hemisfério Sul.</p>
                </>}
              </div>
            </div>

            {/* Modo de importação */}
            <div className="py-3 shrink-0 border-b border-white/10">
              <p className="text-[10px] uppercase font-bold tracking-wider text-gray-500 mb-2">Como importar no mapa</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setImportMode('points')}
                  className={`rounded-xl border p-3 text-left transition ${importMode === 'points' ? 'border-[#F4B205]/60 bg-[#0F3E8C]/30' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin size={15} className="text-[#F4B205]" />
                    <span className="text-xs font-bold">Marcar pontos</span>
                  </div>
                  <p className="text-[10px] text-gray-400">Cada linha vira um marcador com título e anotações no mapa.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('territory')}
                  disabled={importedCoordinates.length < 3}
                  className={`rounded-xl border p-3 text-left transition disabled:opacity-40 disabled:cursor-not-allowed ${importMode === 'territory' ? 'border-[#F4B205]/60 bg-[#0F3E8C]/30' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Hexagon size={15} className="text-[#F4B205]" />
                    <span className="text-xs font-bold">Criar polígono</span>
                  </div>
                  <p className="text-[10px] text-gray-400">Usa os vértices em ordem para demarcar uma área (mín. 3 pontos).</p>
                </button>
              </div>
            </div>

            {/* Tabela de prévia */}
            <div className="flex-1 overflow-auto custom-scrollbar my-4 rounded-2xl border border-white/10 bg-black/20">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-black/80 backdrop-blur-md border-b border-white/10 z-10">
                  <tr>
                    <th className="p-3 font-bold opacity-60 whitespace-nowrap">Coordenadas</th>
                    {parsedSpreadsheet.headers.map(h => (
                      <th key={h} className="p-3 font-bold whitespace-nowrap opacity-80">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {parsedSpreadsheet.rows.slice(0, 50).map((row, rIdx) => {
                    const found = importedCoordinateByRow.get(rIdx);
                    const isValid = Boolean(found);

                    return (
                      <tr key={rIdx} className={`hover:bg-white/5 ${isValid ? '' : 'opacity-40'}`}>
                        <td className="p-3 whitespace-nowrap">
                          {isValid ? (
                            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-mono">
                              {found!.lat.toFixed(5)}, {found!.lng.toFixed(5)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">Inválida</span>
                          )}
                        </td>
                        {parsedSpreadsheet.headers.map(h => (
                          <td key={h} className="p-3 truncate max-w-[160px] opacity-70">
                            {String(row[h] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {parsedSpreadsheet.rows.length > 50 && (
                <p className="text-center text-xs opacity-40 py-3">
                  Mostrando 50 de {parsedSpreadsheet.rows.length} registros. Todos serão importados.
                </p>
              )}
            </div>

            {/* Rodapé com ações */}
            <div className="pt-3 border-t border-white/10 shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <button
                onClick={exportSpreadsheetAsExcel}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border border-[#F4B205]/40 text-[#F4B205] hover:bg-[#F4B205]/10 transition-all"
              >
                <FileSpreadsheet size={14} />
                Exportar validação
              </button>
              <div className="flex items-center gap-2 flex-wrap justify-end w-full sm:w-auto">
                <button
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-gray-300"
                >
                  Cancelar
                </button>
                <button
                  onClick={applySpreadsheet}
                  disabled={!importedCoordinates.length || (importMode === 'territory' && importedCoordinates.length < 3)}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#F4B205] hover:bg-[#fbc337] text-[#0F3E8C] flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40 shadow-md"
                >
                  {importMode === 'points' ? <MapPin size={14} /> : <Hexagon size={14} />}
                  <span>
                    {importMode === 'points'
                      ? `Confirmar — ${importedCoordinates.length} pontos no mapa`
                      : `Confirmar — criar polígono (${importedCoordinates.length} vértices)`}
                  </span>
                </button>
              </div>
            </div>
            {!latColumn && !lngColumn && !coordinateColumn && (
              <p className="mt-2 text-center text-[10px] text-amber-400">⚠ Selecione as colunas de coordenadas acima para continuar.</p>
            )}
            {importMode === 'territory' && (
              <p className="mt-2 text-right text-[10px] text-gray-500">As linhas devem estar na ordem do perímetro para formar a área corretamente.</p>
            )}
          </div>
        </div>
      )}

      {/* 5. MODAL DE CONFIGURAÇÕES */}
      {activeModal === 'settings' && (
        <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 modal-backdrop-enter">
          <div 
            style={uiZoomStyle}
            className="ui-scale-target liquid-glass rounded-3xl p-6 sm:p-8 w-full max-w-md border border-white/20 shadow-2xl relative modal-content-enter"
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
              <div className="flex items-center gap-2">
                <Settings size={20} className="text-[#F4B205]" />
                <h3 className="font-bold text-base sm:text-lg">Configurações</h3>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-1.5 hover:bg-white/10 rounded-xl transition-all duration-300 hover:rotate-90 hover:scale-110">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-2">Tema Visual</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      setTheme('dark');
                      localStorage.setItem('nugep_theme', 'dark');
                    }}
                    className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      theme === 'dark'
                        ? 'bg-[#0F3E8C]/25 border-[#F4B205] text-[#F4B205]'
                        : 'bg-white/5 border-white/10 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <Moon size={16} />
                    <span>Escuro</span>
                  </button>

                  <button
                    onClick={() => {
                      setTheme('light');
                      localStorage.setItem('nugep_theme', 'light');
                    }}
                    className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      theme === 'light'
                        ? 'bg-[#0F3E8C]/25 border-[#F4B205] text-[#F4B205]'
                        : 'bg-white/5 border-white/10 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <Sun size={16} />
                    <span>Claro</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-2">Tamanho da Interface</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['compact', 'standard', 'expanded'] as const).map(scale => (
                    <button
                      key={scale}
                      onClick={() => {
                        setUiScale(scale);
                        localStorage.setItem('nugep_ui_scale', scale);
                        showToast(`Tamanho da interface: ${scale === 'compact' ? 'Compacto (85%)' : scale === 'expanded' ? 'Expandido (118%)' : 'Padrão (100%)'}`, 'info');
                      }}
                      className={`py-2 rounded-xl border text-xs font-semibold capitalize transition-all ${
                        uiScale === scale
                          ? 'bg-[#0F3E8C] text-white border-[#F4B205]'
                          : 'bg-white/5 border-white/10 opacity-70 hover:opacity-100'
                      }`}
                    >
                      {scale === 'compact' ? 'Compacto' : scale === 'standard' ? 'Padrão' : 'Expandido'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL SOBRE O SISTEMA */}
      {activeModal === 'info' && (
        <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 modal-backdrop-enter">
          <div 
            style={uiZoomStyle}
            className="ui-scale-target liquid-glass rounded-3xl p-6 sm:p-8 w-full max-w-md border border-white/20 shadow-2xl relative modal-content-enter"
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-black/40 border border-[#F4B205]/40 flex items-center justify-center p-0.5 shrink-0">
                  <img src={NUGEP_LOGO} alt="NUGEP Logo" className="w-full h-full object-contain" />
                </div>
                <h3 className="font-bold text-base sm:text-lg">NUGEP MAPS</h3>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-1.5 hover:bg-white/10 rounded-xl transition-all duration-300 hover:rotate-90 hover:scale-110">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 text-xs sm:text-sm opacity-80 leading-relaxed">
              <p>
                Plataforma de inteligência cartográfica e demarcação territorial museológica do Núcleo de Gestão e Pesquisa (NUGEP).
              </p>
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-xs space-y-2">
                <p><span className="font-bold text-white">Sistema:</span> NUGEP MAPS</p>
                <p><span className="font-bold text-white">Geodésia:</span> Datum SIRGAS 2000 / WGS 84</p>
                <p><span className="font-bold text-white">Relevo:</span> DEM Topográfico 3D (1.8x)</p>
                <p><span className="font-bold text-white">Satélite & Relevo:</span> Imagens de Alta Resolução e DEM 3D</p>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* =========================================================================
          DOCUMENTO OFICIAL PARA IMPRESSÃO EM PDF COM MARCA D'ÁGUA DO NUGEP
          ========================================================================= */}
      <div className="print-only hidden print:block w-full text-black p-4 sm:p-6 bg-white relative overflow-hidden">
        {/* Marca d'Água Oficial NUGEP (embutida de forma controlada sem vazar página) */}
        <div className="print-watermark-bg">
          <div className="print-watermark-text">
            NUGEP • NÚCLEO DE GESTÃO E PESQUISA{"\n"}
            {exportTarget === 'point' ? 'MARCADOR GEORREFERENCIADO' : 'DEMARCAÇÃO TERRITORIAL'}
          </div>
        </div>

        {/* CABEÇALHO OFICIAL */}
        <div className="border-b-2 border-[#0F3E8C] pb-3 mb-3 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl border border-[#0F3E8C]/30 bg-[#0F3E8C]/5 flex items-center justify-center p-1">
              <img src={NUGEP_LOGO} alt="NUGEP MAPS" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-black tracking-widest text-[#0F3E8C]">NUGEP</span>
                <span className="text-xl font-black tracking-widest text-[#F4B205]">MAPS</span>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
                {exportTarget === 'point'
                  ? 'Núcleo de Gestão e Pesquisa • Dossiê de Registro de Ponto Georreferenciado'
                  : 'Núcleo de Gestão e Pesquisa • Dossiê de Demarcação Territorial Oficial'}
              </p>
            </div>
          </div>
          <div className="text-right text-[9px] font-mono text-gray-600 space-y-0.5">
            <p><span className="font-bold">DATA DE EMISSÃO:</span> {new Date().toLocaleDateString('pt-BR')}</p>
            <p><span className="font-bold">CERTIFICADO:</span> DOS-NUGEP-{Date.now().toString().slice(-6)}</p>
            <p><span className="font-bold">SISTEMA:</span> SIRGAS 2000 / WGS 84</p>
          </div>
        </div>

        {/* SNAPSHOT DO MAPA CARTOGRÁFICO */}
        {printImage && (
          <div className="w-full h-48 rounded-xl overflow-hidden border border-gray-300 mb-3 shadow-sm relative z-10 bg-gray-100 print-page-break">
            <img src={printImage} alt="Mapa Cartográfico" className="w-full h-full object-cover" />
            <div className="absolute bottom-2 right-2 px-2.5 py-0.5 rounded bg-white/90 border border-gray-300 text-[9px] font-mono font-bold text-gray-800 shadow">
              NUGEP MAPS • REGISTRO HOMOLOGADO
            </div>
          </div>
        )}

        {/* IMPRESSÃO DE PONTO */}
        {exportTarget === 'point' && selectedPoint && (
          <div className="mb-3 p-3.5 border border-gray-300 rounded-xl bg-gray-50/80 relative z-10 print-page-break space-y-2.5">
            <div className="flex justify-between items-center border-b border-gray-200 pb-1.5">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-[#0F3E8C]">Ponto Cartográfico Registrado</span>
                <h3 className="text-base font-black text-black">{selectedPoint.titulo}</h3>
              </div>
              <div className="text-right">
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Classificação / Tipo</span>
                <p className="text-xs font-bold text-[#0F3E8C]">{selectedPoint.objeto || 'Registro Georreferenciado'}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 bg-white border border-gray-200 rounded-lg">
                <span className="text-[8px] font-bold text-gray-500 uppercase block">Autor / Localidade:</span>
                <span className="text-black font-semibold truncate block text-xs">{selectedPoint.autor || 'Território NUGEP'}</span>
              </div>
              <div className="p-2 bg-white border border-gray-200 rounded-lg">
                <span className="text-[8px] font-bold text-gray-500 uppercase block">Ano de Levantamento:</span>
                <span className="text-black font-semibold block text-xs">{selectedPoint.ano || new Date().getFullYear().toString()}</span>
              </div>
              <div className="p-2 bg-white border border-gray-200 rounded-lg">
                <span className="text-[8px] font-bold text-gray-500 uppercase block">Sistema Geodésico:</span>
                <span className="text-black font-semibold block text-xs">SIRGAS 2000 / WGS 84</span>
              </div>
            </div>

            <div className="p-2.5 bg-white border border-gray-200 rounded-lg">
              <span className="text-[8px] font-bold uppercase text-gray-500 block mb-0.5">
                Coordenadas Geográficas Oficiais
              </span>
              <div className="grid grid-cols-2 gap-4 font-mono text-xs">
                <div>
                  <span className="text-gray-500 mr-2">LATITUDE:</span>
                  <span className="font-bold text-black">{selectedPoint.latitude.toFixed(6)}°</span>
                </div>
                <div>
                  <span className="text-gray-500 mr-2">LONGITUDE:</span>
                  <span className="font-bold text-black">{selectedPoint.longitude.toFixed(6)}°</span>
                </div>
              </div>
            </div>

            <div>
              <span className="font-bold text-gray-700 text-[9px] block mb-0.5 uppercase tracking-wider">
                Anotações e Parecer Técnico de Campo:
              </span>
              <div className="p-2.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">
                {selectedPoint.anotacoes || 'Ponto georreferenciado registrado no sistema NUGEP MAPS sem restrições ou observações adicionais.'}
              </div>
            </div>
          </div>
        )}

        {/* IMPRESSÃO DE TERRITÓRIO */}
        {exportTarget === 'territory' && activeTerritory && (
          <div className="mb-3 p-3.5 border border-gray-300 rounded-xl bg-gray-50/80 relative z-10 print-page-break space-y-2.5">
            <div className="flex justify-between items-center border-b border-gray-200 pb-1.5">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-[#0F3E8C]">Território Demarcado</span>
                <h3 className="text-base font-black text-black">{activeTerritory.nome}</h3>
              </div>
              <div className="text-right">
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Área Homologada</span>
                <p className="text-base font-black text-[#0F3E8C]">{activeTerritory.areaHectares} ha</p>
              </div>
            </div>

            {/* Grid de 4 Métricas */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-1.5 bg-white border border-gray-200 rounded-lg">
                <span className="text-[8px] uppercase font-bold text-gray-500 block">Área em km²</span>
                <span className="text-xs font-mono font-bold text-gray-900">{activeTerritory.areaKm2} km²</span>
              </div>
              <div className="p-1.5 bg-white border border-gray-200 rounded-lg">
                <span className="text-[8px] uppercase font-bold text-gray-500 block">Área em m²</span>
                <span className="text-xs font-mono font-bold text-gray-900">{activeTerritory.areaM2.toLocaleString('pt-BR')} m²</span>
              </div>
              <div className="p-1.5 bg-white border border-gray-200 rounded-lg">
                <span className="text-[8px] uppercase font-bold text-gray-500 block">Perímetro</span>
                <span className="text-xs font-mono font-bold text-gray-900">{activeTerritory.perimetroKm} km</span>
              </div>
              <div className="p-1.5 bg-white border border-gray-200 rounded-lg">
                <span className="text-[8px] uppercase font-bold text-gray-500 block">Vértices</span>
                <span className="text-xs font-mono font-bold text-gray-900">{activeTerritory.pontos.length} coord.</span>
              </div>
            </div>

            {/* Parecer Técnico */}
            {activeTerritory.descricao && (
              <div className="p-2 bg-white border border-gray-200 rounded-lg text-xs">
                <span className="text-[8px] font-bold uppercase text-gray-500 block mb-0.5">Parecer / Descrição Técnica:</span>
                <p className="text-gray-800 leading-snug">{activeTerritory.descricao}</p>
              </div>
            )}

            {/* Tabela de Coordenadas dos Vértices */}
            <div>
              <span className="text-[8px] font-bold uppercase tracking-wider text-gray-600 block mb-1">
                Tabela de Coordenadas dos Vértices Perimetrais (Datum SIRGAS 2000 / WGS 84)
              </span>
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <table className="w-full text-[10px] text-left border-collapse font-mono">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-200 text-gray-600 font-bold">
                      <th className="py-1 px-3">Vértice</th>
                      <th className="py-1 px-3">Latitude Oficial</th>
                      <th className="py-1 px-3">Longitude Oficial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTerritory.pontos.map((p, idx) => (
                      <tr key={idx} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <td className="py-1 px-3 font-bold text-gray-800">V{idx + 1}</td>
                        <td className="py-1 px-3 text-gray-700">{p[1].toFixed(6)}°</td>
                        <td className="py-1 px-3 text-gray-700">{p[0].toFixed(6)}°</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* RODAPÉ DE HOMOLOGAÇÃO E ASSINATURA */}
        <div className="mt-4 pt-3 border-t border-gray-300 flex justify-between items-end relative z-10 print-page-break">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="font-black text-xs text-black">NUGEP</span>
              <span className="font-black text-xs text-[#F4B205]">MAPS</span>
            </div>
            <p className="text-[9px] text-gray-500">Documento Oficial emitido pelo Núcleo de Gestão e Pesquisa</p>
            <p className="text-[8px] text-gray-400 font-mono">Autenticidade verificável via georreferenciamento SIRGAS 2000</p>
          </div>
          <div className="text-center">
            <div className="w-48 border-b border-black mb-1" />
            <p className="text-xs font-bold text-black">Responsável Técnico</p>
            <p className="text-[9px] text-gray-600">Núcleo de Gestão e Pesquisa (NUGEP)</p>
          </div>
        </div>
      </div>

    </div>
  );
}
