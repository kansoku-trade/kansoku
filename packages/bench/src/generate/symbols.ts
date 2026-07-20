export interface ArchiveTermSpec {
  strongTerms: string[];
  weakTerm: string;
  bankOrAssetManagerBrand?: boolean;
}

export interface SymbolSpec {
  symbol: string;
  layer:
    | 'high-vol-tech'
    | 'mega-blue-chip'
    | 'defensive'
    | 'cyclical'
    | 'index-etf'
    | 'commodity'
    | 'crypto';
  companyQuery?: string | null;
  cik?: string | null;
  archiveTerms?: ArchiveTermSpec | null;
}

export const DEFAULT_SYMBOLS: SymbolSpec[] = [
  {
    symbol: 'MU.US',
    layer: 'high-vol-tech',
    companyQuery: 'Micron Technology',
    cik: '0000723125',
    archiveTerms: { strongTerms: ['micron technology'], weakTerm: 'micron' },
  },
  {
    symbol: 'NVDA.US',
    layer: 'high-vol-tech',
    companyQuery: 'Nvidia',
    cik: '0001045810',
    archiveTerms: { strongTerms: ['nvidia corp', 'nvidia corporation'], weakTerm: 'nvidia' },
  },
  {
    symbol: 'MRVL.US',
    layer: 'high-vol-tech',
    companyQuery: 'Marvell Technology',
    cik: '0001835632',
    archiveTerms: { strongTerms: ['marvell technology'], weakTerm: 'marvell' },
  },
  {
    symbol: 'AMD.US',
    layer: 'high-vol-tech',
    companyQuery: 'Advanced Micro Devices',
    cik: '0000002488',
    archiveTerms: { strongTerms: ['advanced micro devices'], weakTerm: 'amd' },
  },
  {
    symbol: 'PLTR.US',
    layer: 'high-vol-tech',
    companyQuery: 'Palantir Technologies',
    cik: '0001321655',
    archiveTerms: { strongTerms: ['palantir technologies'], weakTerm: 'palantir' },
  },
  {
    symbol: 'TSLA.US',
    layer: 'high-vol-tech',
    companyQuery: 'Tesla Inc',
    cik: '0001318605',
    archiveTerms: { strongTerms: ['tesla inc', 'tesla motors'], weakTerm: 'tesla' },
  },
  {
    symbol: 'MSFT.US',
    layer: 'mega-blue-chip',
    companyQuery: 'Microsoft',
    cik: '0000789019',
    archiveTerms: {
      strongTerms: ['microsoft corp', 'microsoft corporation'],
      weakTerm: 'microsoft',
    },
  },
  {
    symbol: 'AAPL.US',
    layer: 'mega-blue-chip',
    companyQuery: 'Apple Inc',
    cik: '0000320193',
    archiveTerms: { strongTerms: ['apple inc'], weakTerm: 'apple' },
  },
  {
    symbol: 'GOOGL.US',
    layer: 'mega-blue-chip',
    companyQuery: 'Alphabet Google',
    cik: '0001652044',
    archiveTerms: { strongTerms: ['alphabet inc'], weakTerm: 'google' },
  },
  {
    symbol: 'JPM.US',
    layer: 'mega-blue-chip',
    companyQuery: 'JPMorgan Chase',
    cik: '0000019617',
    archiveTerms: {
      strongTerms: ['jpmorgan chase', 'jp morgan chase'],
      weakTerm: 'jpmorgan',
      bankOrAssetManagerBrand: true,
    },
  },
  {
    symbol: 'UNH.US',
    layer: 'mega-blue-chip',
    companyQuery: 'UnitedHealth Group',
    cik: '0000731766',
    archiveTerms: { strongTerms: ['unitedhealth group'], weakTerm: 'unitedhealth' },
  },
  {
    symbol: 'KO.US',
    layer: 'defensive',
    companyQuery: 'Coca-Cola Company',
    cik: '0000021344',
    archiveTerms: { strongTerms: ['coca cola company', 'coca cola co'], weakTerm: 'coca cola' },
  },
  {
    symbol: 'PG.US',
    layer: 'defensive',
    companyQuery: 'Procter & Gamble',
    cik: '0000080424',
    archiveTerms: { strongTerms: ['procter gamble', 'procter and gamble'], weakTerm: 'procter' },
  },
  {
    symbol: 'XOM.US',
    layer: 'cyclical',
    companyQuery: 'Exxon Mobil',
    cik: '0000034088',
    archiveTerms: { strongTerms: ['exxon mobil', 'exxonmobil'], weakTerm: 'exxon' },
  },
  {
    symbol: 'CAT.US',
    layer: 'cyclical',
    companyQuery: 'Caterpillar Inc',
    cik: '0000018230',
    archiveTerms: { strongTerms: ['caterpillar inc'], weakTerm: 'caterpillar' },
  },
  {
    symbol: 'FCX.US',
    layer: 'cyclical',
    companyQuery: 'Freeport-McMoRan',
    cik: '0000831259',
    archiveTerms: { strongTerms: ['freeport mcmoran'], weakTerm: 'freeport' },
  },
  { symbol: 'SPY.US', layer: 'index-etf', companyQuery: null, cik: null, archiveTerms: null },
  { symbol: 'QQQ.US', layer: 'index-etf', companyQuery: null, cik: null, archiveTerms: null },
  { symbol: 'SMH.US', layer: 'index-etf', companyQuery: null, cik: null, archiveTerms: null },
  { symbol: 'IWM.US', layer: 'index-etf', companyQuery: null, cik: null, archiveTerms: null },
  {
    symbol: 'GC=F',
    layer: 'commodity',
    companyQuery: null,
    cik: null,
    archiveTerms: null,
  },
  {
    symbol: 'BTC-USD',
    layer: 'crypto',
    companyQuery: null,
    cik: null,
    archiveTerms: null,
  },
];

export function layerForSymbol(symbol: string): SymbolSpec['layer'] {
  return specForSymbol(symbol).layer;
}

export function specForSymbol(symbol: string): SymbolSpec {
  const found = DEFAULT_SYMBOLS.find((s) => s.symbol === symbol);
  if (!found) throw new Error(`unknown symbol ${symbol}: not in the default 20-name universe`);
  return found;
}
