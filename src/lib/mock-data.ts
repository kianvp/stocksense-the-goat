export type Stock = {
  symbol: string;
  name: string;
  sector: string;
  basePrice: number;
  marketCap: number; // in crores
  peRatio: number;
  dividendYield: number;
  eps: number;
  beta: number;
  week52High: number;
  week52Low: number;
  volume: number;
  about: string;
};

export const NIFTY_50: Stock[] = [
  { symbol: "RELIANCE", name: "Reliance Industries", sector: "Energy", basePrice: 2856.45, marketCap: 1932000, peRatio: 28.4, dividendYield: 0.32, eps: 100.5, beta: 1.05, week52High: 3024, week52Low: 2210, volume: 8450000, about: "India's largest conglomerate with interests in oil-to-chemicals, telecom (Jio), and retail." },
  { symbol: "TCS", name: "Tata Consultancy Services", sector: "IT", basePrice: 3942.10, marketCap: 1425000, peRatio: 31.2, dividendYield: 1.5, eps: 126.4, beta: 0.78, week52High: 4254, week52Low: 3060, volume: 2150000, about: "India's largest IT services company and part of the Tata Group." },
  { symbol: "INFY", name: "Infosys", sector: "IT", basePrice: 1814.55, marketCap: 752000, peRatio: 26.5, dividendYield: 2.1, eps: 68.5, beta: 0.85, week52High: 1953, week52Low: 1395, volume: 4920000, about: "Global leader in next-generation digital services and consulting." },
  { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Banking", basePrice: 1698.20, marketCap: 1290000, peRatio: 20.1, dividendYield: 1.1, eps: 84.4, beta: 0.92, week52High: 1794, week52Low: 1363, volume: 11250000, about: "India's largest private sector bank by assets and market capitalisation." },
  { symbol: "ICICIBANK", name: "ICICI Bank", sector: "Banking", basePrice: 1241.85, marketCap: 875000, peRatio: 18.9, dividendYield: 0.8, eps: 65.7, beta: 0.95, week52High: 1364, week52Low: 970, volume: 13420000, about: "Leading Indian multinational private bank." },
  { symbol: "SBIN", name: "State Bank of India", sector: "Banking", basePrice: 814.30, marketCap: 727000, peRatio: 9.8, dividendYield: 1.5, eps: 83.1, beta: 1.18, week52High: 912, week52Low: 600, volume: 24100000, about: "India's largest public sector bank." },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom", basePrice: 1632.40, marketCap: 920000, peRatio: 56.4, dividendYield: 0.5, eps: 28.9, beta: 0.66, week52High: 1779, week52Low: 1098, volume: 6840000, about: "Leading global telecommunications company." },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever", sector: "FMCG", basePrice: 2342.10, marketCap: 550000, peRatio: 52.1, dividendYield: 1.8, eps: 44.9, beta: 0.42, week52High: 2768, week52Low: 2172, volume: 1380000, about: "FMCG major with iconic brands like Surf, Lifebuoy, Dove and Lipton." },
  { symbol: "ITC", name: "ITC Ltd", sector: "FMCG", basePrice: 425.80, marketCap: 530000, peRatio: 26.2, dividendYield: 3.3, eps: 16.3, beta: 0.61, week52High: 499, week52Low: 392, volume: 9650000, about: "Multi-business conglomerate spanning FMCG, hotels, paperboards, packaging and agribusiness." },
  { symbol: "LT", name: "Larsen & Toubro", sector: "Infra", basePrice: 3624.00, marketCap: 498000, peRatio: 35.5, dividendYield: 0.7, eps: 102.1, beta: 1.21, week52High: 3886, week52Low: 2965, volume: 1480000, about: "India's largest engineering & construction company." },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", sector: "Banking", basePrice: 1748.55, marketCap: 348000, peRatio: 19.8, dividendYield: 0.1, eps: 88.4, beta: 0.88, week52High: 1942, week52Low: 1543, volume: 4520000, about: "Leading private sector bank in India." },
  { symbol: "AXISBANK", name: "Axis Bank", sector: "Banking", basePrice: 1098.40, marketCap: 339000, peRatio: 13.5, dividendYield: 0.1, eps: 81.4, beta: 1.12, week52High: 1340, week52Low: 951, volume: 8920000, about: "Third largest private sector bank in India." },
  { symbol: "MARUTI", name: "Maruti Suzuki India", sector: "Auto", basePrice: 11240.00, marketCap: 354000, peRatio: 28.8, dividendYield: 1.0, eps: 390.5, beta: 0.97, week52High: 13680, week52Low: 9737, volume: 480000, about: "India's largest passenger car manufacturer." },
  { symbol: "ASIANPAINT", name: "Asian Paints", sector: "Paints", basePrice: 2342.40, marketCap: 224500, peRatio: 50.2, dividendYield: 1.3, eps: 46.7, beta: 0.78, week52High: 3422, week52Low: 2125, volume: 1340000, about: "India's leading paint and decorative coatings company." },
  { symbol: "SUNPHARMA", name: "Sun Pharma", sector: "Pharma", basePrice: 1725.45, marketCap: 414000, peRatio: 39.4, dividendYield: 0.8, eps: 43.8, beta: 0.55, week52High: 1960, week52Low: 1280, volume: 2100000, about: "India's largest pharmaceutical company by revenue." },
  { symbol: "TITAN", name: "Titan Company", sector: "Consumer", basePrice: 3326.00, marketCap: 295000, peRatio: 88.2, dividendYield: 0.3, eps: 37.7, beta: 0.81, week52High: 3886, week52Low: 3056, volume: 940000, about: "Watches, jewellery (Tanishq) and eyewear major from the Tata Group." },
  { symbol: "BAJFINANCE", name: "Bajaj Finance", sector: "Finance", basePrice: 6918.00, marketCap: 428000, peRatio: 28.4, dividendYield: 0.5, eps: 243.6, beta: 1.25, week52High: 8190, week52Low: 6188, volume: 760000, about: "India's leading non-banking financial company." },
  { symbol: "WIPRO", name: "Wipro", sector: "IT", basePrice: 543.80, marketCap: 287000, peRatio: 24.8, dividendYield: 0.2, eps: 21.9, beta: 0.74, week52High: 605, week52Low: 384, volume: 7820000, about: "Leading global IT, consulting and business process services company." },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement", sector: "Cement", basePrice: 10982.00, marketCap: 318000, peRatio: 48.7, dividendYield: 0.5, eps: 225.5, beta: 1.04, week52High: 12134, week52Low: 8470, volume: 320000, about: "India's largest cement manufacturer and exporter." },
  { symbol: "NESTLEIND", name: "Nestle India", sector: "FMCG", basePrice: 2298.50, marketCap: 222000, peRatio: 76.4, dividendYield: 1.0, eps: 30.1, beta: 0.46, week52High: 2778, week52Low: 2120, volume: 410000, about: "Indian subsidiary of Nestle, with Maggi, Nescafe and KitKat among its brands." },
  { symbol: "POWERGRID", name: "Power Grid", sector: "Power", basePrice: 318.20, marketCap: 296000, peRatio: 19.4, dividendYield: 3.6, eps: 16.4, beta: 0.69, week52High: 366, week52Low: 245, volume: 6420000, about: "India's principal electric power transmission company." },
  { symbol: "NTPC", name: "NTPC", sector: "Power", basePrice: 366.40, marketCap: 355000, peRatio: 18.2, dividendYield: 2.1, eps: 20.1, beta: 0.85, week52High: 448, week52Low: 285, volume: 8120000, about: "India's largest power generation company." },
  { symbol: "TMPV", name: "Tata Motors PV", sector: "Auto", basePrice: 333.00, marketCap: 123000, peRatio: 11.8, dividendYield: 0.5, eps: 28.2, beta: 1.33, week52High: 739.7, week52Low: 294.3, volume: 18500000, about: "Tata Motors Passenger Vehicles — the demerged PV and EV business of Tata Motors, parent of Jaguar Land Rover." },
  { symbol: "ADANIENT", name: "Adani Enterprises", sector: "Infra", basePrice: 2186.20, marketCap: 252000, peRatio: 71.2, dividendYield: 0.1, eps: 30.7, beta: 1.65, week52High: 3257, week52Low: 2025, volume: 3450000, about: "Flagship company of the Adani Group with diverse business interests." },
  { symbol: "ADANIPORTS", name: "Adani Ports & SEZ", sector: "Infra", basePrice: 1248.00, marketCap: 269000, peRatio: 27.5, dividendYield: 0.4, eps: 45.4, beta: 1.37, week52High: 1621, week52Low: 1014, volume: 4180000, about: "India's largest commercial port operator." },
  { symbol: "HCLTECH", name: "HCL Technologies", sector: "IT", basePrice: 1290.40, marketCap: 350000, peRatio: 26.9, dividendYield: 4.0, eps: 48.0, beta: 0.79, week52High: 1903, week52Low: 1245, volume: 3220000, about: "Multinational IT services and consulting company." },
  { symbol: "M&M", name: "Mahindra & Mahindra", sector: "Auto", basePrice: 2865.00, marketCap: 357000, peRatio: 25.7, dividendYield: 0.7, eps: 111.5, beta: 1.08, week52High: 3270, week52Low: 1786, volume: 1840000, about: "Major Indian SUV and tractor manufacturer." },
  { symbol: "TECHM", name: "Tech Mahindra", sector: "IT", basePrice: 1542.30, marketCap: 150000, peRatio: 34.1, dividendYield: 2.6, eps: 45.2, beta: 0.81, week52High: 1808, week52Low: 1180, volume: 2120000, about: "Indian multinational IT services and consulting company." },
  { symbol: "ONGC", name: "ONGC", sector: "Energy", basePrice: 268.50, marketCap: 338000, peRatio: 9.2, dividendYield: 4.5, eps: 29.2, beta: 1.12, week52High: 345, week52Low: 218, volume: 11420000, about: "India's largest crude oil and natural gas company." },
  { symbol: "INDUSINDBK", name: "IndusInd Bank", sector: "Banking", basePrice: 1188.50, marketCap: 92000, peRatio: 10.4, dividendYield: 1.4, eps: 114.5, beta: 1.21, week52High: 1694, week52Low: 936, volume: 6850000, about: "Private sector bank focused on retail and corporate banking." },
  { symbol: "BAJAJFINSV", name: "Bajaj Finserv", sector: "Finance", basePrice: 1645.00, marketCap: 262000, peRatio: 31.2, dividendYield: 0.1, eps: 52.7, beta: 1.12, week52High: 2025, week52Low: 1448, volume: 920000, about: "Holding company for the financial services businesses of the Bajaj Group." },
  { symbol: "JSWSTEEL", name: "JSW Steel", sector: "Metals", basePrice: 982.00, marketCap: 240000, peRatio: 32.8, dividendYield: 0.7, eps: 30.0, beta: 1.18, week52High: 1075, week52Low: 778, volume: 3820000, about: "Among India's largest steel producers." },
  { symbol: "TATASTEEL", name: "Tata Steel", sector: "Metals", basePrice: 162.00, marketCap: 202000, peRatio: 27.5, dividendYield: 2.2, eps: 5.9, beta: 1.31, week52High: 184, week52Low: 117, volume: 32500000, about: "One of the world's most geographically diversified steel producers." },
  { symbol: "GRASIM", name: "Grasim Industries", sector: "Cement", basePrice: 2548.00, marketCap: 172000, peRatio: 24.2, dividendYield: 0.4, eps: 105.3, beta: 1.08, week52High: 2878, week52Low: 1808, volume: 720000, about: "Flagship of the Aditya Birla Group, into cement, chemicals and viscose fibres." },
  { symbol: "HDFCLIFE", name: "HDFC Life", sector: "Insurance", basePrice: 648.00, marketCap: 139000, peRatio: 80.5, dividendYield: 0.3, eps: 8.1, beta: 0.66, week52High: 729, week52Low: 511, volume: 4220000, about: "Leading long-term life insurance solutions provider." },
  { symbol: "SBILIFE", name: "SBI Life Insurance", sector: "Insurance", basePrice: 1645.00, marketCap: 165000, peRatio: 84.2, dividendYield: 0.2, eps: 19.5, beta: 0.74, week52High: 1936, week52Low: 1308, volume: 1380000, about: "One of India's leading life insurance companies." },
  { symbol: "COALINDIA", name: "Coal India", sector: "Energy", basePrice: 447.00, marketCap: 275000, peRatio: 8.4, dividendYield: 5.2, eps: 53.2, beta: 1.05, week52High: 543, week52Low: 348, volume: 9120000, about: "World's largest coal producer." },
  { symbol: "DRREDDY", name: "Dr Reddy's Labs", sector: "Pharma", basePrice: 5412.00, marketCap: 90000, peRatio: 21.0, dividendYield: 0.7, eps: 257.7, beta: 0.62, week52High: 6810, week52Low: 4720, volume: 580000, about: "Multinational pharmaceutical company headquartered in Hyderabad." },
  { symbol: "CIPLA", name: "Cipla", sector: "Pharma", basePrice: 1448.00, marketCap: 117000, peRatio: 25.8, dividendYield: 0.9, eps: 56.1, beta: 0.58, week52High: 1715, week52Low: 1190, volume: 1880000, about: "Indian multinational pharmaceutical and biotechnology company." },
  { symbol: "DIVISLAB", name: "Divi's Labs", sector: "Pharma", basePrice: 4648.00, marketCap: 123000, peRatio: 64.5, dividendYield: 0.6, eps: 72.0, beta: 0.55, week52High: 5198, week52Low: 3458, volume: 380000, about: "Manufacturer of active pharmaceutical ingredients (APIs)." },
  { symbol: "EICHERMOT", name: "Eicher Motors", sector: "Auto", basePrice: 4748.00, marketCap: 130000, peRatio: 31.7, dividendYield: 0.8, eps: 149.8, beta: 0.96, week52High: 5301, week52Low: 3457, volume: 460000, about: "Parent of Royal Enfield and Volvo Eicher Commercial Vehicles." },
  { symbol: "HEROMOTOCO", name: "Hero MotoCorp", sector: "Auto", basePrice: 4124.00, marketCap: 82000, peRatio: 22.5, dividendYield: 3.2, eps: 183.3, beta: 0.91, week52High: 6244, week52Low: 3580, volume: 720000, about: "World's largest two-wheeler manufacturer by volume." },
  { symbol: "BAJAJ-AUTO", name: "Bajaj Auto", sector: "Auto", basePrice: 9348.00, marketCap: 260000, peRatio: 35.8, dividendYield: 2.4, eps: 261.1, beta: 0.97, week52High: 12774, week52Low: 7488, volume: 380000, about: "Major Indian two-wheeler and three-wheeler manufacturer." },
  { symbol: "HDFC", name: "HDFC Ltd", sector: "Finance", basePrice: 2842.00, marketCap: 530000, peRatio: 18.5, dividendYield: 1.7, eps: 153.6, beta: 0.92, week52High: 3018, week52Low: 2426, volume: 2200000, about: "Pioneer of housing finance in India." },
  { symbol: "BRITANNIA", name: "Britannia Industries", sector: "FMCG", basePrice: 4648.00, marketCap: 112000, peRatio: 56.0, dividendYield: 1.5, eps: 83.0, beta: 0.42, week52High: 5664, week52Low: 4513, volume: 320000, about: "One of India's leading food companies, famous for biscuits." },
  { symbol: "BPCL", name: "Bharat Petroleum", sector: "Energy", basePrice: 295.00, marketCap: 128000, peRatio: 5.4, dividendYield: 7.2, eps: 54.6, beta: 1.18, week52High: 376, week52Low: 248, volume: 5680000, about: "Maharatna PSU oil and gas refining and marketing company." },
  { symbol: "NESTLE", name: "Nestle India (alt)", sector: "FMCG", basePrice: 2298.00, marketCap: 222000, peRatio: 76.4, dividendYield: 1.0, eps: 30.1, beta: 0.46, week52High: 2778, week52Low: 2120, volume: 410000, about: "Subsidiary of Nestle SA." },
  { symbol: "TATACONSUM", name: "Tata Consumer", sector: "FMCG", basePrice: 1085.00, marketCap: 103000, peRatio: 80.5, dividendYield: 0.7, eps: 13.5, beta: 0.62, week52High: 1268, week52Low: 880, volume: 1820000, about: "Consumer products arm of the Tata Group." },
  { symbol: "APOLLOHOSP", name: "Apollo Hospitals", sector: "Healthcare", basePrice: 6648.00, marketCap: 95000, peRatio: 92.8, dividendYield: 0.2, eps: 71.6, beta: 0.78, week52High: 7546, week52Low: 5234, volume: 280000, about: "Largest network of for-profit private hospitals in India." },
  { symbol: "HINDALCO", name: "Hindalco", sector: "Metals", basePrice: 645.00, marketCap: 144000, peRatio: 12.3, dividendYield: 0.6, eps: 52.5, beta: 1.32, week52High: 772, week52Low: 480, volume: 7240000, about: "Aluminium and copper manufacturing giant from the Aditya Birla Group." },
];

export const SECTORS = [
  "Banking", "IT", "Energy", "Auto", "FMCG", "Pharma", "Infra",
  "Telecom", "Power", "Metals", "Finance", "Cement", "Insurance",
  "Healthcare", "Paints", "Consumer",
];

export const INDICES = [
  { symbol: "NIFTY50", name: "Nifty 50", base: 23898, range: 250 },
  { symbol: "SENSEX", name: "Sensex", base: 76664, range: 700 },
  { symbol: "BANKNIFTY", name: "Nifty Bank", base: 53072, range: 380 },
  { symbol: "NIFTYIT", name: "Nifty IT", base: 33160, range: 320 },
  { symbol: "NIFTYAUTO", name: "Nifty Auto", base: 23854, range: 280 },
  { symbol: "NIFTYPHARMA", name: "Nifty Pharma", base: 18420, range: 180 },
];

export const SECTOR_PERFORMANCE: Array<{ sector: string; change: number }> = [
  { sector: "IT", change: 1.42 },
  { sector: "Banking", change: -0.85 },
  { sector: "Auto", change: 2.18 },
  { sector: "Pharma", change: 0.62 },
  { sector: "Energy", change: -1.20 },
  { sector: "FMCG", change: 0.35 },
  { sector: "Metals", change: -2.40 },
  { sector: "Realty", change: 1.05 },
  { sector: "Infra", change: -0.55 },
  { sector: "Telecom", change: 0.88 },
  { sector: "Finance", change: -0.40 },
];

export function getStock(symbol: string) {
  return NIFTY_50.find((s) => s.symbol.toLowerCase() === symbol.toLowerCase());
}

// Deterministic pseudo-random for SSR/CSR consistency
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function generatePriceHistory(basePrice: number, days = 30, seed = 1) {
  const points: { date: string; price: number }[] = [];
  const today = new Date();
  let price = basePrice * 0.92;
  for (let i = days; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const noise = (seededRandom(seed + i) - 0.5) * basePrice * 0.018;
    const trend = (basePrice - price) * 0.06;
    price = Math.max(basePrice * 0.7, price + noise + trend);
    points.push({
      date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      price: Math.round(price * 100) / 100,
    });
  }
  return points;
}

export function generateForecast(lastPrice: number, days = 7, seed = 1) {
  const points: { date: string; price: number }[] = [];
  const today = new Date();
  let price = lastPrice;
  const drift = (seededRandom(seed) - 0.5) * 0.012;
  for (let i = 1; i <= days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const noise = (seededRandom(seed + i + 100) - 0.5) * lastPrice * 0.008;
    price = price * (1 + drift) + noise;
    points.push({
      date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      price: Math.round(price * 100) / 100,
    });
  }
  return points;
}

export function generateIntraday(base: number, points = 78, seed = 1) {
  const out: { time: string; price: number }[] = [];
  let p = base * 0.997;
  const start = new Date();
  start.setHours(9, 15, 0, 0);
  for (let i = 0; i < points; i++) {
    const t = new Date(start.getTime() + i * 5 * 60 * 1000);
    p += (seededRandom(seed + i) - 0.5) * base * 0.0018;
    out.push({
      time: t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      price: Math.round(p * 100) / 100,
    });
  }
  return out;
}
