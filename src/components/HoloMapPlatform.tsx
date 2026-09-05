'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Map, { Source, Layer, Marker, NavigationControl, Popup, MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import Papa from 'papaparse';
import { 
  Search, Layers, Settings, Info, Upload, X, Check, Download, 
  Trash2, Mountain, Ruler, MapPin, Compass, Eye, EyeOff, 
  FileSpreadsheet, Edit3, Save, Sun, Moon, 
  RotateCcw, Hexagon, Globe, Building2, CloudSun, Sparkles, 
  CheckCircle2, AlertCircle, FileText, MousePointer, Landmark,
  Printer, ShieldCheck, CornerDownLeft, Undo2
} from 'lucide-react';

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
  extraProps?: Record<string, any>;
};

// Tipagem dos Territórios Demarcados (Polígonos)
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

// Tipagem de Dados Importados de Planilha
type ParsedSpreadsheet = {
  fileName: string;
  headers: string[];
  rows: Record<string, any>[];
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

// Cálculo de perímetro de polígono fechado em km
function calculatePerimeter(points: [number, number][]): number {
  if (points.length < 2) return 0;
  const closed = [...points, points[0]];
  return calculateDistance(closed);
}

// Cálculo de área de polígono esférico (Shoelace geodésico em m²)
function calculatePolygonArea(coords: [number, number][]): number {
  if (coords.length < 3) return 0;
  const radius = 6378137; // raio médio da Terra em metros
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

// Conversor inteligente de número/coordenada
function parseCoord(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val).trim().replace(',', '.');
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

export default function HoloMapPlatform() {
  const mapRef = useRef<MapRef>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Estados principais persistentes
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [uiScale, setUiScale] = useState<'compact' | 'standard' | 'expanded'>('standard');
  const [objetos, setObjetos] = useState<ObjetoCultural[]>([]);
  const [demarcatedTerritories, setDemarcatedTerritories] = useState<DemarcatedTerritory[]>([]);
  const [selected, setSelected] = useState<ObjetoCultural | null>(null);
  const [selectedTerritory, setSelectedTerritory] = useState<DemarcatedTerritory | null>(null);
  const [anotacoesMap, setAnotacoesMap] = useState<Record<string, string>>({});

  // Camadas e modos visuais
  const [activeLayers, setActiveLayers] = useState<string[]>([
    'relevo',
    'buildings',
    'satellite',
    'atmosphere',
    'territories',
    'markers'
  ]);
  const [activeTool, setActiveTool] = useState<'navigate' | 'point' | 'measure' | 'polygon'>('navigate');

  // Modais ativos
  const [activeModal, setActiveModal] = useState<
    'layers' | 'settings' | 'info' | 'spreadsheet' | 'territories_list' | 'export_dossier' | null
  >(null);

  // Estados de busca interna no mapa
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Medição e demarcação de polígono
  const [measurementPoints, setMeasurementPoints] = useState<[number, number][]>([]);
  const [polygonDraft, setPolygonDraft] = useState<[number, number][]>([]);
  const [newTerritoryName, setNewTerritoryName] = useState('Território Demarcado NUGEP');
  const [newTerritoryColor, setNewTerritoryColor] = useState('#D97706');

  // Planilha Importada
  const [parsedSpreadsheet, setParsedSpreadsheet] = useState<ParsedSpreadsheet | null>(null);
  const [latColumn, setLatColumn] = useState('');
  const [lngColumn, setLngColumn] = useState('');
  const [titleColumn, setTitleColumn] = useState('');
  const [categoryColumn, setCategoryColumn] = useState('');

  // Notificações Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [printImage, setPrintImage] = useState<string | null>(null);

  // Câmera do Mapa 3D
  const [viewState, setViewState] = useState({
    longitude: -36.065,
    latitude: -9.17,
    zoom: 13,
    pitch: 58,
    bearing: 25
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

      const savedObjetos = localStorage.getItem('nugep_objetos_v3');
      if (savedObjetos) setObjetos(JSON.parse(savedObjetos));

      const savedTerritories = localStorage.getItem('nugep_territories_v3');
      if (savedTerritories) setDemarcatedTerritories(JSON.parse(savedTerritories));

      const savedAnotacoes = localStorage.getItem('nugep_anotacoes_v3');
      if (savedAnotacoes) setAnotacoesMap(JSON.parse(savedAnotacoes));
    } catch (e) {
      console.warn('Falha ao restaurar dados locais:', e);
    }
  }, []);

  // Salvar alterações no localStorage
  const handleSaveState = useCallback(() => {
    try {
      localStorage.setItem('nugep_theme', theme);
      localStorage.setItem('nugep_ui_scale', uiScale);
      localStorage.setItem('nugep_objetos_v3', JSON.stringify(objetos));
      localStorage.setItem('nugep_territories_v3', JSON.stringify(demarcatedTerritories));
      localStorage.setItem('nugep_anotacoes_v3', JSON.stringify(anotacoesMap));
      showToast('Dados e territórios salvos com sucesso!');
    } catch (e) {
      showToast('Erro ao salvar no armazenamento local.', 'error');
    }
  }, [theme, uiScale, objetos, demarcatedTerritories, anotacoesMap]);

  // Auto-salvar reativo
  useEffect(() => {
    if (objetos.length > 0 || demarcatedTerritories.length > 0) {
      try {
        localStorage.setItem('nugep_objetos_v3', JSON.stringify(objetos));
        localStorage.setItem('nugep_territories_v3', JSON.stringify(demarcatedTerritories));
        localStorage.setItem('nugep_anotacoes_v3', JSON.stringify(anotacoesMap));
      } catch (e) {}
    }
  }, [objetos, demarcatedTerritories, anotacoesMap]);

  // Alternador de Camadas
  const toggleLayer = (layerKey: string) => {
    if (layerKey === 'relevo') {
      if (!activeLayers.includes('relevo')) {
        setViewState(prev => ({ ...prev, pitch: 60 }));
      } else {
        setViewState(prev => ({ ...prev, pitch: 0 }));
      }
    }
    setActiveLayers(prev => 
      prev.includes(layerKey) ? prev.filter(k => k !== layerKey) : [...prev, layerKey]
    );
  };

  // Alternar Inclinação 3D da Câmera
  const toggle3DCamera = () => {
    setViewState(prev => ({
      ...prev,
      pitch: prev.pitch > 20 ? 0 : 60,
      bearing: prev.pitch > 20 ? 0 : 25
    }));
  };

  // Resetar Norte e Bússola
  const resetNorth = () => {
    setViewState(prev => ({ ...prev, bearing: 0 }));
  };

  // Determinar Estilo de Mapa
  const mapStyleUrl = useMemo(() => {
    if (activeLayers.includes('satellite')) {
      return 'mapbox://styles/mapbox/satellite-streets-v12';
    }
    return theme === 'light' 
      ? 'mapbox://styles/mapbox/light-v11'
      : 'mapbox://styles/mapbox/dark-v11';
  }, [activeLayers, theme]);

  // Busca interna por texto ou coordenada
  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (value.trim().length < 2) {
      setSearchSuggestions([]);
      setShowSearchDropdown(false);
      return;
    }

    setShowSearchDropdown(true);

    // Detecção rápida de coordenadas numéricas (ex: -9.17, -36.065)
    if (/^-?\d+[\.,]\d+[\s,;]+-?\d+[\.,]\d+$/.test(value.trim())) {
      setSearchSuggestions([{
        id: 'coord_exact',
        text: 'Coordenada Geográfica Exata',
        place_name: value.trim(),
        isCoord: true
      }]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        setIsSearching(true);
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&countrycodes=br&format=json&limit=5`);
        const data = await res.json();
        if (data && Array.isArray(data)) {
          const features = data.map((item: any) => ({
            id: item.place_id,
            text: item.name || item.display_name.split(',')[0],
            place_name: item.display_name,
            center: [parseFloat(item.lon), parseFloat(item.lat)]
          }));
          setSearchSuggestions(features);
        }
      } catch (err) {
        console.error('Erro na pesquisa Nominatim:', err);
      } finally {
        setIsSearching(false);
      }
    }, 400);
  };

  const handleSelectSuggestion = (item: any) => {
    setShowSearchDropdown(false);
    if (item.isCoord) {
      const parts = item.place_name.trim().split(/[\s,;]+/).filter(Boolean);
      const lat = parseCoord(parts[0]);
      const lng = parseCoord(parts[1]);
      setViewState(prev => ({ ...prev, longitude: lng, latitude: lat, zoom: 16, pitch: 55 }));
      showToast(`Localizado: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } else {
      const [lng, lat] = item.center;
      setViewState(prev => ({ ...prev, longitude: lng, latitude: lat, zoom: 16, pitch: 55 }));
      showToast(`Localizado: ${item.text}`);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchSuggestions.length > 0) {
      handleSelectSuggestion(searchSuggestions[0]);
    }
  };

  // Clique no Mapa - Registro e Demarcação
  const handleMapClick = async (e: any) => {
    // Ignorar cliques se o alvo for botão, input ou menu
    const target = e.originalEvent?.target;
    if (target && target.closest && target.closest('button, input, textarea, select, .no-map-click, .mapboxgl-ctrl')) {
      return;
    }

    const lat = e.lngLat.lat;
    const lng = e.lngLat.lng;

    // 1. Ferramenta de Régua
    if (activeTool === 'measure') {
      setMeasurementPoints(prev => [...prev, [lng, lat]]);
      return;
    }

    // 2. Ferramenta de Demarcação de Território (Polígono)
    if (activeTool === 'polygon') {
      setPolygonDraft(prev => {
        const next = [...prev, [lng, lat] as [number, number]];
        showToast(`Vértice #${next.length} adicionado (${lat.toFixed(4)}, ${lng.toFixed(4)})`, 'info');
        return next;
      });
      return;
    }

    // 3. Ferramenta de Marcador Pontual
    if (activeTool === 'point') {
      const tempId = `p_${Date.now()}`;
      const newObj: ObjetoCultural = {
        id: tempId,
        autor: 'Ponto Registrado',
        titulo: 'Demarcação Pontual...',
        ano: new Date().getFullYear().toString(),
        objeto: 'Registro Cartográfico',
        latitude: lat,
        longitude: lng,
        altura: 0,
        datasetName: 'NUGEP MAPS'
      };

      setObjetos(prev => [newObj, ...prev]);
      setSelected(newObj);

      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
        const data = await res.json();
        let title = 'Ponto Demarcado';
        let author = 'Coordenadas Locais';

        if (data && data.address) {
          const street = data.address.road || data.address.pedestrian || data.address.path || data.name || '';
          const number = data.address.house_number ? `, ${data.address.house_number}` : '';
          title = street ? `${street}${number}` : (data.name || 'Localidade Marcada');
          const city = data.address.city || data.address.town || data.address.village || data.address.municipality || '';
          const state = data.address.state || '';
          author = (city && state) ? `${city}, ${state}` : (data.display_name?.split(',').slice(1, 3).join(', ') || author);
        } else if (data && data.display_name) {
          title = data.display_name.split(',')[0];
          author = data.display_name.split(',').slice(1, 3).join(', ').trim();
        }

        const updated = { ...newObj, titulo: title, autor: author };
        setObjetos(prev => prev.map(o => o.id === tempId ? updated : o));
        setSelected(updated);
      } catch (err) {
        const updated = { ...newObj, titulo: `Ponto (${lat.toFixed(4)}, ${lng.toFixed(4)})` };
        setObjetos(prev => prev.map(o => o.id === tempId ? updated : o));
        setSelected(updated);
      }
      return;
    }
  };

  // Finalizar e Salvar Território Demarcado
  const finishPolygonDemarcation = () => {
    if (polygonDraft.length < 3) {
      showToast('Um território precisa de no mínimo 3 pontos para formar uma área fechada.', 'error');
      return;
    }

    const areaM2 = calculatePolygonArea(polygonDraft);
    const areaHectares = areaM2 / 10000;
    const areaKm2 = areaM2 / 1000000;
    const perimetroKm = calculatePerimeter(polygonDraft);

    const newTerritory: DemarcatedTerritory = {
      id: `terr_${Date.now()}`,
      nome: newTerritoryName || `Território #${demarcatedTerritories.length + 1}`,
      descricao: `Demarcado via NUGEP MAPS em ${new Date().toLocaleDateString('pt-BR')}`,
      cor: newTerritoryColor,
      pontos: polygonDraft,
      areaM2: Math.round(areaM2),
      areaHectares: parseFloat(areaHectares.toFixed(2)),
      areaKm2: parseFloat(areaKm2.toFixed(4)),
      perimetroKm: parseFloat(perimetroKm.toFixed(2)),
      criadoEm: new Date().toISOString(),
      visivel: true
    };

    setDemarcatedTerritories(prev => [...prev, newTerritory]);
    setSelectedTerritory(newTerritory);
    setPolygonDraft([]);
    setActiveTool('navigate');
    showToast(`Território demarcado com sucesso! Área: ${newTerritory.areaHectares} ha (${newTerritory.areaKm2} km²)`);
  };

  // Desfazer último vértice do rascunho
  const undoLastDraftPoint = () => {
    setPolygonDraft(prev => prev.slice(0, -1));
  };

  const cancelPolygonDemarcation = () => {
    setPolygonDraft([]);
    setActiveTool('navigate');
  };

  // Importação e Leitura de Planilha (CSV / TSV / Texto / PDF)
  const handleSpreadsheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.pdf')) {
      showToast('Processando documento PDF territorial...', 'info');
      setIsProcessing(true);
      const formData = new FormData();
      formData.append('file', file);
      fetch('/api/pdf', { method: 'POST', body: formData })
        .then(res => res.json())
        .then((data) => {
          if (data.error) throw new Error(data.error);
          const lines = data.text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 4);
          const extracted: ObjetoCultural[] = [];
          lines.forEach((line: string, i: number) => {
            const match = line.match(/(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);
            if (match) {
              extracted.push({
                id: `pdf_${Date.now()}_${i}`,
                autor: 'Extração PDF NUGEP',
                titulo: line.slice(0, 40),
                ano: new Date().getFullYear().toString(),
                objeto: 'Demarcação Textual',
                latitude: parseFloat(match[1]),
                longitude: parseFloat(match[2]),
                altura: 0,
                datasetName: file.name
              });
            }
          });
          if (extracted.length > 0) {
            setObjetos(prev => [...extracted, ...prev]);
            showToast(`${extracted.length} coordenadas extraídas com sucesso do PDF!`);
            setViewState(prev => ({ ...prev, latitude: extracted[0].latitude, longitude: extracted[0].longitude, zoom: 14 }));
          } else {
            showToast('Nenhuma coordenada explícita encontrada no PDF.', 'error');
          }
        })
        .catch(err => showToast(err.message, 'error'))
        .finally(() => setIsProcessing(false));
      e.target.value = '';
      return;
    }

    setIsProcessing(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setIsProcessing(false);
        if (!results.data || results.data.length === 0) {
          showToast('A planilha enviada está vazia.', 'error');
          return;
        }

        const headers = results.meta.fields || Object.keys(results.data[0] || {});
        const rows = results.data as Record<string, any>[];

        setParsedSpreadsheet({
          fileName: file.name,
          headers,
          rows
        });

        // Detecção inteligente de colunas
        const lowerHeaders = headers.map(h => ({
          original: h,
          clean: h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
        }));

        const foundLat = lowerHeaders.find(h => 
          ['latitude', 'lat', 'lat_dd', 'latitude_dd', 'y', 'coord_y'].includes(h.clean)
        );
        const foundLng = lowerHeaders.find(h => 
          ['longitude', 'long', 'lng', 'lon', 'lon_dd', 'longitude_dd', 'x', 'coord_x'].includes(h.clean)
        );
        const foundTitle = lowerHeaders.find(h => 
          ['nome', 'titulo', 'local', 'denominacao', 'ponto', 'name', 'title', 'objeto'].includes(h.clean)
        );
        const foundCat = lowerHeaders.find(h => 
          ['categoria', 'tipo', 'classificacao', 'type', 'category', 'autor'].includes(h.clean)
        );

        if (foundLat) setLatColumn(foundLat.original);
        else if (headers.length > 0) setLatColumn(headers[0]);

        if (foundLng) setLngColumn(foundLng.original);
        else if (headers.length > 1) setLngColumn(headers[1]);

        if (foundTitle) setTitleColumn(foundTitle.original);
        if (foundCat) setCategoryColumn(foundCat.original);

        setActiveModal('spreadsheet');
        showToast(`Planilha carregada: ${rows.length} registros prontos para mapeamento.`);
      },
      error: () => {
        setIsProcessing(false);
        showToast('Falha ao processar arquivo CSV/Planilha.', 'error');
      }
    });

    e.target.value = '';
  };

  // Mapear Planilha no Mapa e Demarcar
  const applySpreadsheetToMap = (createTerritoryPolygon: boolean = false) => {
    if (!parsedSpreadsheet || !latColumn || !lngColumn) {
      showToast('Selecione as colunas de Latitude e Longitude.', 'error');
      return;
    }

    const mappedObjects: ObjetoCultural[] = [];
    const validCoords: [number, number][] = [];

    parsedSpreadsheet.rows.forEach((row, idx) => {
      const lat = parseCoord(row[latColumn]);
      const lng = parseCoord(row[lngColumn]);
      const title = titleColumn && row[titleColumn] ? String(row[titleColumn]) : `Ponto #${idx + 1}`;
      const category = categoryColumn && row[categoryColumn] ? String(row[categoryColumn]) : 'Importação de Planilha';

      if (lat !== 0 && lng !== 0 && !isNaN(lat) && !isNaN(lng)) {
        mappedObjects.push({
          id: `sheet_${Date.now()}_${idx}`,
          autor: parsedSpreadsheet.fileName,
          titulo: title,
          ano: row.ano || row.data || new Date().getFullYear().toString(),
          objeto: category,
          latitude: lat,
          longitude: lng,
          altura: parseCoord(row.altura || row.elevacao || 0),
          datasetName: parsedSpreadsheet.fileName,
          extraProps: row
        });
        validCoords.push([lng, lat]);
      }
    });

    if (mappedObjects.length === 0) {
      showToast('Nenhuma coordenada válida encontrada com as colunas selecionadas.', 'error');
      return;
    }

    setObjetos(prev => [...mappedObjects, ...prev]);

    // Criar polígono de território conectando os pontos
    if (createTerritoryPolygon && validCoords.length >= 3) {
      const areaM2 = calculatePolygonArea(validCoords);
      const perimetroKm = calculatePerimeter(validCoords);
      const newTerritory: DemarcatedTerritory = {
        id: `terr_sheet_${Date.now()}`,
        nome: `Território: ${parsedSpreadsheet.fileName.replace(/\.[^/.]+$/, '')}`,
        descricao: `Gerado a partir da planilha ${parsedSpreadsheet.fileName} (${validCoords.length} vértices).`,
        cor: '#10B981',
        pontos: validCoords,
        areaM2: Math.round(areaM2),
        areaHectares: parseFloat((areaM2 / 10000).toFixed(2)),
        areaKm2: parseFloat((areaM2 / 1000000).toFixed(4)),
        perimetroKm: parseFloat(perimetroKm.toFixed(2)),
        criadoEm: new Date().toISOString(),
        visivel: true
      };
      setDemarcatedTerritories(prev => [...prev, newTerritory]);
      setSelectedTerritory(newTerritory);
      showToast(`Território demarcado com sucesso: ${newTerritory.areaHectares} ha!`);
    }

    // Ajustar câmera para o primeiro ponto
    const first = mappedObjects[0];
    setViewState(prev => ({
      ...prev,
      latitude: first.latitude,
      longitude: first.longitude,
      zoom: 14,
      pitch: 50
    }));

    setActiveModal(null);
    showToast(`Demarcação concluída! ${mappedObjects.length} pontos plotados.`);
  };

  // Preparar Exportação do Dossiê Cartográfico em PDF com Marca d'Água do NUGEP
  const handleOpenExportDossier = (territory?: DemarcatedTerritory) => {
    if (territory) setSelectedTerritory(territory);
    else if (demarcatedTerritories.length > 0 && !selectedTerritory) {
      setSelectedTerritory(demarcatedTerritories[0]);
    }

    // Capturar snapshot do canvas do mapa
    if (mapRef.current) {
      try {
        const canvas = mapRef.current.getMap().getCanvas();
        setPrintImage(canvas.toDataURL('image/png'));
      } catch (err) {}
    }

    setActiveModal('export_dossier');
  };

  // Disparar Impressão / Salvamento em PDF
  const triggerPrintPDF = () => {
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

  // Limpar Todos os Dados
  const handleClearAll = () => {
    if (window.confirm('Deseja realmente limpar todos os pontos e territórios demarcados?')) {
      setObjetos([]);
      setDemarcatedTerritories([]);
      setSelected(null);
      setSelectedTerritory(null);
      setMeasurementPoints([]);
      setPolygonDraft([]);
      localStorage.removeItem('nugep_objetos_v3');
      localStorage.removeItem('nugep_territories_v3');
      localStorage.removeItem('nugep_anotacoes_v3');
      showToast('Todos os dados foram resetados.', 'info');
    }
  };

  // GeoJSON dos Territórios Demarcados (Polígonos Salvos)
  const territoriesGeoJSON = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: demarcatedTerritories.filter(t => t.visivel && t.pontos.length >= 3).map(t => {
        const closedPoints = [...t.pontos, t.pontos[0]];
        return {
          type: 'Feature',
          properties: {
            id: t.id,
            nome: t.nome,
            cor: t.cor,
            areaHectares: t.areaHectares,
            areaKm2: t.areaKm2
          },
          geometry: {
            type: 'Polygon',
            coordinates: [closedPoints]
          }
        };
      })
    };
  }, [demarcatedTerritories]);

  // GeoJSON de Vértices do Rascunho de Demarcação (Pontos)
  const draftPointsGeoJSON = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: polygonDraft.map((pt, i) => ({
        type: 'Feature',
        properties: { index: i + 1 },
        geometry: { type: 'Point', coordinates: pt }
      }))
    };
  }, [polygonDraft]);

  // GeoJSON de Linha do Rascunho (LineString)
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

  // GeoJSON de Preenchimento do Rascunho (Polygon)
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

  // GeoJSON da Régua de Medição
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

  // Classes de tema adaptativo
  const isDark = theme === 'dark';
  const themeClass = isDark ? 'theme-dark' : 'theme-light';
  const scaleClass = uiScale === 'compact' ? 'scale-compact' : uiScale === 'expanded' ? 'scale-expanded' : 'scale-standard';

  return (
    <div className={`w-full h-[100dvh] flex flex-col font-sans select-none overflow-hidden relative ${themeClass} ${scaleClass} ${isDark ? 'bg-[#06080C] text-gray-100' : 'bg-[#f4f6f9] text-gray-900'} print:h-auto print:overflow-visible`}>
      
      {/* Toast Notification Flutuante */}
      {toast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl liquid-glass flex items-center gap-3 animate-in fade-in slide-in-from-top-3 duration-300 shadow-2xl border border-white/20">
          {toast.type === 'success' && <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />}
          {toast.type === 'error' && <AlertCircle size={18} className="text-red-400 shrink-0" />}
          {toast.type === 'info' && <Sparkles size={18} className="text-[#A67C52] shrink-0" />}
          <p className="text-xs md:text-sm font-medium leading-none">{toast.message}</p>
        </div>
      )}

      {/* =========================================================================
          CONTROLES FLUTUANTES NO MAPA (SEM BARRA FIXA HORIZONTAL NO TOPO!)
          ========================================================================= */}

      {/* 1. BRAND CAPSULE FLUTUANTE NO CANTO SUPERIOR ESQUERDO */}
      <div className="absolute top-4 left-4 z-30 pointer-events-auto flex items-center gap-3">
        <div 
          onClick={() => {
            setViewState(prev => ({ ...prev, pitch: 58, bearing: 25, zoom: 13, latitude: -9.17, longitude: -36.065 }));
            showToast('Câmera centralizada no território NUGEP');
          }}
          className="liquid-glass rounded-2xl px-4 py-2.5 flex items-center gap-3 border border-white/15 shadow-2xl cursor-pointer hover:bg-white/10 active:scale-95 transition-all group"
          title="Clique para centralizar"
        >
          {/* Logo Antiga do Museu (Landmark em Bronze com Brilho Suave) */}
          <div className="w-8 h-8 rounded-xl bg-black/40 border border-[#A67C52]/40 flex items-center justify-center shadow-inner group-hover:border-[#A67C52] transition-colors">
            <Landmark size={18} color="#A67C52" strokeWidth={2} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm tracking-widest leading-none text-white drop-shadow">NUGEP</span>
              <span className="font-light text-sm tracking-widest leading-none text-[#A67C52]">MAPS</span>
            </div>
            <span className="text-[9px] uppercase tracking-[0.2em] font-semibold text-white/40 mt-0.5">Cartografia 3D</span>
          </div>
        </div>
      </div>

      {/* 2. BARRA DE BUSCA SUPERIOR CENTRAL FLUTUANTE DENTRO DO MAPA */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-280px)] max-w-[460px] pointer-events-auto">
        <form 
          onSubmit={handleSearchSubmit}
          className="liquid-glass rounded-2xl p-1.5 flex items-center gap-2 border border-white/20 shadow-2xl transition-all focus-within:border-[#A67C52]/80"
        >
          <div className="pl-3 text-[#A67C52]">
            <Search size={16} />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => handleSearchInput(e.target.value)}
            onFocus={() => {
              if (searchSuggestions.length > 0) setShowSearchDropdown(true);
            }}
            placeholder="Buscar endereço, cidade ou coordenadas (-9.17, -36.06)..."
            className="w-full bg-transparent text-xs sm:text-sm outline-none placeholder:text-gray-400/60 font-medium"
          />
          {isSearching && (
            <div className="w-4 h-4 border-2 border-[#A67C52] border-t-transparent rounded-full animate-spin shrink-0 mr-2" />
          )}
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSearchSuggestions([]);
                setShowSearchDropdown(false);
              }}
              className="p-1 hover:bg-white/10 rounded-full opacity-60 hover:opacity-100 mr-1"
            >
              <X size={14} />
            </button>
          )}
        </form>

        {/* Dropdown de sugestões de busca */}
        {showSearchDropdown && searchSuggestions.length > 0 && (
          <div className="mt-2 w-full liquid-glass rounded-2xl border border-white/20 overflow-hidden shadow-2xl z-50 flex flex-col max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in duration-200">
            {searchSuggestions.map(item => (
              <div
                key={item.id}
                onClick={() => handleSelectSuggestion(item)}
                className="px-4 py-2.5 hover:bg-[#A67C52]/20 cursor-pointer border-b border-white/5 last:border-0 flex flex-col gap-0.5 transition-colors"
              >
                <span className="text-xs sm:text-sm font-semibold">{item.text}</span>
                <span className="text-[11px] opacity-60 truncate">{item.place_name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. AÇÕES RÁPIDAS NO TOPO DIREITO (SALVAR, EXPORTAR DOSSIÊ, RESET) */}
      <div className="absolute top-4 right-4 z-30 pointer-events-auto flex items-center gap-2">
        <button
          onClick={handleSaveState}
          className="px-3.5 py-2 rounded-xl text-xs font-bold liquid-glass border border-[#A67C52]/40 text-[#A67C52] hover:bg-[#A67C52]/20 transition-all flex items-center gap-1.5 shadow-lg active:scale-95"
          title="Salvar alterações"
        >
          <Save size={14} strokeWidth={2} />
          <span>Salvar</span>
        </button>

        <button
          onClick={() => handleOpenExportDossier()}
          className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#A67C52] hover:bg-[#8F653E] text-white transition-all flex items-center gap-1.5 shadow-lg active:scale-95"
          title="Exportar Dossiê Cartográfico com Marca d'Água"
        >
          <Download size={14} strokeWidth={2} />
          <span>Exportar Dossiê (PDF)</span>
        </button>

        <button
          onClick={handleClearAll}
          className="p-2 rounded-xl liquid-glass border border-white/10 hover:bg-red-500/20 text-red-400 transition-colors shadow-lg"
          title="Limpar demarcações"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* =========================================================================
          TRILHO LATERAL FLUTUANTE ESQUERDO (SLIM GLASS RAIL)
          ========================================================================= */}
      <nav className="absolute left-4 top-20 bottom-4 w-12 z-20 liquid-glass rounded-2xl border border-white/15 shadow-2xl flex flex-col items-center justify-between py-3 pointer-events-auto">
        <div className="flex flex-col items-center gap-2.5">
          {/* Demarcar Território */}
          <button
            onClick={() => {
              setActiveTool(prev => prev === 'polygon' ? 'navigate' : 'polygon');
              if (activeTool !== 'polygon') {
                showToast('Modo de Demarcação Territorial ativado. Clique no mapa para criar o perímetro.', 'info');
              }
            }}
            className={`w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-all ${
              activeTool === 'polygon' 
                ? 'bg-[#A67C52] text-white shadow-lg scale-105' 
                : 'hover:bg-white/10 opacity-70 hover:opacity-100'
            }`}
            title="Demarcar Território (Polígono)"
          >
            <Hexagon size={18} strokeWidth={activeTool === 'polygon' ? 2.5 : 1.8} />
          </button>

          {/* Demarcar Ponto */}
          <button
            onClick={() => {
              setActiveTool(prev => prev === 'point' ? 'navigate' : 'point');
              if (activeTool !== 'point') {
                showToast('Modo Marcador ativado. Clique no mapa para demarcar um ponto.', 'info');
              }
            }}
            className={`w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-all ${
              activeTool === 'point' 
                ? 'bg-[#A67C52] text-white shadow-lg scale-105' 
                : 'hover:bg-white/10 opacity-70 hover:opacity-100'
            }`}
            title="Demarcar Ponto no Mapa"
          >
            <MapPin size={18} strokeWidth={activeTool === 'point' ? 2.5 : 1.8} />
          </button>

          {/* Régua de Medir */}
          <button
            onClick={() => {
              if (activeTool === 'measure') {
                setActiveTool('navigate');
                setMeasurementPoints([]);
              } else {
                setActiveTool('measure');
                setMeasurementPoints([]);
                showToast('Modo Régua ativado. Clique no mapa para medir distâncias.', 'info');
              }
            }}
            className={`w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-all ${
              activeTool === 'measure' 
                ? 'bg-[#A67C52] text-white shadow-lg scale-105' 
                : 'hover:bg-white/10 opacity-70 hover:opacity-100'
            }`}
            title="Régua de Medição"
          >
            <Ruler size={18} />
          </button>

          {/* Importar Planilha */}
          <label 
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all opacity-70 hover:opacity-100 cursor-pointer relative"
            title="Importar Planilha (CSV / Excel / PDF)"
          >
            {isProcessing ? (
              <div className="w-4 h-4 border-2 border-[#A67C52] border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload size={18} />
            )}
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".csv,.txt,.tsv,.pdf" 
              className="hidden" 
              onChange={handleSpreadsheetUpload}
              disabled={isProcessing}
            />
          </label>

          {/* Camadas 3D (SOMENTE O ÍCONE - Sem texto 'Painel Cartográfico') */}
          <button
            onClick={() => setActiveModal(prev => prev === 'layers' ? null : 'layers')}
            className={`w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-all ${
              activeModal === 'layers' 
                ? 'bg-[#A67C52] text-white shadow-lg' 
                : 'hover:bg-white/10 opacity-70 hover:opacity-100'
            }`}
            title="Camadas 3D e Satélite"
          >
            <Layers size={18} />
          </button>

          {/* Territórios Salvos */}
          <button
            onClick={() => setActiveModal(prev => prev === 'territories_list' ? null : 'territories_list')}
            className={`w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-all ${
              activeModal === 'territories_list' 
                ? 'bg-[#A67C52] text-white shadow-lg' 
                : 'hover:bg-white/10 opacity-70 hover:opacity-100'
            }`}
            title="Territórios Demarcados"
          >
            <FileText size={18} />
          </button>
        </div>

        {/* Rodapé do Trilho: Configurações & Informações */}
        <div className="flex flex-col items-center gap-2.5">
          <button
            onClick={() => setActiveModal('settings')}
            className={`w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-all ${
              activeModal === 'settings' 
                ? 'bg-[#A67C52] text-white shadow-lg' 
                : 'hover:bg-white/10 opacity-70 hover:opacity-100'
            }`}
            title="Configurações (Tema, Escala, Sistema)"
          >
            <Settings size={18} />
          </button>

          <button
            onClick={() => setActiveModal('info')}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all opacity-70 hover:opacity-100"
            title="Sobre o NUGEP MAPS"
          >
            <Info size={18} />
          </button>
        </div>
      </nav>

      {/* =========================================================================
          PALETA FLUTUANTE 3D NO CANTO SUPERIOR DIREITO DO MAPA
          ========================================================================= */}
      <div className="absolute top-20 right-4 z-20 flex flex-col gap-2 pointer-events-auto">
        <div className="liquid-glass rounded-2xl p-1.5 flex flex-col gap-1.5 border border-white/20 shadow-2xl">
          {/* Navegação Padrão */}
          <button
            onClick={() => setActiveTool('navigate')}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
              activeTool === 'navigate' 
                ? 'bg-[#A67C52] text-white shadow-md' 
                : 'hover:bg-white/10 opacity-70 hover:opacity-100'
            }`}
            title="Modo Navegação"
          >
            <MousePointer size={16} />
          </button>

          {/* Alternador de Perspectiva 3D / 2D */}
          <button
            onClick={toggle3DCamera}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all font-bold text-xs ${
              viewState.pitch > 20 
                ? 'bg-[#A67C52]/30 border border-[#A67C52] text-amber-300' 
                : 'hover:bg-white/10 opacity-70 hover:opacity-100'
            }`}
            title="Alternar Perspectiva 3D/2D"
          >
            {viewState.pitch > 20 ? '3D' : '2D'}
          </button>

          {/* Resetar Norte (Bússola Interativa) */}
          <button
            onClick={resetNorth}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/10 opacity-70 hover:opacity-100 transition-all"
            title="Resetar Norte"
            style={{ transform: `rotate(${-viewState.bearing}deg)` }}
          >
            <Compass size={16} className="text-rose-400" />
          </button>

          <div className="w-full h-[1px] bg-white/10 my-0.5" />

          {/* Toggle Rápido Relevo 3D */}
          <button
            onClick={() => toggleLayer('relevo')}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
              activeLayers.includes('relevo') 
                ? 'text-amber-400 bg-amber-500/20' 
                : 'opacity-50 hover:opacity-100'
            }`}
            title="Relevo Topográfico 3D"
          >
            <Mountain size={16} />
          </button>

          {/* Toggle Rápido Prédios 3D */}
          <button
            onClick={() => toggleLayer('buildings')}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
              activeLayers.includes('buildings') 
                ? 'text-indigo-400 bg-indigo-500/20' 
                : 'opacity-50 hover:opacity-100'
            }`}
            title="Edificações Prediais 3D"
          >
            <Building2 size={16} />
          </button>

          {/* Toggle Rápido Satélite */}
          <button
            onClick={() => toggleLayer('satellite')}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
              activeLayers.includes('satellite') 
                ? 'text-emerald-400 bg-emerald-500/20' 
                : 'opacity-50 hover:opacity-100'
            }`}
            title="Satélite HD"
          >
            <Globe size={16} />
          </button>
        </div>
      </div>

      {/* =========================================================================
          PAINEL DE CONTROLE DA DEMARCAÇÃO TERRITORIAL (QUANDO ATIVA)
          ========================================================================= */}
      {activeTool === 'polygon' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 liquid-glass rounded-3xl p-4 border border-[#A67C52]/50 shadow-2xl flex flex-col md:flex-row items-center gap-4 animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto max-w-[90vw]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#A67C52]/30 border border-[#A67C52]/60 flex items-center justify-center text-[#A67C52]">
              <Hexagon size={20} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-400">Demarcando Território</p>
              <p className="text-xs opacity-80">
                Vértices: <span className="font-bold text-white">{polygonDraft.length}</span> | 
                Área: <span className="font-bold text-amber-300">{(currentDraftArea / 10000).toFixed(2)} ha</span> ({((currentDraftArea / 1000000).toFixed(3))} km²) | 
                Perímetro: <span className="font-bold text-white">{currentDraftPerimeter.toFixed(2)} km</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTerritoryName}
              onChange={e => setNewTerritoryName(e.target.value)}
              placeholder="Nome do Território"
              className="bg-white/10 px-3 py-2 rounded-xl text-xs border border-white/20 outline-none w-44 font-semibold"
            />
            <input
              type="color"
              value={newTerritoryColor}
              onChange={e => setNewTerritoryColor(e.target.value)}
              className="w-9 h-9 rounded-xl bg-transparent cursor-pointer border border-white/20"
              title="Cor do Território"
            />
            
            {polygonDraft.length > 0 && (
              <button
                onClick={undoLastDraftPoint}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 text-xs flex items-center gap-1"
                title="Desfazer último vértice"
              >
                <Undo2 size={16} />
              </button>
            )}

            <button
              onClick={finishPolygonDemarcation}
              disabled={polygonDraft.length < 3}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md flex items-center gap-1.5"
            >
              <Check size={14} />
              <span>Concluir Demarcação</span>
            </button>
            
            <button
              onClick={cancelPolygonDemarcation}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-gray-300 transition-all"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Banner de Medição Ativa */}
      {activeTool === 'measure' && measurementPoints.length > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 liquid-glass rounded-2xl px-5 py-3 border border-white/20 shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-4 pointer-events-auto">
          <div>
            <p className="text-[10px] uppercase tracking-widest opacity-60 font-bold">Distância Linear</p>
            <p className="text-xl font-light text-amber-400">
              {currentDistance < 1 
                ? `${(currentDistance * 1000).toFixed(0)} m` 
                : `${currentDistance.toFixed(2)} km`}
            </p>
          </div>
          <button
            onClick={() => setMeasurementPoints([])}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300"
            title="Limpar rota medida"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}

      {/* =========================================================================
          MOTOR MAPBOX GL 3D (CANVAS FULL VIEWPORT)
          ========================================================================= */}
      <div className="w-full h-full relative cursor-default" style={{ cursor: activeTool === 'polygon' || activeTool === 'point' ? 'crosshair' : 'default' }}>
        <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          {...viewState}
          onMove={evt => setViewState(evt.viewState)}
          onClick={handleMapClick}
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
            range: [0.8, 8],
            color: isDark ? '#080b12' : '#dbe4f0',
            'high-color': isDark ? '#161e2e' : '#94a9c9',
            'space-color': '#000000',
            'star-intensity': 0.85,
            'horizon-blend': 0.18
          } : undefined}
        >
          <NavigationControl position="bottom-right" />

          {/* DEM de Relevo Topográfico 3D */}
          <Source 
            id="mapbox-dem" 
            type="raster-dem" 
            url="mapbox://mapbox.mapbox-terrain-dem-v1" 
            tileSize={512} 
            maxzoom={14} 
          />

          {/* Céu Atmosférico 3D */}
          {activeLayers.includes('atmosphere') && (
            <Layer
              id="sky"
              type="sky"
              paint={{
                'sky-type': 'atmosphere',
                'sky-atmosphere-sun': [0.0, 90.0],
                'sky-atmosphere-sun-intensity': 15
              }}
            />
          )}

          {/* Prédios e Edificações em 3D (Extrusão) */}
          {activeLayers.includes('buildings') && (
            <Layer
              id="3d-buildings"
              source="composite"
              source-layer="building"
              filter={['==', 'extrude', 'true']}
              type="fill-extrusion"
              minzoom={14}
              paint={{
                'fill-extrusion-color': isDark ? '#1e2638' : '#cbd5e1',
                'fill-extrusion-height': ['get', 'height'],
                'fill-extrusion-base': ['get', 'min_height'],
                'fill-extrusion-opacity': 0.85
              }}
            />
          )}

          {/* Territórios Demarcados Salvos (Polígonos) */}
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

          {/* Rascunho de Demarcação: Polígono Preenchido (quando >= 3 vértices) */}
          {draftPolygonGeoJSON && (
            <Source id="draft-polygon-src" type="geojson" data={draftPolygonGeoJSON as any}>
              <Layer
                id="draft-fill"
                type="fill"
                paint={{
                  'fill-color': newTerritoryColor,
                  'fill-opacity': 0.35
                }}
              />
            </Source>
          )}

          {/* Rascunho de Demarcação: Linhas Conectoras (quando >= 2 vértices) */}
          {draftLineGeoJSON && (
            <Source id="draft-line-src" type="geojson" data={draftLineGeoJSON as any}>
              <Layer
                id="draft-line"
                type="line"
                paint={{
                  'line-color': newTerritoryColor,
                  'line-width': 2.5,
                  'line-dasharray': [3, 2]
                }}
              />
            </Source>
          )}

          {/* Rascunho de Demarcação: Vértices Numerados com Marcadores Visíveis */}
          {polygonDraft.map((pt, i) => (
            <Marker key={`draft_pt_${i}`} longitude={pt[0]} latitude={pt[1]} anchor="center">
              <div className="relative group flex items-center justify-center">
                <div className="w-5 h-5 rounded-full bg-white border-2 border-[#A67C52] shadow-2xl flex items-center justify-center text-[9px] font-black text-black">
                  {i + 1}
                </div>
              </div>
            </Marker>
          ))}

          {/* Rota de Medição da Régua */}
          {measurementPoints.length > 0 && (
            <Source id="measure-source" type="geojson" data={measurementGeoJSON as any}>
              <Layer 
                id="measure-line" 
                type="line" 
                paint={{ 
                  'line-color': '#F59E0B', 
                  'line-width': 3, 
                  'line-dasharray': [2, 2] 
                }} 
              />
              {measurementPoints.map((pt, i) => (
                <Marker key={`meas_${i}`} longitude={pt[0]} latitude={pt[1]}>
                  <div className="w-2.5 h-2.5 bg-white border-2 border-amber-500 rounded-full shadow-lg" />
                </Marker>
              ))}
            </Source>
          )}

          {/* Marcadores Georreferenciados Salvos */}
          {activeLayers.includes('markers') && objetos.filter(o => o.latitude !== 0 && o.longitude !== 0).map((obj) => (
            <Marker
              key={obj.id}
              longitude={obj.longitude}
              latitude={obj.latitude}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setSelected(obj);
              }}
            >
              <div className="relative group cursor-pointer flex flex-col items-center">
                <div 
                  className={`w-7 h-7 rounded-xl flex items-center justify-center shadow-2xl backdrop-blur-md transition-all duration-300 group-hover:scale-125 border ${
                    selected?.id === obj.id 
                      ? 'bg-[#A67C52] text-white border-amber-300 scale-110 shadow-[#A67C52]/60' 
                      : isDark
                        ? 'bg-black/80 text-[#A67C52] border-white/20'
                        : 'bg-white/90 text-[#A67C52] border-black/10'
                  }`}
                >
                  <MapPin size={14} strokeWidth={2.5} />
                </div>
              </div>
            </Marker>
          ))}

          {/* Badges de Identificação nos Territórios Salvos */}
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
                  setSelectedTerritory(terr);
                }}
              >
                <div 
                  className="px-2.5 py-1 rounded-full liquid-glass border border-white/30 text-[10px] font-bold tracking-wide shadow-xl cursor-pointer hover:scale-110 transition-transform flex items-center gap-1.5"
                  style={{ borderColor: terr.cor }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: terr.cor }} />
                  <span>{terr.nome}</span>
                  <span className="opacity-70 font-mono">({terr.areaHectares} ha)</span>
                </div>
              </Marker>
            );
          })}

          {/* Popup do Ponto Selecionado */}
          {selected && (
            <Popup
              longitude={selected.longitude}
              latitude={selected.latitude}
              anchor="bottom"
              offset={[0, -32]}
              closeButton={false}
              closeOnClick={false}
              className="z-40"
              maxWidth="300px"
            >
              <div className="liquid-glass rounded-2xl p-4 shadow-2xl border border-white/20 flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400">{selected.objeto}</span>
                  <button onClick={() => setSelected(null)} className="p-1 hover:opacity-70">
                    <X size={12} />
                  </button>
                </div>
                <h4 className="font-semibold text-sm leading-snug">{selected.titulo}</h4>
                <p className="text-xs opacity-60 mt-1">{selected.autor}</p>
                <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] opacity-75">
                  <span className="font-mono">{selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}</span>
                </div>
              </div>
            </Popup>
          )}
        </Map>
      </div>

      {/* =========================================================================
          PAINEL LATERAL DE PROPRIEDADES DO PONTO SELECIONADO
          ========================================================================= */}
      {selected && (
        <aside className="absolute top-20 left-18 bottom-4 w-80 liquid-glass rounded-3xl p-5 border border-white/20 shadow-2xl z-30 flex flex-col overflow-hidden animate-in slide-in-from-left-4 duration-300 pointer-events-auto">
          <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-[#A67C52]" />
              <span className="text-xs font-bold uppercase tracking-wider">Propriedades do Ponto</span>
            </div>
            <button onClick={() => setSelected(null)} className="p-1 hover:bg-white/10 rounded-lg">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-4">
            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider opacity-50 block mb-1">Título / Denominação</label>
              <input
                type="text"
                value={selected.titulo}
                onChange={e => {
                  const updated = { ...selected, titulo: e.target.value };
                  setSelected(updated);
                  setObjetos(prev => prev.map(o => o.id === selected.id ? updated : o));
                }}
                className="w-full bg-white/10 rounded-xl px-3 py-2 text-sm font-semibold border border-white/10 outline-none focus:border-[#A67C52]"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider opacity-50 block mb-1">Região / Autor</label>
              <input
                type="text"
                value={selected.autor}
                onChange={e => {
                  const updated = { ...selected, autor: e.target.value };
                  setSelected(updated);
                  setObjetos(prev => prev.map(o => o.id === selected.id ? updated : o));
                }}
                className="w-full bg-white/10 rounded-xl px-3 py-2 text-xs border border-white/10 outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider opacity-50 block mb-1">Classificação Cartográfica</label>
              <input
                type="text"
                value={selected.objeto}
                onChange={e => {
                  const updated = { ...selected, objeto: e.target.value };
                  setSelected(updated);
                  setObjetos(prev => prev.map(o => o.id === selected.id ? updated : o));
                }}
                className="w-full bg-white/10 rounded-xl px-3 py-2 text-xs border border-white/10 outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider opacity-50 block mb-1">Notas Técnicas do Núcleo</label>
              <textarea
                value={anotacoesMap[selected.id] || ''}
                onChange={e => setAnotacoesMap(prev => ({ ...prev, [selected.id]: e.target.value }))}
                rows={4}
                placeholder="Observações territoriais ou dados arqueológicos..."
                className="w-full bg-white/10 rounded-xl p-3 text-xs border border-white/10 outline-none resize-none custom-scrollbar"
              />
            </div>

            <div className="pt-2 border-t border-white/10 text-xs">
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-50 block mb-1">Coordenadas Absolutas</span>
              <p className="font-mono text-amber-300">{selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)}</p>
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 shrink-0 flex gap-2">
            <button
              onClick={() => {
                setObjetos(prev => prev.filter(o => o.id !== selected.id));
                setSelected(null);
                showToast('Ponto removido com sucesso.');
              }}
              className="w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-all flex items-center justify-center gap-1.5"
            >
              <Trash2 size={14} />
              <span>Excluir Ponto</span>
            </button>
          </div>
        </aside>
      )}

      {/* =========================================================================
          MODAIS E DRAWERS LIQUID GLASS
          ========================================================================= */}

      {/* 1. MODAL DE CAMADAS 3D E SATÉLITE */}
      {activeModal === 'layers' && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="liquid-glass rounded-3xl p-6 w-full max-w-md border border-white/20 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
              <div className="flex items-center gap-2">
                <Layers size={20} className="text-[#A67C52]" />
                <h3 className="font-bold text-base">Camadas 3D e Satélite</h3>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-1.5 hover:bg-white/10 rounded-xl">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-2">Espectro Base do Mapa</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      if (!activeLayers.includes('satellite')) setActiveLayers(prev => [...prev, 'satellite']);
                    }}
                    className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-2 transition-all ${
                      activeLayers.includes('satellite')
                        ? 'bg-[#A67C52]/30 border-[#A67C52] text-amber-300'
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
                        ? 'bg-[#A67C52]/30 border-[#A67C52] text-amber-300'
                        : 'bg-white/5 border-white/10 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <Building2 size={24} />
                    <span>{isDark ? 'Dark Vetorial 3D' : 'Light Vetorial 3D'}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-1">Modelagem Tridimensional</label>

                {/* Relevo Topográfico */}
                <div 
                  onClick={() => toggleLayer('relevo')}
                  className="flex items-center justify-between p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3">
                    <Mountain size={18} className="text-amber-400" />
                    <div>
                      <p className="text-xs font-semibold">Relevo Topográfico (Alto Relevo DEM)</p>
                      <p className="text-[10px] opacity-60">Serras, vales e montanhas em 3D</p>
                    </div>
                  </div>
                  <div className={`w-10 h-6 rounded-full p-1 transition-colors ${activeLayers.includes('relevo') ? 'bg-[#A67C52]' : 'bg-white/20'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${activeLayers.includes('relevo') ? 'translate-x-4' : ''}`} />
                  </div>
                </div>

                {/* Prédios e Edificações 3D */}
                <div 
                  onClick={() => toggleLayer('buildings')}
                  className="flex items-center justify-between p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3">
                    <Building2 size={18} className="text-indigo-400" />
                    <div>
                      <p className="text-xs font-semibold">Prédios em 3D (Extrusão)</p>
                      <p className="text-[10px] opacity-60">Visualizar edifícios volumétricos reais</p>
                    </div>
                  </div>
                  <div className={`w-10 h-6 rounded-full p-1 transition-colors ${activeLayers.includes('buildings') ? 'bg-[#A67C52]' : 'bg-white/20'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${activeLayers.includes('buildings') ? 'translate-x-4' : ''}`} />
                  </div>
                </div>

                {/* Nuvens e Atmosfera */}
                <div 
                  onClick={() => toggleLayer('atmosphere')}
                  className="flex items-center justify-between p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3">
                    <CloudSun size={18} className="text-sky-400" />
                    <div>
                      <p className="text-xs font-semibold">Nuvens, Céu e Atmosfera 3D</p>
                      <p className="text-[10px] opacity-60">Iluminação solar, horizonte e estrelas</p>
                    </div>
                  </div>
                  <div className={`w-10 h-6 rounded-full p-1 transition-colors ${activeLayers.includes('atmosphere') ? 'bg-[#A67C52]' : 'bg-white/20'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${activeLayers.includes('atmosphere') ? 'translate-x-4' : ''}`} />
                  </div>
                </div>

                {/* Territórios Demarcados */}
                <div 
                  onClick={() => toggleLayer('territories')}
                  className="flex items-center justify-between p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3">
                    <Hexagon size={18} className="text-emerald-400" />
                    <div>
                      <p className="text-xs font-semibold">Territórios Demarcados</p>
                      <p className="text-[10px] opacity-60">Exibir perímetros salvos no mapa</p>
                    </div>
                  </div>
                  <div className={`w-10 h-6 rounded-full p-1 transition-colors ${activeLayers.includes('territories') ? 'bg-[#A67C52]' : 'bg-white/20'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${activeLayers.includes('territories') ? 'translate-x-4' : ''}`} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. MODAL DE VISUALIZAÇÃO DE PLANILHA (SPREADSHEET INSPECTOR) */}
      {activeModal === 'spreadsheet' && parsedSpreadsheet && (
        <div className="absolute inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200">
          <div className="liquid-glass rounded-3xl p-6 sm:p-8 w-full max-w-4xl max-h-[90vh] border border-white/20 shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <FileSpreadsheet size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg">{parsedSpreadsheet.fileName}</h3>
                  <p className="text-xs opacity-60">
                    {parsedSpreadsheet.rows.length} registros | Mapeamento de Coordenadas NUGEP MAPS
                  </p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-2 hover:bg-white/10 rounded-xl">
                <X size={20} />
              </button>
            </div>

            <div className="py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0 border-b border-white/10">
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-amber-400 block mb-1">Coluna Latitude *</label>
                <select
                  value={latColumn}
                  onChange={e => setLatColumn(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#A67C52]"
                >
                  <option value="" disabled>Selecione...</option>
                  {parsedSpreadsheet.headers.map(h => (
                    <option key={h} value={h} className="bg-gray-900 text-white">{h}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-amber-400 block mb-1">Coluna Longitude *</label>
                <select
                  value={lngColumn}
                  onChange={e => setLngColumn(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#A67C52]"
                >
                  <option value="" disabled>Selecione...</option>
                  {parsedSpreadsheet.headers.map(h => (
                    <option key={h} value={h} className="bg-gray-900 text-white">{h}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-1">Coluna Título / Nome</label>
                <select
                  value={titleColumn}
                  onChange={e => setTitleColumn(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs outline-none"
                >
                  <option value="">Nenhum (Padrão)</option>
                  {parsedSpreadsheet.headers.map(h => (
                    <option key={h} value={h} className="bg-gray-900 text-white">{h}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-1">Coluna Categoria</label>
                <select
                  value={categoryColumn}
                  onChange={e => setCategoryColumn(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs outline-none"
                >
                  <option value="">Nenhum (Padrão)</option>
                  {parsedSpreadsheet.headers.map(h => (
                    <option key={h} value={h} className="bg-gray-900 text-white">{h}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar my-4 rounded-2xl border border-white/10 bg-black/20">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-black/80 backdrop-blur-md border-b border-white/10 z-10">
                  <tr>
                    <th className="p-3 font-bold opacity-60">Status Coordenada</th>
                    {parsedSpreadsheet.headers.map(h => (
                      <th 
                        key={h} 
                        className={`p-3 font-bold whitespace-nowrap ${
                          h === latColumn || h === lngColumn ? 'text-amber-400 bg-amber-500/10' : 'opacity-80'
                        }`}
                      >
                        {h} {h === latColumn ? '(LAT)' : h === lngColumn ? '(LON)' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {parsedSpreadsheet.rows.slice(0, 30).map((row, rIdx) => {
                    const lat = parseCoord(row[latColumn]);
                    const lng = parseCoord(row[lngColumn]);
                    const isValid = lat !== 0 && lng !== 0 && !isNaN(lat) && !isNaN(lng);

                    return (
                      <tr key={rIdx} className="hover:bg-white/5 transition-colors">
                        <td className="p-3">
                          {isValid ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
                              <Check size={10} /> {lat.toFixed(4)}, {lng.toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                              Inválida
                            </span>
                          )}
                        </td>
                        {parsedSpreadsheet.headers.map(h => (
                          <td 
                            key={h} 
                            className={`p-3 truncate max-w-[180px] ${
                              h === latColumn || h === lngColumn ? 'font-mono text-amber-300 bg-amber-500/5' : 'opacity-70'
                            }`}
                          >
                            {String(row[h] || '-')}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t border-white/10 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs opacity-60">
                Os dados georreferenciados serão demarcados no mapa e armazenados com persistência local.
              </span>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => applySpreadsheetToMap(false)}
                  className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-bold bg-[#A67C52] hover:bg-[#8F653E] text-white transition-all shadow-md active:scale-95"
                >
                  Demarcar Pontos no Mapa
                </button>
                <button
                  onClick={() => applySpreadsheetToMap(true)}
                  className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <Hexagon size={14} />
                  <span>Demarcar como Território</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. MODAL DE CONFIGURAÇÕES (TEMA CLARO/ESCURO, ESCALA, INFO DO SISTEMA) */}
      {activeModal === 'settings' && (
        <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="liquid-glass rounded-3xl p-6 sm:p-8 w-full max-w-lg border border-white/20 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
              <div className="flex items-center gap-2">
                <Settings size={20} className="text-[#A67C52]" />
                <h3 className="font-bold text-base sm:text-lg">Configurações do NUGEP MAPS</h3>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-1.5 hover:bg-white/10 rounded-xl">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Tema Visual */}
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-2">Tema Visual (Liquid Glass)</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      setTheme('dark');
                      localStorage.setItem('nugep_theme', 'dark');
                    }}
                    className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2.5 transition-all ${
                      theme === 'dark'
                        ? 'bg-[#A67C52]/20 border-[#A67C52] text-amber-300 shadow-md'
                        : 'bg-white/5 border-white/10 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <Moon size={18} />
                    <span>Escuro (Obsidian)</span>
                  </button>

                  <button
                    onClick={() => {
                      setTheme('light');
                      localStorage.setItem('nugep_theme', 'light');
                    }}
                    className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2.5 transition-all ${
                      theme === 'light'
                        ? 'bg-[#A67C52]/20 border-[#A67C52] text-amber-300 shadow-md'
                        : 'bg-white/5 border-white/10 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <Sun size={18} />
                    <span>Claro (Crystal)</span>
                  </button>
                </div>
              </div>

              {/* Escala de Tamanho */}
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-2">Tamanho da Interface</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['compact', 'standard', 'expanded'] as const).map(scale => (
                    <button
                      key={scale}
                      onClick={() => {
                        setUiScale(scale);
                        localStorage.setItem('nugep_ui_scale', scale);
                      }}
                      className={`py-2.5 rounded-xl border text-xs font-semibold capitalize transition-all ${
                        uiScale === scale
                          ? 'bg-[#A67C52] text-white border-amber-400 shadow-sm'
                          : 'bg-white/5 border-white/10 opacity-70 hover:opacity-100'
                      }`}
                    >
                      {scale === 'compact' ? 'Compacto' : scale === 'standard' ? 'Padrão' : 'Expandido'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Informações Técnicas */}
              <div className="pt-4 border-t border-white/10 space-y-2">
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-2">Ficha Técnica do Sistema</label>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2.5 text-xs">
                  <div className="flex justify-between">
                    <span className="opacity-60">Sistema</span>
                    <span className="font-bold text-white">NUGEP MAPS Pro 3D</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-60">Motor Cartográfico</span>
                    <span className="font-semibold">Mapbox GL 3D Terrain & Building Extrusion</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-60">Datum Geodésico</span>
                    <span className="font-semibold">SIRGAS 2000 / WGS 84 (Globo 3D)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-60">Pontos Mapeados</span>
                    <span className="font-semibold text-amber-400">{objetos.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-60">Territórios Salvos</span>
                    <span className="font-semibold text-emerald-400">{demarcatedTerritories.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-60">Persistência</span>
                    <span className="text-emerald-400 font-semibold">Ativa (LocalStorage Local)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL DE TERRITÓRIOS DEMARCADOS */}
      {activeModal === 'territories_list' && (
        <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="liquid-glass rounded-3xl p-6 sm:p-8 w-full max-w-lg border border-white/20 shadow-2xl relative max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0 mb-4">
              <div className="flex items-center gap-2">
                <Hexagon size={20} className="text-emerald-500" />
                <h3 className="font-bold text-base sm:text-lg">Territórios Demarcados ({demarcatedTerritories.length})</h3>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-1.5 hover:bg-white/10 rounded-xl">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
              {demarcatedTerritories.length === 0 ? (
                <div className="py-12 text-center opacity-60">
                  <Hexagon size={36} className="mx-auto mb-2 opacity-40" />
                  <p className="text-xs">Nenhum território demarcado ainda.</p>
                  <p className="text-[11px] opacity-75 mt-1">Use a ferramenta de polígono no trilho lateral ou importe uma planilha para criar perímetros.</p>
                </div>
              ) : (
                demarcatedTerritories.map(terr => (
                  <div 
                    key={terr.id} 
                    className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-3 hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: terr.cor }} />
                      <div>
                        <h4 className="font-semibold text-xs sm:text-sm">{terr.nome}</h4>
                        <p className="text-[11px] opacity-60">
                          {terr.areaHectares} hectares | {terr.areaKm2} km² | {terr.pontos.length} vértices
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenExportDossier(terr)}
                        className="p-2 rounded-xl bg-[#A67C52]/20 hover:bg-[#A67C52]/30 text-[#A67C52] text-xs flex items-center gap-1 font-bold"
                        title="Exportar Dossiê em PDF"
                      >
                        <Download size={14} />
                      </button>

                      <button
                        onClick={() => {
                          const lats = terr.pontos.map(p => p[1]);
                          const lngs = terr.pontos.map(p => p[0]);
                          const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
                          const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
                          setViewState(prev => ({ ...prev, latitude: centerLat, longitude: centerLng, zoom: 15 }));
                          setActiveModal(null);
                        }}
                        className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs"
                        title="Focar no mapa"
                      >
                        <Compass size={14} />
                      </button>

                      <button
                        onClick={() => {
                          setDemarcatedTerritories(prev => prev.filter(t => t.id !== terr.id));
                          showToast('Território removido.');
                        }}
                        className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs"
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL DE EXPORTAÇÃO DO DOSSIÊ CARTOGRÁFICO COM MARCA D'ÁGUA DO NUGEP */}
      {activeModal === 'export_dossier' && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="liquid-glass rounded-3xl p-6 sm:p-8 w-full max-w-3xl max-h-[92vh] border border-[#A67C52]/40 shadow-2xl flex flex-col overflow-hidden relative watermark-nugep">
            
            {/* Header do Dossiê */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-black/40 border border-[#A67C52] flex items-center justify-center shadow-lg">
                  <Landmark size={20} color="#A67C52" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base sm:text-lg tracking-wide">Dossiê Cartográfico Oficial NUGEP</h3>
                  <p className="text-xs opacity-60">
                    Certificado de Demarcação Territorial com Marca d'Água do Núcleo
                  </p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-2 hover:bg-white/10 rounded-xl">
                <X size={20} />
              </button>
            </div>

            {/* Conteúdo do Dossiê para Pré-visualização */}
            <div className="flex-1 overflow-y-auto custom-scrollbar my-4 space-y-4 pr-1">
              
              {/* Snapshot do Mapa */}
              <div className="w-full h-56 rounded-2xl overflow-hidden border border-white/15 bg-black/40 relative flex items-center justify-center">
                {printImage ? (
                  <img src={printImage} alt="Snapshot do Território" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2 opacity-50">
                    <Globe size={32} />
                    <p className="text-xs">Gerando visualização cartográfica...</p>
                  </div>
                )}
                {/* Selo sobre o mapa */}
                <div className="absolute bottom-3 right-3 px-3 py-1 rounded-lg liquid-glass border border-white/20 text-[10px] font-mono flex items-center gap-1.5 shadow-xl">
                  <ShieldCheck size={12} className="text-emerald-400" />
                  <span>NUGEP MAPS 3D • CERTIFICADO</span>
                </div>
              </div>

              {/* Informações do Território Selecionado */}
              {selectedTerritory ? (
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400">Território Homologado</span>
                      <h4 className="text-base font-bold text-white">{selectedTerritory.nome}</h4>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">Área Oficial</span>
                      <p className="text-base font-black text-amber-300">{selectedTerritory.areaHectares} ha</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/10 text-xs">
                    <div>
                      <span className="opacity-60 block text-[10px] uppercase">Área em km²</span>
                      <span className="font-bold">{selectedTerritory.areaKm2} km²</span>
                    </div>
                    <div>
                      <span className="opacity-60 block text-[10px] uppercase">Área em m²</span>
                      <span className="font-bold">{selectedTerritory.areaM2.toLocaleString('pt-BR')} m²</span>
                    </div>
                    <div>
                      <span className="opacity-60 block text-[10px] uppercase">Perímetro</span>
                      <span className="font-bold">{selectedTerritory.perimetroKm} km</span>
                    </div>
                    <div>
                      <span className="opacity-60 block text-[10px] uppercase">Vértices</span>
                      <span className="font-bold">{selectedTerritory.pontos.length} coordenadas</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-xs text-amber-300">
                  Nenhum território específico selecionado. O dossiê incluirá todos os pontos cadastrados ({objetos.length} registros).
                </div>
              )}

              {/* Tabela de Vértices do Perímetro */}
              {selectedTerritory && (
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                  <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 block">Coordenadas dos Vértices Perimetrais (Datum SIRGAS 2000 / WGS 84)</span>
                  <div className="max-h-36 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left text-xs border-collapse font-mono">
                      <thead>
                        <tr className="border-b border-white/10 opacity-60">
                          <th className="py-1">Vértice</th>
                          <th className="py-1">Latitude</th>
                          <th className="py-1">Longitude</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {selectedTerritory.pontos.map((p, idx) => (
                          <tr key={idx}>
                            <td className="py-1 opacity-70">P{idx + 1}</td>
                            <td className="py-1 text-amber-300">{p[1].toFixed(6)}°</td>
                            <td className="py-1 text-amber-300">{p[0].toFixed(6)}°</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Parecer do Núcleo */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-xs space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 block">Autenticação Cartográfica NUGEP</span>
                <p className="text-[11px] opacity-75 leading-relaxed">
                  Este documento consolida as coordenadas e delimitações espaciais computadas através do sistema de georreferenciamento tridimensional do NUGEP. As demarcações utilizam malha de relevo topográfico DEM com precisão geodésica.
                </p>
                <div className="flex justify-between pt-2 text-[10px] opacity-50 font-mono">
                  <span>EMITIDO EM: {new Date().toLocaleDateString('pt-BR')}</span>
                  <span>RESPONSÁVEL: NÚCLEO DE GESTÃO E PESQUISA</span>
                </div>
              </div>

            </div>

            {/* Ações */}
            <div className="pt-3 border-t border-white/10 shrink-0 flex items-center justify-between gap-3">
              <span className="text-xs opacity-60 hidden sm:inline">
                A marca d'água oficial do NUGEP é aplicada automaticamente no fundo da página impressa.
              </span>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-gray-300 transition-all"
                >
                  Fechar
                </button>
                <button
                  onClick={triggerPrintPDF}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#A67C52] hover:bg-[#8F653E] text-white transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                >
                  <Printer size={16} />
                  <span>Imprimir / Salvar em PDF</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL DE INFORMAÇÕES DO SISTEMA */}
      {activeModal === 'info' && (
        <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="liquid-glass rounded-3xl p-6 sm:p-8 w-full max-w-md border border-white/20 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2.5">
                <Landmark size={22} color="#A67C52" />
                <h3 className="font-bold text-base sm:text-lg">NUGEP MAPS 3D</h3>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-1.5 hover:bg-white/10 rounded-xl">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 text-xs sm:text-sm opacity-80 leading-relaxed">
              <p>
                Plataforma de inteligência cartográfica e demarcação territorial museológica do Núcleo de Gestão e Pesquisa (NUGEP).
              </p>
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-xs space-y-2">
                <p><span className="font-bold text-white">Versão:</span> NUGEP MAPS 3D v8.0</p>
                <p><span className="font-bold text-white">Interface:</span> Liquid Glass Fullscreen</p>
                <p><span className="font-bold text-white">Relevo:</span> DEM Tridimensional de Alta Resolução</p>
                <p><span className="font-bold text-white">Geodésia:</span> Compatível com Datum SIRGAS 2000</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          DOCUMENTO OFICIAL PARA IMPRESSÃO EM PDF COM MARCA D'ÁGUA DO NUGEP
          ========================================================================= */}
      <div className="print-only hidden print:block w-full text-black p-4 bg-white relative">
        {/* Marca d'água de impressão repetida no fundo */}
        <div className="print-watermark">
          NUGEP • NÚCLEO DE GESTÃO E PESQUISA{"\n"}DOCUMENTO CARTOGRÁFICO OFICIAL
        </div>

        {/* Cabeçalho do Dossiê */}
        <div className="border-b-4 border-[#A67C52] pb-4 mb-6 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl border-2 border-[#A67C52] flex items-center justify-center">
              <Landmark size={28} color="#A67C52" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-widest text-black">NUGEP MAPS</h1>
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-600">
                Núcleo de Gestão e Pesquisa • Dossiê de Demarcação Territorial
              </h2>
            </div>
          </div>
          <div className="text-right text-xs font-mono text-gray-500">
            <p>DATA: {new Date().toLocaleDateString('pt-BR')}</p>
            <p>CERTIFICADO: DOS-NUGEP-{Date.now().toString().slice(-6)}</p>
          </div>
        </div>

        {/* Imagem do Território Demarcado */}
        {printImage && (
          <div className="w-full h-80 rounded-2xl overflow-hidden border border-gray-300 mb-6 shadow-inner relative z-10">
            <img src={printImage} alt="Mapa Cartográfico" className="w-full h-full object-cover" />
          </div>
        )}

        {/* Informações do Território Demarcado */}
        {selectedTerritory && (
          <div className="mb-6 p-4 border border-gray-300 rounded-2xl bg-gray-50 relative z-10 print-page-break">
            <div className="flex justify-between items-center border-b pb-2 mb-3">
              <div>
                <span className="text-[10px] font-bold uppercase text-[#A67C52]">Território Analisado</span>
                <h3 className="text-lg font-bold text-black">{selectedTerritory.nome}</h3>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase text-gray-500">Área Calculada</span>
                <p className="text-lg font-black text-black">{selectedTerritory.areaHectares} hectares ({selectedTerritory.areaKm2} km²)</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs mb-4">
              <div>
                <span className="font-bold text-gray-500 block">Área em Metros Quadrados:</span>
                <span className="font-mono">{selectedTerritory.areaM2.toLocaleString('pt-BR')} m²</span>
              </div>
              <div>
                <span className="font-bold text-gray-500 block">Perímetro Total:</span>
                <span className="font-mono">{selectedTerritory.perimetroKm} km</span>
              </div>
              <div>
                <span className="font-bold text-gray-500 block">Total de Vértices:</span>
                <span className="font-mono">{selectedTerritory.pontos.length} coordenadas</span>
              </div>
            </div>

            {/* Vértices Georreferenciados */}
            <h4 className="text-xs font-bold uppercase border-b pb-1 mb-2 text-gray-700">Tabela de Coordenadas dos Vértices (SIRGAS 2000 / WGS 84)</h4>
            <table className="w-full text-xs text-left border-collapse font-mono">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="py-1">Vértice</th>
                  <th className="py-1">Latitude (Graus Decimais)</th>
                  <th className="py-1">Longitude (Graus Decimais)</th>
                </tr>
              </thead>
              <tbody>
                {selectedTerritory.pontos.map((p, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-1 font-bold">V{idx + 1}</td>
                    <td className="py-1">{p[1].toFixed(6)}°</td>
                    <td className="py-1">{p[0].toFixed(6)}°</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tabela de Pontos Cadastrados */}
        {objetos.length > 0 && (
          <div className="mb-6 relative z-10 print-page-break">
            <h4 className="text-sm font-bold uppercase border-b pb-1 mb-2 text-black">
              Pontos e Registros Georreferenciados ({objetos.length})
            </h4>
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b bg-gray-100">
                  <th className="p-1.5">Denominação</th>
                  <th className="p-1.5">Classificação</th>
                  <th className="p-1.5">Região/Autor</th>
                  <th className="p-1.5 font-mono">Latitude, Longitude</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {objetos.map(o => (
                  <tr key={o.id}>
                    <td className="p-1.5 font-medium">{o.titulo}</td>
                    <td className="p-1.5">{o.objeto}</td>
                    <td className="p-1.5">{o.autor}</td>
                    <td className="p-1.5 font-mono">{o.latitude.toFixed(5)}, {o.longitude.toFixed(5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Assinatura e Autenticação */}
        <div className="mt-12 pt-6 border-t-2 border-gray-300 flex justify-between items-end relative z-10 print-page-break">
          <div>
            <p className="text-[10px] uppercase font-bold text-gray-500">Sistema</p>
            <p className="text-xs font-bold">NUGEP MAPS • Cartografia Tridimensional</p>
            <p className="text-[10px] text-gray-500">Documento Oficial para Fins Técnicos e Museológicos</p>
          </div>
          <div className="text-center">
            <div className="w-56 border-b border-black mb-1" />
            <p className="text-xs font-bold">Responsável Técnico</p>
            <p className="text-[10px] text-gray-500">Núcleo de Gestão e Pesquisa (NUGEP)</p>
          </div>
        </div>
      </div>

    </div>
  );
}
