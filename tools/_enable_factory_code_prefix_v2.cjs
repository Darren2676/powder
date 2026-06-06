/**
 * 修正版脚本：为所有控制器文件启用工厂编号前缀
 * 核心改进：保留函数名，不使用字面量 "generateXxxNumber"
 */
const fs = require('fs');
const path = require('path');

// 所有需要处理的控制器/服务文件（排除 sampleBom 因为已手动修复）
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

const files = findFiles(root, /\.(controller|service)\.ts$/)
  .concat(findFiles(root, /\.mobile\.controller\.ts$/))
  .filter(f => {
    const content = fs.readFileSync(f, 'utf-8');
    // Only process files that have generateXxxNumber calls with '' or ()
    return content.match(/generate\w+Number\('',/) || content.match(/generate\w+Number\(\)/);
  });

// Exclude sampleBom files (already manually fixed)
const excludePatterns = ['sampleBom', 'inspectionReport'];
const filteredFiles = files.filter(f => !excludePatterns.some(p => f.includes(p)));

console.log(`Files to process: ${filteredFiles.length}`);
console.log(filteredFiles.map(f => path.relative(path.join(__dirname, 'Seals MES System', 'server', 'src'), f)).join('\n'));

for (const file of filteredFiles) {
  let content = fs.readFileSync(file, 'utf-8');
  let changed = false;

  // Step 1: Add getFactoryCode import
  if (!content.includes('getFactoryCode')) {
    // Find if getFactoryId is imported
    const factoryIdImportMatch = content.match(/import \{([^}]*getFactoryId[^}]*)\} from ['"]([^'"]*factoryWhere[^'"]*)['"]/);
    if (factoryIdImportMatch) {
      const imports = factoryIdImportMatch[1];
      const fromPath = factoryIdImportMatch[2];
      const newImports = imports.includes('getFactoryCode') ? imports : imports.replace('getFactoryId', 'getFactoryId, getFactoryCode');
      content = content.replace(factoryIdImportMatch[0], `import { ${newImports} } from '${fromPath}'`);
      changed = true;
    } else {
      // Add new import - find the last import line and add after it
      const importLines = content.match(/^import .+$/gm);
      if (importLines && importLines.length > 0) {
        const lastImport = importLines[importLines.length - 1];
        // Determine relative path based on depth
        const depth = (file.match(/modules\//g) || []).length;
        // Actually count directory depth from modules to file
        const relFromModules = file.replace(/.*modules[\\\/]/, '');
        const dirDepth = relFromModules.split(/[\\\/]/).length - 1;
        let utilPath;
        if (dirDepth <= 1) utilPath = '../../utils/factoryWhere.util';
        else if (dirDepth <= 2) utilPath = '../../../utils/factoryWhere.util';
        else utilPath = '../../../../utils/factoryWhere.util';
        
        content = content.replace(lastImport, lastImport + `\nimport { getFactoryCode } from '${utilPath}';`);
        changed = true;
      }
    }
  }

  // Step 2: Replace generateXxxNumber('', transaction) → generateXxxNumber(factoryCode, transaction)
  // KEY FIX: Use regex with capture group to preserve actual function name
  const newContent1 = content.replace(/generate(\w+Number)\('', transaction\)/g, 'generate$1(factoryCode, transaction)');
  if (newContent1 !== content) { content = newContent1; changed = true; }

  // Step 3: Replace generateXxxNumber('', tx) → generateXxxNumber(factoryCode, tx) (some controllers use 'tx')
  const newContent2 = content.replace(/generate(\w+Number)\('', tx\)/g, 'generate$1(factoryCode, tx)');
  if (newContent2 !== content) { content = newContent2; changed = true; }

  // Step 4: Replace generateXxxNumber(type, '', transaction) → generateXxxNumber(type, factoryCode, transaction)
  const newContent3 = content.replace(/generate(\w+Number)\('(\w+)', '', transaction\)/g, 'generate$1(\'$2\', factoryCode, transaction)');
  if (newContent3 !== content) { content = newContent3; changed = true; }

  // Step 5: Replace generateXxxNumber() → generateXxxNumber(factoryCode)
  const newContent4 = content.replace(/generate(\w+Number)\(\)/g, 'generate$1(factoryCode)');
  if (newContent4 !== content) { content = newContent4; changed = true; }

  // Step 6: Add `const factoryCode = await getFactoryCode(req);` after each `try {`
  // that now contains factoryCode references
  if (content.includes('factoryCode') && !content.includes('const factoryCode = await getFactoryCode(req)')) {
    const lines = content.split('\n');
    let modified = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('try {')) {
        // Check if factoryCode is referenced below (within next 80 lines)
        let usesFactoryCode = false;
        let scopeEnd = Math.min(i + 80, lines.length);
        for (let j = i + 1; j < scopeEnd; j++) {
          if (lines[j].includes('factoryCode')) {
            usesFactoryCode = true;
            break;
          }
          if (lines[j].match(/^\s*\}\s*catch/) || lines[j].match(/^\s*export\s+const/)) {
            break;
          }
        }
        if (usesFactoryCode) {
          // Determine indentation from the line after try {
          let indent = '';
          if (i + 1 < lines.length) {
            indent = lines[i + 1].match(/^(\s*)/)?.[1] || '    ';
          } else {
            indent = '    ';
          }
          lines.splice(i + 1, 0, `${indent}const factoryCode = await getFactoryCode(req);`);
          modified = true;
          i++; // Skip the inserted line
        }
      }
    }
    if (modified) {
      content = lines.join('\n');
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf-8');
    console.log(`MODIFIED: ${path.relative(path.join(__dirname, 'Seals MES System', 'server', 'src'), file)}`);
  } else {
    console.log(`NO CHANGE: ${path.relative(path.join(__dirname, 'Seals MES System', 'server', 'src'), file)}`);
  }
}