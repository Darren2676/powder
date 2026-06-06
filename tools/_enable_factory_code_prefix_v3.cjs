/**
 * 综合脚本：为控制器中的本地内联生成函数添加 factoryCode 参数
 * 并修改函数体内的 prefix 逻辑
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

const files = findFiles(root, /\.controller\.ts$/)
  .concat(findFiles(root, /\.mobile\.controller\.ts$/));

// Exclude already-fixed sampleBom files
const excludePatterns = ['sampleBom'];
const filteredFiles = files.filter(f => !excludePatterns.some(p => f.includes(p)));

const MODIFIED = [];
const SKIPPED = [];

for (const file of filteredFiles) {
  let content = fs.readFileSync(file, 'utf-8');
  let original = content;
  let hasLocalGenFunc = false;

  // ====== Part A: Modify local inline function definitions ======

  // Pattern 1: `const generateXxxNumber = async (transaction?: any)` → add factoryCode as first param
  // Dash-separated format functions (most common)
  content = content.replace(
    /const (generate\w+Number) = async \(transaction\?: any\): Promise<string> => \{\s*\n\s*const today = dayjs\(\)\.format\('YYYYMMDD'\);\s*\n\s*const prefix = `(\\w+)-\$\\{today\\}-`;/g,
    (match, funcName, typeCode) => {
      hasLocalGenFunc = true;
      return `const ${funcName} = async (factoryCode: string = '', transaction?: any): Promise<string> => {\n    const today = dayjs().format('YYYYMMDD');\n    const fc = factoryCode ? \`-\${factoryCode.toUpperCase()}\` : '';\n    const prefix = \`${typeCode}\${fc}-\${today}-\`;`;
    }
  );

  // Pattern 1b: similar but with different spacing
  content = content.replace(
    /const (generate\w+Number) = async \(transaction\?: any\): Promise<string> => \{\s*\n\s*const today = dayjs\(\)\.format\('YYYYMMDD'\);\s*\n\s*const prefix = `(\\w+)-\$\\{today\\}-`;/g,
    (match, funcName, typeCode) => {
      hasLocalGenFunc = true;
      return `const ${funcName} = async (factoryCode: string = '', transaction?: any): Promise<string> => {\n    const today = dayjs().format('YYYYMMDD');\n    const fc = factoryCode ? \`-\${factoryCode.toUpperCase()}\` : '';\n    const prefix = \`${typeCode}\${fc}-\${today}-\`;`;
    }
  );

  // Pattern 2: `const generateXxxNumber = async (transaction?: any)` with compact format prefix
  // e.g., const prefix = 'P' + year + month + day
  content = content.replace(
    /const (generate\w+Number|generateOrderNumber) = async \(transaction\?: any\): Promise<string> => \{\s*\n\s*const today = new Date\(\);\s*\n\s*const prefix = '(\\w)' \+ today\.getFullYear\(\) \+ String\(today\.getMonth\(\) \+ 1\)\.padStart\(2, '0'\) \+ String\(today\.getDate\(\)\)\.padStart\(2, '0'\);/g,
    (match, funcName, typeCode) => {
      hasLocalGenFunc = true;
      return `const ${funcName} = async (factoryCode: string = '', transaction?: any): Promise<string> => {\n    const today = new Date();\n    const fc = factoryCode ? factoryCode.toUpperCase() : '';\n    const prefix = '${typeCode}' + fc + today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');`;
    }
  );

  // Pattern 3: Functions that already have factoryCode in signature but maybe need import
  // (these are from the previous session - if they exist, they're fine)

  // Pattern 4: Handle specific case: `const generateXxxNumber = async (type: string, transaction?: any)`
  // For batch-like functions
  content = content.replace(
    /const (generate\w+Number) = async \(type: string, transaction\?: any\): Promise<string> => \{\s*\n\s*const today = dayjs\(\)\.format\('YYYYMMDD'\);\s*\n\s*const prefix = type \+ '-\$\\{today\\}-';/g,
    (match, funcName) => {
      hasLocalGenFunc = true;
      return `const ${funcName} = async (type: string, factoryCode: string = '', transaction?: any): Promise<string> => {\n    const today = dayjs().format('YYYYMMDD');\n    const fc = factoryCode ? \`-\${factoryCode.toUpperCase()}\` : '';\n    const prefix = type + \`${fc}-\${today}-\`;`;
    }
  );

  // ====== Part B: More flexible pattern matching for local functions ======
  // Some controllers might have slightly different function definition patterns
  
  // Generic fallback: any `const generateXxxNumber = async (transaction?: any): Promise<string>`
  // that wasn't caught by the specific patterns above
  if (!hasLocalGenFunc) {
    const genericPattern = /const (generate\w+Number) = async \(transaction\?: any\): Promise<string>/g;
    let m;
    while ((m = genericPattern.exec(content)) !== null) {
      // Check if this function already has factoryCode
      const funcStart = m.index;
      const funcBodyStart = content.indexOf('=>', funcStart);
      if (funcBodyStart > 0) {
        const signatureText = content.substring(funcStart, funcBodyStart + 2);
        if (!signatureText.includes('factoryCode')) {
          // Replace just the signature part
          content = content.replace(
            m[0],
            `const ${m[1]} = async (factoryCode: string = '', transaction?: any): Promise<string>`
          );
          hasLocalGenFunc = true;
          // Note: we didn't modify the body, so we need a separate step for that
        }
      }
    }
  }

  // ====== Part C: Modify function bodies of local functions ======
  // For functions that had their signature updated but body not updated
  
  // Find patterns where prefix is built from a type code + dash + today
  // and add fc variable + modify prefix
  
  // For local functions that now have factoryCode in signature but no fc logic in body
  // We need to add fc after `const today = ...` and modify the prefix line
  
  // Dash format: `const prefix = `XXX-${today}-`;` → `const prefix = `XXX${fc}-${today}-`;`
  // with `const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';` added before prefix
  
  // Find local function bodies that need fc logic
  const localFuncPattern = /const (generate\w+Number) = async \(factoryCode: string = '', transaction\?: any\): Promise<string> => \{\s*\n(\s*)const today = dayjs\(\)\.format\('YYYYMMDD'\);\s*\n(\s*)const prefix = `(\\w+)-\$\\{today\\}-`;/g;
  
  content = content.replace(localFuncPattern, (match, funcName, indent1, indent2, typeCode) => {
    return `const ${funcName} = async (factoryCode: string = '', transaction?: any): Promise<string> => {\n${indent1}const today = dayjs().format('YYYYMMDD');\n${indent1}const fc = factoryCode ? \`-\${factoryCode.toUpperCase()}\` : '';\n${indent2}const prefix = \`${typeCode}\${fc}-\${today}-\`;`;
  });

  // Compact format: `const prefix = 'X' + today.getFullYear() + ...` 
  const compactFuncPattern = /const (generate\w+Number) = async \(factoryCode: string = '', transaction\?: any\): Promise<string> => \{\s*\n(\s*)const today = new Date\(\);\s*\n(\s*)const prefix = '(\\w)' \+ today\.getFullYear\(\)/g;
  
  content = content.replace(compactFuncPattern, (match, funcName, indent1, indent2, typeCode) => {
    return `const ${funcName} = async (factoryCode: string = '', transaction?: any): Promise<string> => {\n${indent1}const today = new Date();\n${indent1}const fc = factoryCode ? factoryCode.toUpperCase() : '';\n${indent2}const prefix = '${typeCode}' + fc + today.getFullYear()`;
  });

  // ====== Part D: Ensure import of getFactoryCode ======
  if (content.includes('factoryCode') && !content.includes('getFactoryCode')) {
    // Check if getFactoryId is imported
    if (content.includes('getFactoryId') && content.includes('factoryWhere')) {
      content = content.replace(
        /import \{ getFactoryId \} from/g,
        'import { getFactoryId, getFactoryCode } from'
      );
    } else if (content.includes('factoryWhere')) {
      // getFactoryId might be in a multi-import
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
      // Need to add a new import
      const importLines = content.match(/^import .+;$/gm);
      if (importLines && importLines.length > 0) {
        const lastImport = importLines[importLines.length - 1];
        // Determine path depth
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

  // ====== Part E: Add `const factoryCode = await getFactoryCode(req);` after try { ======
  if (content.includes('factoryCode') && !content.includes('const factoryCode = await getFactoryCode(req)')) {
    const lines = content.split('\n');
    let modified = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('try {')) {
        let usesFactoryCode = false;
        let scopeEnd = Math.min(i + 80, lines.length);
        for (let j = i + 1; j < scopeEnd; j++) {
          // Check for factoryCode references that are NOT in function definitions
          if (lines[j].includes('factoryCode') && !lines[j].includes('factoryCode: string') && !lines[j].includes('const fc = factoryCode')) {
            usesFactoryCode = true;
            break;
          }
          if (lines[j].match(/^\s*\}\s*catch/) || lines[j].match(/^\s*export\s+const\s+\w+ = async/)) {
            break;
          }
        }
        if (usesFactoryCode) {
          let indent = '';
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
  }

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf-8');
    MODIFIED.push(path.relative(path.join(__dirname, 'Seals MES System', 'server', 'src'), file));
  } else {
    SKIPPED.push(path.relative(path.join(__dirname, 'Seals MES System', 'server', 'src'), file));
  }
}

console.log(`\n=== MODIFIED (${MODIFIED.length}) ===`);
MODIFIED.forEach(f => console.log(f));
console.log(`\n=== SKIPPED (${SKIPPED.length}) ===`);
SKIPPED.forEach(f => console.log(f));