const fs = require('fs');
const path = 'd:\\rubber\\Seals MES System\\client\\src\\views\\quality\\QualityReport\\PurchaseInspection.vue';
let content = fs.readFileSync(path, 'utf8');

const oldCode = `                  <a-form-item label="合格数量">
                    <a-input-number v-model:value="inspectData.header.qualified_quantity" :min="0" style="width: 100%;" @change="onQtyChange" />`;

const newCode = `                  <a-form-item label="合格数量(自动计算)">
                    <a-input-number :value="parseFloat(inspectData.header.qualified_quantity) || 0" disabled style="width: 100%;" />`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(path, content, 'utf8');
  console.log('DONE - qualified_quantity set to disabled');
} else {
  console.log('ERROR: old code not found');
}
