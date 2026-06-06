/**
 * 修复所有 generateXxxNumber(transaction) 调用：
 * - 服务层函数（有 factoryCode 参数）: generateXxxNumber(transaction) → generateXxxNumber(factoryCode, transaction)
 * - 服务层函数（有 factoryCode 参数）: generateBatchNumber('XX', transaction) → generateBatchNumber('XX', factoryCode, transaction)
 * 
 * 对于本地函数（也已有 factoryCode 参数）: 
 * - generateXxxNumber(transaction) → generateXxxNumber(factoryCode, transaction)
 * - generateXxxNumber() → generateXxxNumber(factoryCode) (某些尚未被处理)
 * 
 * 同时确保每个 handler 的 try 块中有 factoryCode 声明
 */
const fs = require('fs');
const path = require('path');
const srcRoot = path.join(__dirname, 'Seals MES System', 'server', 'src');
const modulesDir = path.join(srcRoot, 'modules');

function findFiles(dir, pattern) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(full, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

const files = findFiles(modulesDir, /\.controller\.ts$/)
  .concat(findFiles(modulesDir, /\.mobile\.controller\.ts$/));

const excludePatterns = ['sampleBom'];
const filteredFiles = files.filter(f => !excludePatterns.some(p => f.includes(p)));

const MODIFIED = [];

for (const file of filteredFiles) {
  let content = fs.readFileSync(file, 'utf-8');
  let original = content;
  
  // ====== Fix call sites ======
  
  // Pattern 1: generateXxxNumber(transaction) → generateXxxNumber(factoryCode, transaction)
  // For functions imported from documentNumber.service.ts or inventory.service.ts
  // AND for local functions that have factoryCode as first param
  content = content.replace(
    /await (generate\w+Number)\(transaction\)/g,
    'await $1(factoryCode, transaction)'
  );
  
  // Pattern 2: generateXxxNumber('XX', transaction) → generateXxxNumber('XX', factoryCode, transaction)
  content = content.replace(
    /await (generateBatchNumber)\('(\w+)', transaction\)/g,
    'await $1(\'$2\', factoryCode, transaction)'
  );
  
  // Pattern 3: generateXxxNumber('XX', '', transaction) → generateXxxNumber('XX', factoryCode, transaction) 
  // (if there's still a '' placeholder)
  content = content.replace(
    /await (generate\w+Number)\('(\w+)', '', transaction\)/g,
    'await $1(\'$2\', factoryCode, transaction)'
  );
  
  // Pattern 4: generateXxxNumber('', transaction) → generateXxxNumber(factoryCode, transaction)
  // (if there's still a '' placeholder)
  content = content.replace(
    /await (generate\w+Number)\('', transaction\)/g,
    'await $1(factoryCode, transaction)'
  );
  
  // ====== Ensure factoryCode declaration in handler functions ======
  // Find all try { blocks that use factoryCode but don't have declaration
  
  const lines = content.split('\n');
  let modified = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.includes('try {') && !line.includes('//')) {
      // Scan forward to check factoryCode usage and declaration
      let usesFactoryCode = false;
      let hasDeclaration = false;
      
      for (let j = i + 1; j < Math.min(i + 200, lines.length); j++) {
        const checkLine = lines[j];
        
        // Check for factoryCode reference (not definition)
        if (checkLine.includes('factoryCode') && 
            !checkLine.includes('factoryCode: string') &&
            !checkLine.includes('const fc = factoryCode') &&
            !checkLine.includes('fc = factoryCode')) {
          usesFactoryCode = true;
        }
        
        // Check for declaration
        if (checkLine.includes('const factoryCode = await getFactoryCode(req)')) {
          hasDeclaration = true;
        }
        
        // Stop at catch
        if (checkLine.match(/^\s*\}\s*catch\b/)) {
          break;
        }
        
        // Stop at next export function
        if (checkLine.match(/^export const \w+ = async/) && j > i + 10) {
          break;
        }
      }
      
      if (usesFactoryCode && !hasDeclaration) {
        let indent = '    ';
        if (i + 1 < lines.length) {
          indent = lines[i + 1].match(/^(\s*)/)?.[1] || '    ';
        }
        lines.splice(i + 1, 0, `${indent}const factoryCode = await getFactoryCode(req);`);
        modified = true;
        i++;
      }
    }
  }
  
  if (modified) {
    content = lines.join('\n');
  }
  
  // ====== Ensure import ======
  if (content.includes('factoryCode') && !content.includes('getFactoryCode')) {
    if (content.includes('getFactoryId') && content.includes('factoryWhere')) {
      content = content.replace(/import \{ getFactoryId \} from/g, 'import { getFactoryId, getFactoryCode } from');
    } else if (content.includes('factoryWhere')) {
      content = content.replace(
        /import \{([^}]+)\} from ['"]([^'"]*factoryWhere[^'"]*)['"]/,
        (match, imports, fromPath) => {
          if (!imports.includes('getFactoryCode')) {
            return `import { ${imports.trim()}, getFactoryCode } from '${fromPath}'`;
          }
          return match;
        }
      );
    } else {
      const importLines = content.match(/^import .+;$/gm);
      if (importLines) {
        const lastImport = importLines[importLines.length - 1];
        const rel = file.replace(/.*modules[\\\/]/, '');
        const d = rel.split(/[\\\/]/).length - 1;
        let p = d <= 2 ? '../../../utils/factoryWhere.util' : '../../../../utils/factoryWhere.util';
        if (d <= 1) p = '../../utils/factoryWhere.util';
        content = content.replace(lastImport, lastImport + `\nimport { getFactoryCode } from '${p}';`);
      }
    }
  }
  
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf-8');
    MODIFIED.push(path.relative(srcRoot, file));
  }
}

console.log(`\n=== MODIFIED (${MODIFIED.length}) ===`);
MODIFIED.forEach(f => console.log(f));