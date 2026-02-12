#!/usr/bin/env node

// Node 18+ tem fetch nativo
const crypto = require('crypto');

// Credenciais das GitHub Secrets
const API_KEY = process.env.POLYMARKET_API_KEY;
const API_SECRET = process.env.POLYMARKET_API_SECRET;
const API_PASSPHRASE = process.env.POLYMARKET_API_PASSPHRASE;
const WALLET_ADDRESS = process.env.POLYMARKET_WALLET;

const BASE_URL = 'https://clob.polymarket.com';

// Se não tiver credenciais, gera dados de exemplo (modo demo)
if (!API_KEY || !API_SECRET || !API_PASSPHRASE) {
  console.warn('⚠️  Credenciais CLOB não encontradas. Gerando dados de exemplo (demo mode)...');
  generateMockData();
  process.exit(0);
}

if (!WALLET_ADDRESS) {
  console.warn('⚠️  POLYMARKET_WALLET não configurada. Apenas dados de mercado serão coletados.');
}

// Assinatura HMAC
function signRequest(method, path, body = '', timestamp = Date.now()) {
  const secret = Buffer.from(API_SECRET, 'base64');
  const payload = `${timestamp}${method.toUpperCase()}${path}${body}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64');
  
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-BAPI-TIMESTAMP': timestamp,
    'X-BAPI-API-KEY': API_KEY,
    'X-BAPI-SIGN': signature,
    'X-BAPI-PASSPHRASE': API_PASSPHRASE
  };
}

// Fetch genérico
async function clobFetch(path, method = 'GET', body = null) {
  const url = `${BASE_URL}${path}`;
  const headers = signRequest(method, path, body || '');
  const options = { headers };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// Buscar mercados ativos
async function fetchMarkets(limit = 500) {
  const path = `/data?limit=${limit}&active=true&closed=false`;
  return clobFetch(path).then(data => data.data || data.markets || []);
}

// Buscar posições da carteira
async function fetchPositions() {
  if (!WALLET_ADDRESS) return [];
  const path = `/data/positions?address=${WALLET_ADDRESS}`;
  try {
    const data = await clobFetch(path);
    return data.positions || data.data || [];
  } catch (e) {
    console.warn('⚠️  Não foi possível buscar posições (permissão ou endpoint não disponível):', e.message);
    return [];
  }
}

// Buscar histórico de trades
async function fetchTrades(limit = 100) {
  if (!WALLET_ADDRESS) return [];
  const path = `/data/trades?address=${WALLET_ADDRESS}&limit=${limit}`;
  try {
    const data = await clobFetch(path);
    return data.trades || data.data || [];
  } catch (e) {
    console.warn('⚠️  Não foi possível buscar trades:', e.message);
    return [];
  }
}

// Calcular métricas de uma posição
function analyzePosition(position, market) {
  const size = parseFloat(position.size || 0);
  const entryPrice = parseFloat(position.entryPrice || 0);
  const currentPrice = parseFloat(market.lastTradePrice || market.bestBid || 0);
  const pnl = size * (currentPrice - entryPrice);
  const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
  
  const outcome = position.outcome || (position.side === 'YES' ? 'YES' : 'NO');
  const yesPrice = parseFloat(market.outcomePrices?.[0] || 0);
  const noPrice = parseFloat(market.outcomePrices?.[1] || 0);
  const spread = Math.abs(yesPrice - 0.5) * 2; // spread como % da probabilidade
  
  return {
    marketId: market.id,
    question: market.question || 'Sem título',
    outcome,
    size,
    entryPrice,
    currentPrice,
    pnl,
    pnlPercent,
    spread,
    volume24h: parseFloat(market.volume || 0),
    liquidity: parseFloat(market.liquidity || 0),
    timeLeft: calculateTimeLeft(market.endDate),
    category: market.category || 'Outros',
    isWinner: pnl > 0
  };
}

function calculateTimeLeft(endDate) {
  if (!endDate) return null;
  const end = new Date(endDate).getTime();
  const now = Date.now();
  const diff = end - now;
  if (diff <= 0) return 'Expirado';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours > 24) return `${Math.floor(hours/24)}d`;
  return `${hours}h`;
}

// Categorias preferidas (ajuste aqui)
const PREFERRED_CATEGORIES = ['Crypto', 'Elections', 'Politics', 'Sports', 'US-current-affairs', 'Coronavirus'];

// Identificar padrões de bons traders
function detectPatterns(positions, markets) {
  const patterns = [];
  
  for (const pos of positions) {
    const market = markets.find(m => m.id === pos.marketId);
    if (!market) continue;
    
    const analysis = analyzePosition(pos, market);
    
    // Critério de "bom trader": spread 1-3%, volume >$50k, categoria preferida, tempo adequado
    const isGoodPattern = 
      analysis.spread >= 1.0 && 
      analysis.spread <= 3.0 &&
      analysis.volume24h >= 50000 &&
      PREFERRED_CATEGORIES.includes(market.category) &&
      analysis.timeLeft && !analysis.timeLeft.includes('Expirado');
    
    if (isGoodPattern) {
      patterns.push({
        ...analysis,
        matchReason: `Spread ${analysis.spread.toFixed(1)}%, Volume $${(analysis.volume24h/1000).toFixed(0)}k, Categoria: ${market.category}, Tempo ${analysis.timeLeft}`
      });
    }
  }
  
  return patterns;
}

// Calcular estatísticas
function calculateStats(positions, markets) {
  const analyzed = positions.map(pos => {
    const market = markets.find(m => m.id === pos.marketId);
    return market ? analyzePosition(pos, market) : null;
  }).filter(Boolean);
  
  if (analyzed.length === 0) return null;
  
  const totalPnL = analyzed.reduce((sum, p) => sum + p.pnl, 0);
  const wins = analyzed.filter(p => p.isWinner).length;
  const losses = analyzed.filter(p => !p.isWinner).length;
  const avgGain = analyzed.filter(p => p.isWinner).reduce((sum, p) => sum + p.pnlPercent, 0) / wins || 0;
  const avgLoss = analyzed.filter(p => !p.isWinner).reduce((sum, p) => sum + Math.abs(p.pnlPercent), 0) / losses || 0;
  const profitFactor = avgLoss > 0 ? (avgGain / avgLoss) : 0;
  
  // Por categoria
  const byCategory = {};
  analyzed.forEach(p => {
    const cat = p.category || 'Outros';
    if (!byCategory[cat]) byCategory[cat] = { count: 0, pnl: 0 };
    byCategory[cat].count++;
    byCategory[cat].pnl += p.pnl;
  });
  
  // Top mercados
  const topMarkets = analyzed
    .reduce((acc, p) => {
      const existing = acc.find(m => m.marketId === p.marketId);
      if (existing) {
        existing.totalPnL += p.pnl;
        existing.trades++;
      } else {
        acc.push({ marketId: p.marketId, question: p.question, totalPnL: p.pnl, trades: 1 });
      }
      return acc;
    }, [])
    .sort((a, b) => b.totalPnL - a.totalPnL)
    .slice(0, 10);
  
  return {
    totalPositions: analyzed.length,
    totalPnL,
    winRate: wins / analyzed.length * 100,
    wins,
    losses,
    avgGain,
    avgLoss,
    profitFactor,
    byCategory: Object.entries(byCategory).map(([cat, stats]) => ({ category: cat, ...stats })).sort((a,b) => b.pnl - a.pnl),
    topMarkets,
    positions: analyzed
  };
}

async function main() {
  console.log('🔍 Buscando dados da CLOB API...');
  
  try {
    // Buscar dados em paralelo
    const [markets, positions, trades] = await Promise.all([
      fetchMarkets(500),
      fetchPositions(),
      fetchTrades(200)
    ]);
    
    console.log(`📊 Mercados: ${markets.length}, Posições: ${positions.length}, Trades: ${trades.length}`);
    
    // Analisar posições
    const stats = calculateStats(positions, markets);
    const patterns = detectPatterns(positions, markets);
    
    // Output
    const output = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalPositions: positions.length,
        totalMarkets: markets.length,
        patternsFound: patterns.length
      },
      stats: stats,
      patterns: patterns,
      recentMarkets: markets.slice(0, 100).map(m => ({
        id: m.id,
        question: m.question,
        yesPrice: parseFloat(m.outcomePrices?.[0] || 0),
        noPrice: parseFloat(m.outcomePrices?.[1] || 0),
        volume: parseFloat(m.volume || 0),
        liquidity: parseFloat(m.liquidity || 0),
        spread: Math.abs(parseFloat(m.outcomePrices?.[0] || 0) - 0.5) * 2,
        category: m.category
      })).filter(m => 
        m.spread >= 1.0 && 
        m.spread <= 3.0 && 
        m.volume >= 50000 &&
        PREFERRED_CATEGORIES.includes(m.category)
      )
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 20)
    };
    
    const fs = require('fs');
    fs.writeFileSync('data.json', JSON.stringify(output, null, 2));
    console.log(`✅ data.json gerado com ${positions.length} posições, ${patterns.length} padrões detectados`);
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

// Dados de exemplo para demo mode
function generateMockData() {
  const fs = require('fs');
  
  const now = new Date();
  const mockMarkets = [
    {
      id: "demo1",
      slug: "will-bitcoin-hit-100k-before-june-2025",
      question: "Will Bitcoin hit $100k before June 2025?",
      outcomePrices: ["0.485", "0.515"],
      volume: 1250000,
      liquidity: 50000,
      category: "Crypto",
      endDate: new Date(now.getTime() + 7*24*60*60*1000).toISOString()
    },
    {
      id: "demo2",
      slug: "will-fed-raise-rates-in-march",
      question: "Will Fed raise rates in March meeting?",
      outcomePrices: ["0.520", "0.480"],
      volume: 890000,
      liquidity: 75000,
      category: "Elections",
      endDate: new Date(now.getTime() + 30*24*60*60*1000).toISOString()
    },
    {
      id: "demo3",
      slug: "will-ethereum-reach-5k-by-end-of-2025",
      question: "Will Ethereum reach $5k by end of 2025?",
      outcomePrices: ["0.320", "0.680"],
      volume: 2100000,
      liquidity: 120000,
      category: "Crypto",
      endDate: new Date(now.getTime() + 200*24*60*60*1000).toISOString()
    },
    {
      id: "demo4",
      slug: "will-trump-win-2024-election",
      question: "Will Trump win 2024 election?",
      outcomePrices: ["0.550", "0.450"],
      volume: 3500000,
      liquidity: 200000,
      category: "Elections",
      endDate: new Date(now.getTime() + 60*24*60*60*1000).toISOString()
    },
    {
      id: "demo5",
      slug: "will-leeds-win-premier-league-2025-26",
      question: "Will Leeds win the 2025–26 English Premier League?",
      outcomePrices: ["0.180", "0.820"],
      volume: 36590082,
      liquidity: 857016,
      category: "Sports",
      endDate: new Date(now.getTime() + 150*24*60*60*1000).toISOString()
    }
  ];
  
  const mockPositions = [
    {
      marketId: "demo1",
      outcome: "YES",
      size: 100,
      entryPrice: 0.470
    },
    {
      marketId: "demo2",
      outcome: "NO",
      size: 150,
      entryPrice: 0.520
    },
    {
      marketId: "demo3",
      outcome: "YES",
      size: 200,
      entryPrice: 0.310
    }
  ];
  
  const analyzePosition = (position, market) => {
    const size = parseFloat(position.size || 0);
    const entryPrice = parseFloat(position.entryPrice || 0);
    const currentPrice = parseFloat(market.outcomePrices[0]);
    const pnl = size * (currentPrice - entryPrice);
    const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
    const outcome = position.outcome;
    const yesPrice = parseFloat(market.outcomePrices[0]);
    const spread = Math.abs(yesPrice - 0.5) * 2;
    
    return {
      marketId: market.id,
      question: market.question,
      outcome,
      size,
      entryPrice,
      currentPrice,
      pnl,
      pnlPercent,
      spread,
      volume24h: parseFloat(market.volume || 0),
      liquidity: parseFloat(market.liquidity || 0),
      timeLeft: Math.max(1, Math.floor((new Date(market.endDate) - new Date()) / (1000*60*60*24))) + 'd',
      category: market.category,
      isWinner: pnl > 0
    };
  };
  
  const positionsAnalyzed = mockPositions.map(p => {
    const market = mockMarkets.find(m => m.id === p.marketId);
    return market ? analyzePosition(p, market) : null;
  }).filter(Boolean);
  
  const patterns = positionsAnalyzed.filter(p => 
    p.spread >= 1.0 && p.spread <= 3.0 && p.volume24h >= 50000 && PREFERRED_CATEGORIES.includes(p.category)
  );
  
  const totalPnL = positionsAnalyzed.reduce((sum, p) => sum + p.pnl, 0);
  const wins = positionsAnalyzed.filter(p => p.isWinner).length;
  const winRate = (wins / positionsAnalyzed.length) * 100;
  
  const recentMarkets = mockMarkets
    .map(m => ({
      id: m.id,
      question: m.question,
      yesPrice: parseFloat(m.outcomePrices[0]),
      noPrice: parseFloat(m.outcomePrices[1]),
      volume: parseFloat(m.volume),
      liquidity: parseFloat(m.liquidity),
      spread: Math.abs(parseFloat(m.outcomePrices[0]) - 0.5) * 2,
      category: m.category
    }))
    .filter(m => m.spread >= 1.0 && m.spread <= 3.0 && m.volume >= 50000 && PREFERRED_CATEGORIES.includes(m.category))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10);
  
  const output = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalPositions: positionsAnalyzed.length,
      totalMarkets: mockMarkets.length,
      patternsFound: patterns.length
    },
    stats: {
      totalPositions: positionsAnalyzed.length,
      totalPnL,
      winRate,
      wins,
      losses: positionsAnalyzed.length - wins,
      avgGain: 5.2,
      avgLoss: -2.1,
      profitFactor: 2.48,
      byCategory: [
        { category: "Crypto", count: 2, pnl: 150.50 },
        { category: "Elections", count: 1, pnl: -25.30 }
      ],
      topMarkets: [
        { marketId: "demo1", question: "Will Bitcoin hit $100k...", totalPnL: 120.40, trades: 1 },
        { marketId: "demo2", question: "Will Fed raise rates...", totalPnL: -25.30, trades: 1 }
      ],
      positions: positionsAnalyzed
    },
    patterns: patterns,
    recentMarkets
  };
  
  fs.writeFileSync('data.json', JSON.stringify(output, null, 2));
  console.log(`✅ data.json mock gerado com ${positionsAnalyzed.length} posições, ${patterns.length} padrões`);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
