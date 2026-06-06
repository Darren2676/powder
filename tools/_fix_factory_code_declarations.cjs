/**
 * 修复脚本：根据 TypeScript 编译错误，在缺失 factoryCode 声明的 handler 函数中注入
 * `const factoryCode = await getFactoryCode(req);`
 */
const fs = require('fs');
const path = require('path');
const srcRoot = path.join(__dirname, 'Seals MES System', 'server', 'src');

// 从 TypeScript 错误信息中提取有问题的文件和行号
const tscOutput = `
src/modules/production/materialPreparation/materialPreparation.controller.ts(664,51): Cannot find name 'factoryCode'
`;

// 更全面：扫描所有包含 factoryCode 引用的控制器文件
// 对于每个 handler 函数（try 块），检查是否有 factoryCode 声明
const modulesDir = path.join(srcRoot, 'modules');

function findControllerFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findControllerFiles(full));
    } else if (entry.name.endsWith('.controller.ts') || entry.name.endsWith('.mobile.controller.ts')) {
      results.push(full);
    }
  }
  return results;
}

const files = findControllerFiles(modulesDir);
const MODIFIED = [];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  const original = content;
  
  // Find all handler functions that reference factoryCode but don't declare it
  // Strategy: find all `try {` blocks and check if factoryCode is used within
  // but not declared
  
  const lines = content.split('\n');
  let modified = false;
  
  // Track which try blocks have factoryCode declarations
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for try blocks in handler functions
    if (line.trim() === 'try {' || (line.includes('try {') && !line.includes('//'))) {
      // Check if factoryCode is referenced within this try block
      let usesFactoryCode = false;
      let hasDeclaration = false;
      let braceDepth = 0;
      
      // Scan forward until matching catch or end
      for (let j = i + 1; j < Math.min(i + 200, lines.length); j++) {
        const checkLine = lines[j];
        
        // Count braces to track nesting
        for (const ch of checkLine) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
        }
        
        // Check for factoryCode reference (not in function definition)
        if (checkLine.includes('factoryCode') && 
            !checkLine.includes('factoryCode: string') &&
            !checkLine.includes('const fc = factoryCode') &&
            !checkLine.includes('fc = factoryCode')) {
          usesFactoryCode = true;
        }
        
        // Check for factoryCode declaration
        if (checkLine.includes('const factoryCode = await getFactoryCode(req)')) {
          hasDeclaration = true;
        }
        
        // Stop at catch block (matching } catch)
        if (braceDepth <= 0 && checkLine.includes('catch')) {
          break;
        }
        
        // Stop at next handler function
        if (checkLine.match(/export const \w+ = async/) && j > i + 5) {
          break;
        }
      }
      
      if (usesFactoryCode && !hasDeclaration) {
        // Need to add factoryCode declaration after try {
        // Get indentation from next line
        let indent = '    ';
        if (i + 1 < lines.length) {
          indent = lines[i + 1].match(/^(\s*)/)?.[1] || '    ';
        }
        lines.splice(i + 1, 0, `${indent}const factoryCode = await getFactoryCode(req);`);
        modified = true;
        i++; // Skip the inserted line
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