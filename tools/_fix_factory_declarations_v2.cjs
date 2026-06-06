/**
 * 精确修复脚本：逐行扫描，确保每个引用 factoryCode 的 export async handler 
 * 函数中有 factoryCode 声明行。
 * 同时修改本地函数体中缺少 fc 逻辑的 prefix。
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

const exclude = ['sampleBom'];
const filtered = files.filter(f => !exclude.some(p => f.includes(p)));
const MODIFIED = [];

for (const file of filtered) {
  let content = fs.readFileSync(file, 'utf-8');
  let original = content;
  const lines = content.split('\n');
  let modified = false;
  
  // Step 1: Find each `export const xxx = async (req:` function  
  // and ensure that if factoryCode is referenced within it,
  // there's a `const factoryCode = await getFactoryCode(req);` declaration
  
  for (let i = 0; i < lines.length; i++) {
    // Find handler function start
    const handlerMatch = lines[i].match(/^export const (\w+) = async \(req: Request/);
    if (handlerMatch) {
      // Find the function's try block(s) and check for factoryCode
      // Look for the first `try {` within this function
      let tryIdx = -1;
      let funcEndIdx = -1;
      
      // Find first try { within next ~20 lines
      for (let j = i + 1; j < Math.min(i + 25, lines.length); j++) {
        if (lines[j].includes('try {')) {
          tryIdx = j;
          break;
        }
      }
      
      if (tryIdx >= 0) {
        // Check if factoryCode is referenced within this function (from try to end)
        let usesFactoryCode = false;
        let hasDeclaration = false;
        
        // Scan from tryIdx to find matching catch or next function
        for (let j = tryIdx + 1; j < lines.length; j++) {
          // Check for factoryCode reference
          if (lines[j].includes('factoryCode') &&
              !lines[j].includes('factoryCode: string') &&
              !lines[j].includes('const fc = factoryCode')) {
            usesFactoryCode = true;
          }
          
          // Check for declaration
          if (lines[j].includes('const factoryCode = await getFactoryCode(req)')) {
            hasDeclaration = true;
          }
          
          // Stop at next handler function
          if (lines[j].match(/^export const \w+ = async \(req: Request/) && j > tryIdx + 5) {
            break;
          }
          
          // Stop at file end or end of large function
          if (j > tryIdx + 300) {
            break;
          }
        }
        
        if (usesFactoryCode && !hasDeclaration) {
          // Insert factoryCode declaration after try {
          let indent = lines[tryIdx + 1].match(/^(\s*)/)?.[1] || '    ';
          // Check if there's already some const declaration right after try {
          // Insert right after try {
          lines.splice(tryIdx + 1, 0, `${indent}const factoryCode = await getFactoryCode(req);`);
          modified = true;
          // Don't increment i since we need to continue scanning
        }
      }
    }
  }
  
  // Step 2: Modify local generate function bodies - add fc logic and modify prefix
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Find local generate functions with factoryCode in signature
    const localFuncMatch = line.match(/(const |export const )(generate\w+Number) = async \(factoryCode: string = ''(?:, (?:transaction|tx|prefix)\??: any(?:\))?)?\): Promise<string> => \{/);
    if (!localFuncMatch) {
      // Also try matching simpler patterns
      const simplerMatch = line.match(/(const |export const )(generate\w+Number) = async \(factoryCode: string = ''\): Promise<string> => \{/);
      if (!simplerMatch) continue;
    }
    
    // Check if fc is already defined in this function body
    let hasFc = false;
    let todayIdx = -1;
    let prefixIdx = -1;
    let funcIndent = '';
    
    funcIndent = line.match(/^(\s*)/)?.[1] || '';
    let bodyIndent = funcIndent + '  ';
    
    for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
      if (lines[j].includes('const fc = factoryCode')) {
        hasFc = true;
        break;
      }
      if (lines[j].includes('dayjs().format(\'YYYYMMDD\')') || lines[j].includes("dayjs().format('YYYYMMDD')")) {
        todayIdx = j;
      }
      if (lines[j].trim().startsWith('const today = new Date();')) {
        todayIdx = j;
      }
      if (lines[j].includes('const prefix =') || lines[j].includes('const fullPrefix =')) {
        prefixIdx = j;
      }
      if (lines[j].trim() === '};') {
        break;
      }
    }
    
    if (!hasFc && todayIdx >= 0) {
      // Check if prefix uses backtick format or string concat format
      const todayLine = lines[todayIdx];
      
      if (todayLine.includes('dayjs().format(\'YYYYMMDD\')')) {
        // Dash format - add fc after today
        lines.splice(todayIdx + 1, 0, `${bodyIndent}const fc = factoryCode ? \`-\${factoryCode.toUpperCase()}\` : '';`);
        modified = true;
        prefixIdx++; // shift
        
        // Modify prefix - find XXX-${today}- pattern and change to XXX${fc}-${today}-
        if (prefixIdx >= 0 && lines[prefixIdx].includes('${today}')) {
          const prefixLine = lines[prefixIdx];
          // Replace pattern: backtick prefix containing -${today}-
          // e.g. `SO-${today}-` → `SO${fc}-${today}-`
          const m = prefixLine.match(/(`)(\w+)-\$\{today\}-(`)/);
          if (m) {
            lines[prefixIdx] = prefixLine.replace(m[0], `${m[1]}${m[2]}\${fc}-\${today}-${m[3]}`);
          }
          // e.g. `XXX-${dateStr}-` → `XXX${fc}-${dateStr}-`
          const m2 = prefixLine.match(/(`)(\w+)-\$\{dateStr\}-(`)/);
          if (m2) {
            lines[prefixIdx] = prefixLine.replace(m[0], `${m[1]}${m[2]}\${fc}-\${dateStr}-${m[3]}`);
          }
          // e.g. prefix + '-${today}-' → prefix + '${fc}-${today}-'  
          // for variable-based prefix (e.g. type + '-${today}-')
          const m3 = prefixLine.match(/(prefix|type|fullPrefix) \+ '-\$\{today\}-'/);
          if (m3) {
            lines[prefixIdx] = prefixLine.replace(m3[0], `${m3[1]} + \`\${fc}-\${today}-\``);
          }
          const m3b = prefixLine.match(/(prefix|type|fullPrefix) \+ '-\$\{dateStr\}-'/);
          if (m3b) {
            lines[prefixIdx] = prefixLine.replace(m3b[0], `${m3b[1]} + \`\${fc}-\${dateStr}-\``);
          }
        }
      } else if (todayLine.includes('new Date();')) {
        // Compact format - add fc after today
        lines.splice(todayIdx + 1, 0, `${bodyIndent}const fc = factoryCode ? factoryCode.toUpperCase() : '';`);
        modified = true;
        prefixIdx++;
        
        // Modify prefix
        if (prefixIdx >= 0) {
          const prefixLine = lines[prefixIdx];
          // Pattern: `XXX-${dateStr}-` → `XXX${fc}-${dateStr}-`
          const m = prefixLine.match(/(`)(\w+)-\$\{dateStr\}-(`)/);
          if (m) {
            lines[prefixIdx] = prefixLine.replace(m[0], `${m[1]}${m[2]}\${fc}-\${dateStr}-${m[3]}`);
          }
          // Pattern: 'X' + year + ... → 'X' + fc + year + ...
          const m2 = prefixLine.match(/const prefix = '(\w+)' \+ (today\.getFullYear)/);
          if (m2) {
            lines[prefixIdx] = prefixLine.replace(m2[0], `const prefix = '${m2[1]}' + fc + ${m2[2]}`);
          }
        }
      }
    }
  }

  // Step 3: Ensure getFactoryCode import
  if (content.includes('factoryCode') || content.includes('getFactoryCode')) {
    // Check if import exists
    const currentContent = lines.join('\n');
    if (currentContent.includes('getFactoryCode') || !currentContent.includes('factoryCode')) {
      // Import exists or no factoryCode usage
    } else if (currentContent.includes('factoryCode') && !currentContent.includes('getFactoryCode')) {
      // Need to add import
      if (currentContent.includes('getFactoryId') && currentContent.includes('factoryWhere')) {
        const idx = lines.findIndex(l => l.includes('getFactoryId') && l.includes('factoryWhere'));
        if (idx >= 0) {
          lines[idx] = lines[idx].replace('import { getFactoryId } from', 'import { getFactoryId, getFactoryCode } from');
          modified = true;
        }
      } else {
        // Add new import after last import
        const lastImportIdx = lines.reduce((acc, l, idx) => l.startsWith('import ') ? idx : acc, -1);
        if (lastImportIdx >= 0) {
          const rel = file.replace(/.*modules[\\\/]/, '');
          const d = rel.split(/[\\\/]/).length - 1;
          let p = d <= 1 ? '../../utils/factoryWhere.util' : d <= 2 ? '../../../utils/factoryWhere.util' : '../../../../utils/factoryWhere.util';
          lines.splice(lastImportIdx + 1, 0, `import { getFactoryCode } from '${p}';`);
          modified = true;
        }
      }
    }
  }
  
  if (modified) {
    content = lines.join('\n');
    if (content !== original) {
      fs.writeFileSync(file, content, 'utf-8');
      MODIFIED.push(path.relative(srcRoot, file));
    }
  }
}

console.log(`\n=== MODIFIED (${MODIFIED.length}) ===`);
MODIFIED.forEach(f => console.log(f));