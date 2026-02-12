#!/usr/bin/env node

const fs = require('fs');

const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));

console.log(`Gerando dashboard de analytics com ${data.summary.totalPositions} posições`);

let html = fs.readFileSync('index.html', 'utf8');

// Substituir placeholders
html = html.replace('%TOTAL_POSITIONS%', data.summary.totalPositions);
html = html.replace('%PATTERNS_FOUND%', data.summary.patternsFound);
html = html.replace('%GENERATED_AT%', new Date().toLocaleString('pt-BR'));
html = html.replace('%DATA_JSON%', JSON.stringify(data));

fs.writeFileSync('index.html', html);
console.log('✅ index.html gerado');
