/**
 * 自动为所有控制器文件启用工厂编号前缀：
 * 1. 在 import 行中添加 getFactoryCode
 * 2. 在每个包含 generateXxxNumber 调用的 handler 函数开头插入 factoryCode 获取语句
 * 3. 替换 generateXxxNumber('', ...) 为 generateXxxNumber(factoryCode, ...)
 * 4. 替换 generateXxxNumber() 为 generateXxxNumber(factoryCode)
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, 'Seals MES System', 'server', 'src', 'modules');

// 找所有 .controller.ts 文件
function findControllers(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findControllers(full));
    } else if (entry.name.endsWith('.controller.ts') || entry.name.endsWith('.service.ts')) {
      const content = fs.readFileSync(full, 'utf-8');
      if (content.includes('generate') && content.includes('Number')) {
        results.push(full);
      }
    }
  }
  return results;
}

// 也有mobile controller
function findMobileControllers(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMobileControllers(full));
    } else if (entry.name.endsWith('.mobile.controller.ts')) {
      const content = fs.readFileSync(full, 'utf-8');
      if (content.includes('generate') && content.includes('Number')) {
        results.push(full);
      }
    }
  }
  return results;
}

const files = [...findControllers(root), ...findMobileControllers(root)];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  
  // Step 1: Add getFactoryCode to import if getFactoryId is already imported
  if (content.includes('getFactoryId') && !content.includes('getFactoryCode')) {
    content = content.replace(
      /import \{ getFactoryId \} from/g,
      'import { getFactoryId, getFactoryCode } from'
    );
  } else if (!content.includes('getFactoryCode')) {
    // Add a new import line near getFactoryId or at the top
    const lastImportIdx = content.lastIndexOf('import ');
    if (lastImportIdx >= 0) {
      // Find end of that import line
      const lineEnd = content.indexOf('\n', lastImportIdx);
      const importLine = content.substring(lastImportIdx, lineEnd + 1);
      // Insert after last import
      const relativePath = content.includes('../../../utils/factoryWhere.util') 
        ? '../../../utils/factoryWhere.util' 
        : (content.includes('@/utils/factoryWhere.util') 
          ? '@/utils/factoryWhere.util' 
          : '../../../utils/factoryWhere.util');
      content = content.replace(
        importLine,
        importLine + `import { getFactoryCode } from '${relativePath}';\n`
      );
    }
  }

  // Step 2: Replace generateXxxNumber('', transaction) → generateXxxNumber(factoryCode, transaction)
  content = content.replace(/generate\w+Number\('', transaction\)/g, 'generateXxxNumber(factoryCode, transaction)');
  // Need to be more specific - replace with actual function names
  // Actually let's do it properly with regex that captures function name
  content = content.replace(/generate(\w+Number)\('', transaction\)/g, 'generate$1(factoryCode, transaction)');
  
  // Step 3: Replace generateXxxNumber('', ...) where ... is not just transaction
  // e.g. generateBatchNumber('MB', '', transaction) → generateBatchNumber('MB', factoryCode, transaction)
  content = content.replace(/generate(\w+Number)\('(\w+)', '', transaction\)/g, 'generate$1(\'$2\', factoryCode, transaction)');

  // Step 4: Replace generateXxxNumber() → generateXxxNumber(factoryCode)
  content = content.replace(/generate(\w+Number)\(\)/g, 'generate$1(factoryCode)');
  
  // Step 5: Replace generateXxxNumber('', tx) → generateXxxNumber(factoryCode, tx) for NC controller's local function
  content = content.replace(/generate(\w+Number)\('', tx\)/g, 'generate$1(factoryCode, tx)');

  // Step 6: For handlers that now use factoryCode, add the line:
  // Find all async handler functions that reference factoryCode but don't have the declaration
  // This is tricky - let's find lines that have generateXxxNumber(factoryCode and look upward for the function start
  
  // Actually, simpler approach: find all `try {` blocks inside handler functions
  // that contain factoryCode references and add the declaration
  
  // Even simpler: find all lines that now contain factoryCode and if the file doesn't have
  // `const factoryCode = await getFactoryCode(req)` anywhere, add it at the top of each handler
  
  // Let me check if factoryCode is used in the file
  if (content.includes('factoryCode') && !content.includes('const factoryCode = await getFactoryCode(req)')) {
    // Need to add factoryCode declarations in handler functions
    // Strategy: find all `try {` that are inside functions using factoryCode
    // and add `const factoryCode = await getFactoryCode(req);` right after `try {`
    
    // More robust: find patterns like `async (req: Request,` followed by `try {`
    // and insert the factoryCode line after try {
    
    const lines = content.split('\n');
    let modified = false;
    for (let i = 0; i < lines.length; i++) {
      // Look for try { blocks that contain factoryCode usage below
      if (lines[i].trim() === 'try {' || lines[i].includes('try {')) {
        // Check if factoryCode is used within the next 100 lines
        let usesFactoryCode = false;
        for (let j = i + 1; j < Math.min(i + 100, lines.length); j++) {
          if (lines[j].includes('factoryCode')) {
            usesFactoryCode = true;
            break;
          }
          // Stop at next function boundary
          if (lines[j].includes('async (req: Request') || lines[j].includes('async function')) {
            break;
          }
        }
        if (usesFactoryCode) {
          // Check if factoryCode is already declared in this try block
          let alreadyDeclared = false;
          for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
            if (lines[j].includes('const factoryCode = await getFactoryCode(req)')) {
              alreadyDeclared = true;
              break;
            }
          }
          if (!alreadyDeclared) {
            // Insert after try { line
            lines.splice(i + 1, 0, '      const factoryCode = await getFactoryCode(req);');
            modified = true;
            i++; // Skip the inserted line
          }
        }
      }
    }
    if (modified) {
      content = lines.join('\n');
    }
  }

  fs.writeFileSync(file, content, 'utf-8');
  console.log(`Modified: ${path.relative(path.join(__dirname, 'server', 'src'), file)}`);
}

console.log(`\nTotal files modified: ${files.length}`);