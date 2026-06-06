/**
 * 最终修正脚本：修复所有遗漏的调用模式
 * 
 * 模式1: generateXxxNumber(transaction) → generateXxxNumber(factoryCode, transaction)
 * 模式2: generateXxxNumber('MB', transaction) → generateXxxNumber('MB', factoryCode, transaction)
 * 模式3: generateXxxNumber('FB', transaction) → generateXxxNumber('FB', factoryCode, transaction)
 * 模式4: generateXxxNumber('HB', transaction) → generateXxxNumber('HB', factoryCode, transaction)
 * 模式5: 修改本地函数体（添加 fc 变量并修改 prefix）
 * 模式6: 添加 getFactoryCode import 和 factoryCode 获取声明
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

for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  let original = content;

  // ====== FIX 1: generateXxxNumber(transaction) → generateXxxNumber(factoryCode, transaction) ======
  // Only for functions that accept factoryCode as first param (from services)
  // Don't modify local functions that only take transaction
  // Key: check if the function name is from documentNumber/inventory service OR a local function
  
  // For imported functions (from documentNumber.service.ts, inventory.service.ts, etc):
  // These all have factoryCode as first param
  const importedFuncNames = [
    'generateTaskNumber', 'generatePrepNumber', 'generateWRNumber',
    'generateOrderNumber', 'generateOutsourcingReqNumber', 'generateInboundOrderNumber',
    'generateSemiProductionInboundOrderNumber', 'generateShippingOrderNumber',
    'generateForecastNumber', 'generateMrpRunNumber', 'generatePurchaseReqNumber',
    'generateBackflushTaskNumber', 'generateLinesideTxnNumber',
    'generateOutsourcingInspectionNumber', 'generateOutsourcingReturnStockinNumber',
    'generateOutsourcingReceiptNumber', 'generateOutsourcingOrderNumber',
    'generateOutsourcingIssueNumber', 'generateOutsourcingSettlementNumber',
    'generateBatchNumber', 'generateTransactionNumber', 'generateMaterialTxnNumber',
    'generateSnapshotNumber', 'generateCountNumber',
  ];
  
  for (const funcName of importedFuncNames) {
    // Pattern: funcName(transaction) → funcName(factoryCode, transaction)
    content = content.replace(
      new RegExp(`await ${funcName}\\(transaction\\)`, 'g'),
      `await ${funcName}(factoryCode, transaction)`
    );
  }
  
  // ====== FIX 2: generateBatchNumber('XX', transaction) → generateBatchNumber('XX', factoryCode, transaction) ======
  content = content.replace(
    /await generateBatchNumber\('(\w+)', transaction\)/g,
    `await generateBatchNumber('$1', factoryCode, transaction)`
  );
  content = content.replace(
    /await generateBatchNumber\("(\w+)", transaction\)/g,
    `await generateBatchNumber("$1", factoryCode, transaction)`
  );

  // ====== FIX 3: For local functions with factoryCode in signature but body not updated ======
  // These are functions like: `const generateXxxNumber = async (factoryCode: string = ''): Promise<string> => {`
  // that still have `const prefix = \`XXX-${today}-\`;` without fc
  
  // Detect local functions with factoryCode in signature but no fc variable
  // Pattern for dash-separated format functions:
  // const funcName = async (factoryCode: string = ''): Promise<string> => {
  //   const today = dayjs().format('YYYYMMDD');
  //   const prefix = `XXX-${today}-`;
  // Should become:
  //   const today = dayjs().format('YYYYMMDD');
  //   const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  //   const prefix = `XXX${fc}-${today}-`;
  
  // Pattern for compact format:
  //   const today = new Date();
  //   const dateStr = ...;
  //   const prefix = `XXX-${dateStr}-`;
  // Should become:
  //   const today = new Date();
  //   const fc = factoryCode ? factoryCode.toUpperCase() : '';
  //   const dateStr = ...;
  //   const prefix = `XXX${fc}-${dateStr}-`;

  // Let me handle each local function individually
  // For dash format: add fc line after today line, and modify prefix line
  
  // First, find all local generate functions
  const localFuncRegex = /const (generate\w+Number) = async \(factoryCode: string = ''(?:, (?:transaction|tx)\??: any)?\): Promise<string> => \{\n/g;
  
  // More robust: process each file's content as lines and find local functions
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect local generate function with factoryCode but WITHOUT fc in body
    const localFuncMatch = line.match(/const (generate\w+Number) = async \(factoryCode: string = ''(?:, (?:transaction|tx)\??: any)?\): Promise<string> => \{/);
    if (localFuncMatch) {
      // Scan the next 15 lines for the function body
      let bodyStart = i + 1;
      let foundFc = false;
      let todayLineIdx = -1;
      let prefixLineIdx = -1;
      let isDashFormat = false;
      let isCompactFormat = false;
      
      for (let j = bodyStart; j < Math.min(bodyStart + 15, lines.length); j++) {
        if (lines[j].includes('const fc = factoryCode') || lines[j].includes('fc = factoryCode')) {
          foundFc = true;
          break;
        }
        if (lines[j].includes('dayjs().format(\'YYYYMMDD\')') || lines[j].includes("dayjs().format('YYYYMMDD')")) {
          todayLineIdx = j;
          isDashFormat = true;
        }
        if (lines[j].includes('new Date()') && !lines[j].includes('new Date()')) {
          // Hmm this is ambiguous...
        }
        if (lines[j].trim().startsWith('const today = new Date();')) {
          todayLineIdx = j;
          isCompactFormat = true;
        }
        if (lines[j].includes('const prefix =')) {
          prefixLineIdx = j;
        }
      }
      
      // If function has factoryCode but no fc, add fc and modify prefix
      if (!foundFc && todayLineIdx >= 0 && prefixLineIdx >= 0) {
        // Get indentation
        const indent = lines[todayLineIdx].match(/^(\s*)/)?.[1] || '  ';
        
        if (isDashFormat) {
          // Insert fc line after today line
          lines.splice(todayLineIdx + 1, 0, `${indent}const fc = factoryCode ? \`-\${factoryCode.toUpperCase()}\` : '';`);
          prefixLineIdx++; // Shift by 1
          
          // Modify prefix line
          const prefixLine = lines[prefixLineIdx];
          // Find type code in prefix like `SO-${today}-` → `SO${fc}-${today}-`
          const prefixMatch = prefixLine.match(/const prefix = `(\w+)-\$\{today\}-`;?/);
          if (prefixMatch) {
            lines[prefixLineIdx] = `${indent}const prefix = \`${prefixMatch[1]}\${fc}-\${today}-\`;`;
          }
          // Also handle `XXX-${dateStr}-` pattern (compact format with dateStr)
          const dateStrMatch = prefixLine.match(/const prefix = `(\w+)-\$\{dateStr\}-`;?/);
          if (dateStrMatch) {
            lines[prefixLineIdx] = `${indent}const prefix = \`${dateStrMatch[1]}\${fc}-\${dateStr}-\`;`;
          }
        }
        
        if (isCompactFormat) {
          // Insert fc line after today line  
          lines.splice(todayLineIdx + 1, 0, `${indent}const fc = factoryCode ? factoryCode.toUpperCase() : '';`);
          prefixLineIdx++; // Shift by 1
          
          // Modify prefix line
          const prefixLine = lines[prefixLineIdx];
          // Find prefix like `SO-${dateStr}-`
          const compactDashMatch = prefixLine.match(/const prefix = `(\w+)-\$\{dateStr\}-`;?/);
          if (compactDashMatch) {
            lines[prefixLineIdx] = `${indent}const prefix = \`${compactDashMatch[1]}\${fc}-\${dateStr}-\`;`;
          }
          // Find prefix like 'P' + fcStr pattern
          const compactPrefixMatch = prefixLine.match(/const prefix = '(\w+)' \+ (\w+);/);
          // This doesn't apply here as all compact functions use backtick format now
        }
      }
    }
  }
  
  content = lines.join('\n');

  // ====== FIX 4: Special case - materialReturn uses tx not transaction ======
  content = content.replace(
    /await generateReturnNumber\(factoryCode, tx\)/g,
    `await generateReturnNumber(factoryCode, tx)`
  );
  
  // ====== FIX 5: Add getFactoryCode import if needed ======
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
  
  // ====== FIX 6: Add factoryCode declaration after try { ======
  if (content.includes('factoryCode') && !content.includes('const factoryCode = await getFactoryCode(req)')) {
    const lines = content.split('\n');
    let modified = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('try {')) {
        let usesFactoryCode = false;
        for (let j = i + 1; j < Math.min(i + 80, lines.length); j++) {
          if (lines[j].includes('factoryCode') && 
              !lines[j].includes('factoryCode: string') && 
              !lines[j].includes('const fc = factoryCode') &&
              !lines[j].includes('getFactoryCode(req)')) {
            usesFactoryCode = true;
            break;
          }
          if (lines[j].match(/^\s*\}\s*catch/) || lines[j].match(/^\s*export\s+const\s+\w+\s*=\s*async/)) {
            break;
          }
        }
        if (usesFactoryCode) {
          let alreadyDeclared = false;
          for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
            if (lines[j].includes('const factoryCode = await getFactoryCode(req)')) {
              alreadyDeclared = true;
              break;
            }
          }
          if (!alreadyDeclared) {
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
    }
    if (modified) {
      content = lines.join('\n');
    }
  }

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf-8');
    console.log(`MODIFIED: ${path.relative(path.join(__dirname, 'Seals MES System', 'server', 'src'), file)}`);
  }
}