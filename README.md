# NUGEP Maps

Plataforma para localizar endereços, demarcar territórios e importar dados georreferenciados no mapa.

## Importação de planilhas

Aceita arquivos CSV, TSV, TXT, XLS e XLSX. No painel de importação, associe as colunas de coordenadas, nome, categoria e descrição. Os registros válidos são exibidos como marcadores e as descrições são incluídas nas anotações de cada ponto.

Os formatos suportados são:

- Latitude/longitude em graus decimais, com ponto ou vírgula decimal;
- Coordenadas em graus, minutos e segundos;
- UTM SIRGAS 2000 / WGS 84, selecionando a zona e o hemisfério. Para Alagoas, a configuração usual é zona 24 Sul.

Ao importar, o mapa enquadra todos os pontos válidos. A opção de criar território usa a sequência das linhas como vértices do polígono; use-a apenas quando a planilha estiver ordenada ao longo do perímetro.

## Configuração local

```bash
npm install
npm run dev
```

Para produção, defina `NEXT_PUBLIC_MAPBOX_TOKEN` no ambiente. Não versionar arquivos `.env`.
