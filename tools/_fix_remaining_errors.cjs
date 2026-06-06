/**
 * 精确修复：为每个有 factoryCode 引用的 export const handler 函数
 * 在其 try { 后面注入 factoryCode 声明。
 * 
 * 不同之处：这次直接用 TypeScript 编译错误列表作为输入
 * 确保精确修复。
 */
const fs = require('fs');
const path = require('path');

// 错误行号对应的文件
const errorFiles = [
  'modules/warehouse/abnormalIO/abnormalIO.controller.ts',
  'modules/purchasing/receivingNotice/receivingNotice.controller.ts',
  'modules/quality/nonconformingProduct/nonconformingProduct.controller.ts',
  'modules/quality/productionInspection/productionInspection.controller.ts',
  'modules/quality/reworkOrder/reworkOrder.controller.ts',
  'modules/planning/mps/mps.controller.ts',
  'modules/purchasing/purchaseInspection/purchaseInspection.controller.ts',
  'modules/production/outsourcingOrder/outsourcingOrder.controller.ts',
  'modules/finance/expenseClaim/expenseClaim.controller.ts',
];

const srcRoot = path.join(__dirname, 'Seals MES System', 'server', 'src');

for (const relFile of errorFiles) {
  const file = path.join(srcRoot, relFile);
  let content = fs.readFileSync(file, 'utf-8');
  let original = content;
  const lines = content.split('\n');
  let modified = false;
  
  // Strategy: Find each `export const xxx = async (req: Request` handler
  // Scan its body for factoryCode references (excluding function definitions)
  // If factoryCode is referenced without a declaration, add one after the first try {
  
  let handlerStartIdx = -1;
  let handlerName = '';
  
  for (let i = 0; i < lines.length; i++) {
    // Detect handler start
    const match = lines[i].match(/^(?:export )?const (\w+) = async \(req(?:: Request)?(?:, res(?:: Response)?(?:, next(?:: NextFunction)?)?)?\)?\s*=>\s*\{/);
    if (!match) {
      // Also try: export const xxx = async (req: Request, res: Response, next: NextFunction) => {
      const match2 = lines[i].match(/^export const (\w+) = async \(req: Request/);
      if (match2) {
        handlerStartIdx = i;
        handlerName = match2[1];
      }
      continue;
    }
    handlerStartIdx = i;
    handlerName = match[1];
    
    // Find first try { within this handler
    let tryIdx = -1;
    for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
      if (lines[j].includes('try {')) {
        tryIdx = j;
        break;
      }
    }
    
    if (tryIdx < 0) continue;
    
    // Scan handler body for factoryCode usage (but not in declarations)
    let usesFactoryCode = false;
    let hasDeclaration = false;
    
    // Scan entire handler (up to 300 lines)
    for (let j = tryIdx + 1; j < Math.min(tryIdx + 300, lines.length); j++) {
      const l = lines[j];
      
      // Skip function definitions
      if (l.includes('factoryCode: string')) continue;
      if (l.includes('const fc = factoryCode')) continue;
      
      if (l.includes('factoryCode')) {
        // Check if it's a reference (not a declaration)
        if (l.includes('const factoryCode = await getFactoryCode(req)')) {
          hasDeclaration = true;
        } else if (!l.includes('getFactoryCode(req)')) {
          usesFactoryCode = true;
        }
      }
      
      // Stop at next handler
      if (l.match(/^export const \w+ = async/) && j > tryIdx + 5) {
        break;
      }
    }
    
    if (usesFactoryCode && !hasDeclaration) {
      // Insert declaration after try {
      let indent = '    ';
      if (tryIdx + 1 < lines.length) {
        indent = lines[tryIdx + 1].match(/^(\s*)/)?.[1] || '    ';
      }
      lines.splice(tryIdx + 1, 0, `${indent}const factoryCode = await getFactoryCode(req);`);
      modified = true;
      i++; // compensate for the splice
    }
  }
  
  // Also handle functions that don't start with `export const` but are inner functions
  // e.g., async function bodies inside other structures
  // For abnormalIO, some handlers might not follow the standard pattern
  
  // Additional scan: find ALL try { blocks and check for factoryCode
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === 'try {' || lines[i].endsWith('try {')) {
      // Only check if this try block is inside an async handler (i.e., not inside a generate function)
      // Skip if this is inside a const generateXxxNumber = async function definition
      let insideLocalFunc = false;
      for (let j = Math.max(0, i - 10); j < i; j++) {
        if (lines[j].match(/const generate\w+Number = async/)) {
          insideLocalFunc = true;
          break;
        }
      }
      if (insideLocalFunc) continue;
      
      let usesFactoryCode = false;
      let hasDeclaration = false;
      
      for (let j = i + 1; j < Math.min(i + 150, lines.length); j++) {
        if (lines[j].includes('factoryCode') && !lines[j].includes('factoryCode: string') && !lines[j].includes('const fc = factoryCode')) {
          if (lines[j].includes('const factoryCode = await getFactoryCode(req)')) {
            hasDeclaration = true;
          } else {
            usesFactoryCode = true;
          }
        }
        if (lines[j].match(/^\s*\}\s*catch/)) break;
        if (lines[j].match(/^export const \w+ = async/) && j > i + 5) break;
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
  
  // Ensure getFactoryCode import
  content = lines.join('\n');
  if (content.includes('factoryCode') && !content.includes('getFactoryCode')) {
    // Add import
    if (content.includes('getFactoryId') && content.includes('factoryWhere')) {
      content = content.replace(/import \{ getFactoryId \} from/g, 'import { getFactoryId, getFactoryCode } from');
    } else {
      const importLines = content.match(/^import .+;$/gm);
      if (importLines) {
        const lastImport = importLines[importLines.length - 1];
        const rel = relFile.replace(/modules[\\\/]/, '');
        const d = rel.split(/[\\\/]/).length - 1;
        let p = d <= 1 ? '../../utils/factoryWhere.util' : '../../../utils/factoryWhere.util';
        content = content.replace(lastImport, lastImport + `\nimport { getFactoryCode } from '${p}';`);
      }
    }
    modified = true;
  }
  
  if (modified) {
    fs.writeFileSync(file, content, 'utf-8');
    console.log(`MODIFIED: ${relFile}`);
  } else {
    console.log(`NO CHANGE: ${relFile}`);
  }
}