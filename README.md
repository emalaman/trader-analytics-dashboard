# 📊 Trader Pattern Analytics Dashboard

Dashboard que analisa suas próprias posições no Polymarket e identifica padrões de bons traders.

**Funcionalidades:**
- Conecta à CLOB API com permissão `read:account`
- Mostra posições abertas e histórico
- Detecta padrões: spreads 1.5-2%, volume >$100k, tempo de entrada
- Gera alertas de novas oportunidades
- Ranking de mercados mais rentáveis
- Métricas de performance (win rate, avg gain, etc)

---

## 🚀 Setup

### 1. GitHub Secrets

Adicione no repositório:

- `POLYMARKET_API_KEY` - sua API Key
- `POLYMARKET_API_SECRET` - seu Secret
- `POLYMARKET_API_PASSPHRASE` - sua Passphrase
- `POLYMARKET_WALLET` - seu endereço de carteira (0x...)

### 2. Permissões

Sua API key precisa ter:
- `read:markets` (já tem)
- `read:account` (para ver posições)
- `read:trades` (para histórico)

### 3. Deploy

GitHub Pages + Actions (auto-deploy a cada 30s).

---

## 🎯 Estratégia Detectada

O dashboard procura por:

| Padrão | Critério |
|--------|----------|
| **Spread ideal** | 1.5% - 2% |
| **Volume mínimo** | > $100,000 (24h) |
| **Tempo de entrada** | Horário de alta liquidez (14h-22h UTC) |
| **Categoria** | Crypto, Elections, Sports (evitar nichos) |
| **Tempo de holding** | 2h - 24h (scalping médio) |
| **Win rate esperado** | > 55% |

Alertas sonoros/quando novo mercado se encaixa.

---

## 📁 Estrutura

```
trader-analytics-dashboard/
├── fetch.js          # Busca posições e histórico
├── analyze.js        # Analisa padrões
├── generate.js       # Gera HTML
├── index.html        # Template
├── .github/workflows/deploy.yml
├── package.json
└── README.md
```

---

**Vou criar agora!** Dê OK para continuar. 🚀
