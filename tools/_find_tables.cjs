const fs = require('fs');
const path = require('path');

function findFiles(dir, ext) {
  const results = [];
  const list = fs.readdirSync(dir);
  for (const f of list) {
    const fp = path.join(dir, f);
    const stat = fs.statSync(fp);
    if (stat.isDirectory() && !f.startsWith('.') && f !== 'node_modules') {
      results.push(...findFiles(fp, ext));
    } else if (stat.isFile() && fp.endsWith(ext)) {
      results.push(fp);
    }
  }
  return results;
}

const skip = ['select','set','top','case','values','inner','left','right','outer','full','cross','where','and','or','not','null','exists','begin','end','print','if','sys','information_schema','select','newid','getdate','isnull','object_id','varbinary','columns','tables','index','key','primary','foreign','constraint','default','identity','asc','desc','as','on','in','like','between','is','create','alter','drop','add','column','table','bit','int','nvarchar','varchar','datetime','decimal','date','tinyint','unique','clustered','nonclustered','count','sum','avg','max','min','cast','convert','charindex','substring','len','replace','rtrim','ltrim','upper','lower','getutcdate','dateadd','datediff','datepart','year','month','day','coalesce','row_number','over','partition','order','group','having','union','all','distinct','top','percent','with','ties','offset','fetch','next','rows','only','output','inserted','deleted','merge','matched','then','when','else','end','begin','tran','commit','rollback','save','declare','exec','execute','sp_','xp_'];

const files = findFiles('Seals MES System/server/src', '.ts');
const tables = new Set();

for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  // Match table names after FROM, JOIN, INTO, UPDATE
  const matches = content.matchAll(/(?:FROM|JOIN|INTO|UPDATE)\s+(\w+)/gi);
  for (const m of matches) {
    const t = m[1].toLowerCase();
    if (!skip.includes(t) && !t.startsWith('@') && !t.startsWith(':') && t.length > 1) {
      tables.add(t);
    }
  }
}

console.log([...tables].sort().join('\n'));
console.log('\nTotal: ' + tables.size + ' unique table names');
