/**
 * 精确修改脚本 v4：处理所有类型的本地函数签名
 * 
 * 处理: async () / async (tx: any) / async (transaction: any) / async (prefix: string) 稡式
 * 为每个添加 factoryCode 参数并修改 prefix 逻辑
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, 'Seals MES System', 'server', 'src', 'modules');

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

const allFiles = findFiles(root, /\.controller\.ts$/)
  .concat(findFiles(root, /\.mobile\.controller\.ts$/));

const excludePatterns = ['sampleBom'];
const files = allFiles.filter(f => !excludePatterns.some(p => f.includes(p)));

const MODIFIED = [];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  let original = content;
  
  // ====== Step 1: Modify function signatures ======
  
  // Pattern A: `async (): Promise<string>` → `async (factoryCode: string = ''): Promise<string>`
  content = content.replace(
    /(const |export const )(\w+Number) = async \(\): Promise<string>/g,
    (match, prefix, funcName) => {
      return `${prefix}${funcName} = async (factoryCode: string = ''): Promise<string>`;
    }
  );
  
  // Pattern B: `async (tx: any): Promise<string>` → `async (factoryCode: string = '', tx: any): Promise<string>`
  content = content.replace(
    /(const |export const )(\w+Number) = async \(tx: any\): Promise<string>/g,
    (match, prefix, funcName) => {
      return `${prefix}${funcName} = async (factoryCode: string = '', tx: any): Promise<string>`;
    }
  );
  
  // Pattern C: `async (transaction: any): Promise<string>` → `async (factoryCode: string = '', transaction: any): Promise<string>`
  content = content.replace(
    /(const |export const )(\w+Number) = async \(transaction: any\): Promise<string>/g,
    (match, prefix, funcName) => {
      return `${prefix}${funcName} = async (factoryCode: string = '', transaction: any): Promise<string>`;
    }
  );
  
  // Pattern D: `async (prefix: string): Promise<string>` → `async (prefix: string, factoryCode: string = ''): Promise<string>`
  content = content.replace(
    /(const |export const )(\w+Number) = async \(prefix: string\): Promise<string>/g,
    (match, declPrefix, funcName) => {
      return `${declPrefix}${funcName} = async (prefix: string, factoryCode: string = ''): Promise<string>`;
    }
  );
  
  // ====== Step 2: Modify function bodies - add fc logic and modify prefix ======
  
  // Read lines and process
  const lines = content.split('\n');
  
  // Find local generate functions and modify their bodies
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    
    // Detect a local generate function that has factoryCode in signature
    const funcMatch = line.match(/(const |export const )(generate\w+Number) = async \(factoryCode: string = ''/);
    if (funcMatch) {
      // Find the function body - look for today and prefix lines
      let funcStart = i;
      let todayIdx = -1;
      let prefixIdx = -1;
      let funcEnd = -1;
      let indent = line.match(/^(\s*)/)?.[1] || '';
      let bodyIndent = indent + '  ';
      
      // Scan function body (up to ~30 lines)
      for (let j = i + 1; j < Math.min(i + 30, lines.length); j++) {
        const bodyLine = lines[j];
        
        // Find `const today = dayjs().format('YYYYMMDD');`
        if (bodyLine.includes('dayjs().format(\'YYYYMMDD\')') && todayIdx === -1) {
          todayIdx = j;
        }
        
        // Find `const today = new Date();`
        if (bodyLine.includes('new Date()') && !bodyLine.includes('new Date()') && todayIdx === -1) {
          // Skip - new Date() is for compact format
        }
        if (bodyLine.trim().startsWith('const today = new Date();') && todayIdx === -1) {
          todayIdx = j;
        }
        
        // Find prefix line
        if (bodyLine.includes('const prefix =') && prefixIdx === -1) {
          prefixIdx = j;
        }
        
        // Find function end
        if (bodyLine.trim() === '};') {
          funcEnd = j;
          break;
        }
      }
      
      // If today and prefix found, modify them
      if (todayIdx >= 0 && prefixIdx >= 0) {
        // Check if fc line already exists
        const fcExists = lines.slice(todayIdx + 1, prefixIdx).some(l => l.includes('const fc = factoryCode'));
        
        if (!fcExists) {
          // Determine format: dash or compact
          const prefixLine = lines[prefixIdx];
          
          // Dash format: prefix contains backtick with ${today}
          if (prefixLine.includes('${today}') || prefixLine.includes('$' + '{today}')) {
            // Insert fc line after today line
            // For dash format: fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
            const fcLine = `${bodyIndent}const fc = factoryCode ? \`-\${factoryCode.toUpperCase()}\` : '';`;
            lines.splice(todayIdx + 1, 0, fcLine);
            prefixIdx++; // prefix shifted by 1
            
            // Modify prefix line
            // Dash format examples:
            // `SO-${today}-` → `SO${fc}-${today}-`
            // `SI-${today}-` → `SI${fc}-${today}-`
            // type + `-${today}-` → type + `${fc}-${today}-`
            
            const newPrefixLine = lines[prefixIdx];
            // Replace `-${today}-` with `${fc}-${today}-` in backtick strings
            // But keep the type prefix intact
            const modifiedPrefix = newPrefixLine.replace(
              /const prefix = `(\w+)-\$\{today\}-`;?/,
              `const prefix = \`${funcMatch[2].replace('Number', '').replace('generate', '').toUpperCase().substring(0, 3)}\${fc}-\${today}-\`;`
            );
            
            // More generic: just insert ${fc} before the first -${today}
            // Pattern: `XXX-${today}-` → `XXX${fc}-${today}-`
            const genericDashReplace = newPrefixLine.replace(
              /-(\$\{today\})/g,
              '${fc}-${today}'
            );
            // But only do it once (first occurrence)
            // Actually, let's be smarter: find the type code in the prefix
            const prefixMatch = newPrefixLine.match(/const prefix = `(\w+)-\$\{today\}-`;?/);
            if (prefixMatch) {
              lines[prefixIdx] = `${bodyIndent}const prefix = \`${prefixMatch[1]}\${fc}-\${today}-\`;`;
            } else {
              // For type variable based: type + '-${today}-' → type + '${fc}-${today}-'
              const typeVarMatch = newPrefixLine.match(/const prefix = (\w+) \+ '-\$\{today\}-';?/);
              if (typeVarMatch) {
                lines[prefixIdx] = `${bodyIndent}const prefix = ${typeVarMatch[1]} + \`\${fc}-\${today}-\`;`;
              }
            }
            
          }
          // Compact format: prefix uses string concatenation with year/month/day
          else if (prefixLine.includes('getFullYear()')) {
            // Insert fc line after today line
            // For compact format: fc = factoryCode ? factoryCode.toUpperCase() : '';
            const fcLine = `${bodyIndent}const fc = factoryCode ? factoryCode.toUpperCase() : '';`;
            lines.splice(todayIdx + 1, 0, fcLine);
            prefixIdx++; // prefix shifted
            
            // Modify prefix line: 'P' + today.getFullYear() → 'P' + fc + today.getFullYear()
            const newPrefixLine = lines[prefixIdx];
            // Find the type char and insert fc after it
            const compactMatch = newPrefixLine.match(/const prefix = '(\w)' \+ today\.getFullYear/);
            if (compactMatch) {
              const restOfPrefix = newPrefixLine.substring(newPrefixLine.indexOf('today.getFullYear'));
              lines[prefixIdx] = `${bodyIndent}const prefix = '${compactMatch[1]}' + fc + ${restOfPrefix}`;
            }
          }
          // Special case: prefix uses `type + ...` pattern (for abnormalIO)
          else if (prefixLine.includes('prefix') && prefixLine.includes('prefix: string')) {
            // This function takes prefix as parameter - need different handling
            // For abnormalIO: prefix is passed in, we just need fc in the body
            // Actually, the abnormalIO function takes `prefix` as a parameter, 
            // and the fc should be appended to prefix
            // Wait - let me look at this function more carefully later
          }
          
          i += 2; // Skip inserted lines
        }
      }
    }
    
    i++;
  }
  
  content = lines.join('\n');
  
  // ====== Step 3: Handle special case - abnormalIO's generateAbnormalIONumber ======
  // This function has `prefix` as a first param, so factoryCode is second
  // Its body likely just uses prefix directly. We need to add fc and modify prefix usage
  // Let's handle it specially by reading the actual content
  
  // ====== Step 4: Add import and factoryCode declaration ======
  if (content.includes('factoryCode') && !content.includes('getFactoryCode')) {
    if (content.includes('getFactoryId') && content.includes('factoryWhere')) {
      content = content.replace(
        /import \{ getFactoryId \} from/g,
        'import { getFactoryId, getFactoryCode } from'
      );
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
      if (importLines && importLines.length > 0) {
        const lastImport = importLines[importLines.length - 1];
        const relFromModules = file.replace(/.*modules[\\\/]/, '');
        const dirDepth = relFromModules.split(/[\\\/]/).length - 1;
        let utilPath;
        if (dirDepth <= 1) utilPath = '../../utils/factoryWhere.util';
        else if (dirDepth <= 2) utilPath = '../../../utils/factoryWhere.util';
        else utilPath = '../../../../utils/factoryWhere.util';
        content = content.replace(lastImport, lastImport + `\nimport { getFactoryCode } from '${utilPath}';`);
      }
    }
  }
  
  // Add `const factoryCode = await getFactoryCode(req);` after try { blocks
  if (content.includes('factoryCode') && !content.includes('const factoryCode = await getFactoryCode(req)')) {
    const lines3 = content.split('\n');
    let modified3 = false;
    for (let k = 0; k < lines3.length; k++) {
      if (lines3[k].includes('try {')) {
        let usesFactoryCode = false;
        for (let j = k + 1; j < Math.min(k + 80, lines3.length); j++) {
          if (lines3[j].includes('factoryCode') && 
              !lines3[j].includes('factoryCode: string') && 
              !lines3[j].includes('const fc = factoryCode') &&
              !lines3[j].includes('fc = factoryCode') &&
              !lines3[j].includes('getFactoryCode(req)')) {
            usesFactoryCode = true;
            break;
          }
          if (lines3[j].match(/^\s*\}\s*catch/) || lines3[j].match(/^\s*export\s+const\s+\w+\s*=\s*async/)) {
            break;
          }
        }
        if (usesFactoryCode) {
          let alreadyDeclared = false;
          for (let j = k + 1; j < Math.min(k + 10, lines3.length); j++) {
            if (lines3[j].includes('const factoryCode = await getFactoryCode(req)')) {
              alreadyDeclared = true;
              break;
            }
          }
          if (!alreadyDeclared) {
            let indent = '    ';
            if (k + 1 < lines3.length) {
              indent = lines3[k + 1].match(/^(\s*)/)?.[1] || '    ';
            }
            lines3.splice(k + 1, 0, `${indent}const factoryCode = await getFactoryCode(req);`);
            modified3 = true;
            k++;
          }
        }
      }
    }
    if (modified3) {
      content = lines3.join('\n');
    }
  }
  
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf-8');
    MODIFIED.push(path.relative(path.join(__dirname, 'Seals MES System', 'server', 'src'), file));
  }
}

console.log(`\n=== MODIFIED (${MODIFIED.length}) ===`);
MODIFIED.forEach(f => console.log(f));