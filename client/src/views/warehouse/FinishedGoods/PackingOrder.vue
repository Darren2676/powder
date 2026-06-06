<script setup lang="ts">
import { ref, reactive, computed, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, PlusOutlined, EyeOutlined, CheckOutlined, CloseOutlined,
  ExclamationCircleOutlined, PrinterOutlined, SwapOutlined, ScissorOutlined
} from '@ant-design/icons-vue'
import QRCode from 'qrcode'
import {
  getPackingOrders, getPackingOrderDetail, createPackingOrder,
  confirmPackingOrder, cancelPackingOrder, getAvailableBatches,
  assignLabelsToBox, removeLabelFromBox, regenerateBoxes,
  unpackPackingOrder, unpackBoxes
} from '@/api/warehouse/packingOrder'
import { getWarehouses } from '@/api/master-data/warehouse'
import { getItems } from '@/api/master-data/itemMaster'
import { useTableList } from '@/composables/useTableList'
import { useModalDrag } from '@/composables/useModalDrag'

defineOptions({ name: 'PackingOrderList' })

const { loading, dataSource, searchText, pagination, fetchData, handleTableChange, handleSearch, handleReset } = useTableList<any>(getPackingOrders)

const warehouseList = ref<any[]>([])
const warehouseOptions = ref<{ label: string; value: string }[]>([])
const productList = ref<any[]>([])
const productOptions = ref<{ label: string; value: string }[]>([])

// 创建弹窗
const createVisible = ref(false)
const createForm = reactive({
  warehouse_number: '', warehouse_name: '',
  item_number: '', item_name: '', specifications: '', basic_unit: '',
  total_quantity: 0, inner_pack_qty: 0, outer_pack_qty: 0,
  remark: ''
})
const availableBatches = ref<any[]>([])
const selectedBatchKeys = ref<string[]>([])
const createSaving = ref(false)

// 详情弹窗
const detailVisible = ref(false)
const detailData = ref<any>({})
const detailLabels = ref<any[]>([])
const detailBoxes = ref<any[]>([])
const detailLoading = ref(false)
const detailTab = ref('labels')

// 装箱操作相关
const assignTargetBox = ref('')
const assignLoading = ref(false)

// 拆箱操作相关
const unpackVisible = ref(false)
const unpackSaving = ref(false)
const unpackForm = reactive({
  box_numbers: [] as string[],
  warehouse_number: '',
  remark: ''
})

const { modalStyle: createModalStyle, onDragStart: createOnDragStart, resetDrag: createResetDrag } = useModalDrag()
const { modalStyle: detailModalStyle, onDragStart: detailOnDragStart, resetDrag: detailResetDrag } = useModalDrag()

const statusFilter = ref('')

// 获取仓库下拉
const fetchWarehouses = async () => {
  try {
    const res = await getWarehouses({ page: 1, limit: 9999 })
    const list = res.data.items || []
    warehouseList.value = list
    warehouseOptions.value = list.map((w: any) => ({ label: `${w.warehouse_number} - ${w.warehouse_name}`, value: w.warehouse_number }))
  } catch {}
}

// 获取产品下拉（仅成品）
const fetchProducts = async () => {
  try {
    const res = await getItems({ page: 1, limit: 9999, item_type: '成品' })
    const list = res.data.items || res.data || []
    productList.value = list
    productOptions.value = list.map((p: any) => ({ label: `${p.item_number} - ${p.item_name}`, value: p.item_number }))
  } catch {}
}

// 仓库选择
const handleWarehouseChange = (val: string) => {
  const found = warehouseList.value.find((w: any) => w.warehouse_number === val)
  createForm.warehouse_name = found ? found.warehouse_name : ''
  loadAvailableBatches()
}

// 产品选择
const handleProductChange = (val: string) => {
  const found = productList.value.find((p: any) => p.item_number === val)
  if (found) {
    createForm.item_name = found.item_name || ''
    createForm.specifications = found.specifications || ''
    createForm.basic_unit = found.basic_unit || ''
    createForm.inner_pack_qty = found.inner_pack_qty || 0
    createForm.outer_pack_qty = found.outer_pack_qty || 0
  }
  loadAvailableBatches()
}

// 加载可用批次
const loadAvailableBatches = async () => {
  if (!createForm.item_number || !createForm.warehouse_number) { availableBatches.value = []; selectedBatchKeys.value = []; return }
  try {
    const res = await getAvailableBatches({ item_number: createForm.item_number, warehouse_number: createForm.warehouse_number })
    availableBatches.value = res.data || []
    // 默认勾选合格品，不勾选不合格品
    selectedBatchKeys.value = availableBatches.value
      .filter((b: any) => b.quality_status !== '不合格品')
      .map((b: any) => b.batch_number)
  } catch { availableBatches.value = []; selectedBatchKeys.value = [] }
}

// 已选批次的可用库存总量
const selectedBatchTotal = () => {
  return availableBatches.value
    .filter((b: any) => selectedBatchKeys.value.includes(b.batch_number))
    .reduce((s: number, b: any) => s + parseFloat(b.quantity), 0)
}

// 计算已选批次预计标签数
const selectedBatchLabels = computed(() => {
  const S = createForm.inner_pack_qty || 1
  return availableBatches.value
    .filter((b: any) => selectedBatchKeys.value.includes(b.batch_number))
    .reduce((total: number, b: any) => {
      const qty = parseFloat(b.quantity)
      const fullLabels = Math.floor(qty / S)
      const tailQty = qty - fullLabels * S
      return total + fullLabels + (tailQty > 0 ? 1 : 0)
    }, 0)
})

// 打开创建弹窗
const openCreate = () => {
  Object.assign(createForm, {
    warehouse_number: '', warehouse_name: '',
    item_number: '', item_name: '', specifications: '', basic_unit: '',
    total_quantity: 0, inner_pack_qty: 0, outer_pack_qty: 0, remark: ''
  })
  availableBatches.value = []
  selectedBatchKeys.value = []
  createResetDrag()
  createVisible.value = true
}

// 提交创建
const handleCreate = async () => {
  if (!createForm.warehouse_number) { message.warning('请选择仓库'); return }
  if (!createForm.item_number) { message.warning('请选择产品'); return }
  if (!createForm.total_quantity || createForm.total_quantity <= 0) { message.warning('请输入装箱总数量'); return }
  if (!createForm.inner_pack_qty || createForm.inner_pack_qty <= 0) { message.warning('请先在物料主数据中配置内包装数量'); return }
  if (selectedBatchKeys.value.length === 0) { message.warning('请至少选择一个批次'); return }
  const selTotal = selectedBatchTotal()
  if (selTotal < createForm.total_quantity) { message.warning(`已选批次库存不足（${selTotal}），请增加批次或减少装箱数量`); return }
  createSaving.value = true
  try {
    await createPackingOrder({ ...createForm, selected_batches: selectedBatchKeys.value })
    message.success('装箱单创建成功')
    createVisible.value = false
    fetchData()
  } catch (e: any) { message.error(e?.response?.data?.message || '创建失败') }
  finally { createSaving.value = false }
}

// 查看详情
const handleDetail = async (record: any) => {
  detailResetDrag()
  detailVisible.value = true
  detailLoading.value = true
  detailTab.value = 'labels'
  try {
    const res = await getPackingOrderDetail(record.packing_number)
    detailData.value = res.data.header || {}
    detailLabels.value = res.data.labels || []
    detailBoxes.value = res.data.boxes || []
  } catch (e: any) { message.error(e?.response?.data?.message || '获取详情失败') }
  finally { detailLoading.value = false }
}

// 确认装箱
const handleConfirm = (record: any) => {
  Modal.confirm({
    title: '确认装箱', icon: createVNode(ExclamationCircleOutlined),
    content: `确认装箱单"${record.packing_number}"？确认后将扣减批次库存，不可修改。`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try { await confirmPackingOrder(record.packing_number); message.success('确认成功'); fetchData() }
      catch (e: any) { message.error(e?.response?.data?.message || '确认失败') }
    }
  })
}

// 取消装箱
const handleCancel = (record: any) => {
  Modal.confirm({
    title: '取消装箱', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要取消装箱单"${record.packing_number}"？`,
    okText: '确认', cancelText: '取消', okType: 'danger',
    onOk: async () => {
      try { await cancelPackingOrder(record.packing_number); message.success('取消成功'); fetchData() }
      catch (e: any) { message.error(e?.response?.data?.message || '取消失败') }
    }
  })
}

// 整单拆箱
const handleUnpack = (record: any) => {
  Modal.confirm({
    title: '整单拆箱', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要对装箱单"${record.packing_number}"进行整单拆箱？拆箱后将恢复批次库存，装箱单回退到草稿状态，可重新编辑装箱。`,
    okText: '确认拆箱', cancelText: '取消', okType: 'danger',
    onOk: async () => {
      try { await unpackPackingOrder(record.packing_number); message.success('整单拆箱成功，装箱单已回退到草稿状态'); fetchData() }
      catch (e: any) {
        const backendMsg = e?.response?.data?.message;
        message.error(backendMsg || '整单拆箱失败');
      }
    }
  })
}

// 打开逐箱拆箱弹窗
const openBoxUnpack = () => {
  unpackForm.box_numbers = []
  unpackForm.warehouse_number = detailData.value.warehouse_number || ''
  unpackForm.remark = ''
  unpackVisible.value = true
}

// 提交逐箱拆箱
const handleBoxUnpack = async () => {
  if (unpackForm.box_numbers.length === 0) { message.warning('请选择要拆箱的箱'); return }
  if (!unpackForm.warehouse_number) { message.warning('请指定仓库'); return }
  unpackSaving.value = true
  try {
    const res = await unpackBoxes({ ...unpackForm })
    message.success(`逐箱拆箱成功，共拆箱 ${res.data.unpacked_boxes?.length || 0} 箱`)
    unpackVisible.value = false
    // 刷新详情
    const detailRes = await getPackingOrderDetail(detailData.value.packing_number)
    detailData.value = detailRes.data.header || {}
    detailLabels.value = detailRes.data.labels || []
    detailBoxes.value = detailRes.data.boxes || []
    fetchData()
  } catch (e: any) { message.error(e?.response?.data?.message || '逐箱拆箱失败') }
  finally { unpackSaving.value = false }
}

const columns = [
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '行号', key: 'rowIndex', width: 60 },
  { title: '装箱单号', dataIndex: 'packing_number', key: 'packing_number', width: 160 },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120 },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 140 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 100 },
  { title: '总数量', dataIndex: 'total_quantity', key: 'total_quantity', width: 90 },
  { title: '标签数', dataIndex: 'total_labels', key: 'total_labels', width: 80 },
  { title: '总箱数', dataIndex: 'total_boxes', key: 'total_boxes', width: 80 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '操作人', dataIndex: 'operator', key: 'operator', width: 90 },
  { title: '创建时间', dataIndex: 'creation_date', key: 'creation_date', width: 160 },
  { title: '操作', key: 'action', width: 180, fixed: 'right' as const }
]

const statusColor = (s: string) => {
  if (s === '已确认') return 'blue'
  if (s === '已取消') return 'red'
  if (s === '已拆箱') return 'orange'
  return 'default'
}

// ==================== 批次标签打印（新方案：无袋号） ====================

const printBagLabel = async (label: any) => {
  try {
    // QR码内容：批次号|产品编号|数量
    const qrContent = `${label.batch_number}|${label.item_number}|${label.label_quantity}`
    const qrDataUrl = await QRCode.toDataURL(qrContent, { width: 120, margin: 1 })
    const printWindow = window.open('', '_blank', 'width=400,height=500')
    if (!printWindow) { message.error('无法打开打印窗口'); return }
    printWindow.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>内包装标签 - ${label.batch_number}</title>
<style>
  @page { size: 80mm 60mm; margin: 2mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Microsoft YaHei", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label { width: 80mm; height: 60mm; border: 1px solid #333; padding: 3mm; display: flex; flex-direction: column; }
  .label-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 2mm; margin-bottom: 2mm; }
  .label-title { font-size: 12px; font-weight: bold; }
  .label-qr { width: 18mm; height: 18mm; }
  .label-qr img { width: 100%; height: 100%; }
  .label-body { font-size: 9px; line-height: 1.6; flex: 1; }
  .label-row { display: flex; justify-content: space-between; }
  .label-key { color: #666; }
  .label-val { font-weight: bold; }
  .label-batch { font-size: 11px; color: #c00; font-weight: bold; border-top: 1px dashed #999; padding-top: 1mm; margin-top: 1mm; }
  @media screen { body { padding: 10px; background: #f5f5f5; } .label { background: #fff; margin-bottom: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); } }
</style></head><body>
<div class="label">
  <div class="label-header">
    <div>
      <div class="label-title">内包装标签（批次）</div>
    </div>
    <div class="label-qr"><img src="${qrDataUrl}" /></div>
  </div>
  <div class="label-body">
    <div class="label-row"><span class="label-key">批次号：</span><span class="label-val">${label.batch_number}</span></div>
    <div class="label-row"><span class="label-key">产品：</span><span class="label-val">${label.item_name || ''}</span></div>
    <div class="label-row"><span class="label-key">编号：</span><span class="label-val">${label.item_number || ''}</span></div>
    <div class="label-row"><span class="label-key">规格：</span><span class="label-val">${label.specifications || '-'}</span></div>
    <div class="label-row"><span class="label-key">数量：</span><span class="label-val">${label.label_quantity} ${label.basic_unit || ''}</span></div>
    <div class="label-row"><span class="label-key">标准：</span><span class="label-val">${label.standard_qty} ${label.basic_unit || ''}</span></div>
  </div>
  ${!label.is_full ? '<div class="label-batch">不足一袋，实际数量见上方</div>' : ''}
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
</body></html>`)
    printWindow.document.close()
  } catch (e: any) { message.error(e?.response?.data?.message || '生成标签失败') }
}

// 批量打印所有批次标签
const printAllBagLabels = async () => {
  if (detailLabels.value.length === 0) { message.warning('无标签可打印'); return }
  try {
    const qrPromises = detailLabels.value.map((lb: any) => {
      const qrContent = `${lb.batch_number}|${lb.item_number}|${lb.label_quantity}`
      return QRCode.toDataURL(qrContent, { width: 100, margin: 1 })
    })
    const qrUrls = await Promise.all(qrPromises)
    const labelsHtml = detailLabels.value.map((lb: any, idx: number) => {
      return `<div class="label">
  <div class="label-header">
    <div><div class="label-title">内包装标签（批次）</div></div>
    <div class="label-qr"><img src="${qrUrls[idx]}" /></div>
  </div>
  <div class="label-body">
    <div class="label-row"><span class="label-key">批次号：</span><span class="label-val">${lb.batch_number}</span></div>
    <div class="label-row"><span class="label-key">产品：</span><span class="label-val">${lb.item_name || ''}</span></div>
    <div class="label-row"><span class="label-key">编号：</span><span class="label-val">${lb.item_number || ''}</span></div>
    <div class="label-row"><span class="label-key">数量：</span><span class="label-val">${lb.label_quantity} ${lb.basic_unit || ''}</span></div>
    <div class="label-row"><span class="label-key">标准：</span><span class="label-val">${lb.standard_qty} ${lb.basic_unit || ''}</span></div>
  </div>
  ${!lb.is_full ? '<div class="label-batch">不足一袋，实际数量见上方</div>' : ''}
</div>`
    }).join('')
    const printWindow = window.open('', '_blank', 'width=400,height=700')
    if (!printWindow) { message.error('无法打开打印窗口'); return }
    printWindow.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>批次标签批量打印</title>
<style>
  @page { size: 80mm 60mm; margin: 2mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Microsoft YaHei", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label { width: 80mm; height: 60mm; border: 1px solid #333; padding: 3mm; page-break-after: always; display: flex; flex-direction: column; }
  .label:last-child { page-break-after: avoid; }
  .label-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 2mm; margin-bottom: 2mm; }
  .label-title { font-size: 11px; font-weight: bold; }
  .label-qr { width: 16mm; height: 16mm; }
  .label-qr img { width: 100%; height: 100%; }
  .label-body { font-size: 9px; line-height: 1.6; flex: 1; }
  .label-row { display: flex; justify-content: space-between; }
  .label-key { color: #666; }
  .label-val { font-weight: bold; }
  .label-batch { font-size: 10px; color: #c00; font-weight: bold; border-top: 1px dashed #999; padding-top: 1mm; margin-top: 1mm; }
  @media screen { body { padding: 10px; background: #f5f5f5; } .label { background: #fff; margin-bottom: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); } }
</style></head><body>${labelsHtml}
<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
</body></html>`)
    printWindow.document.close()
  } catch (e: any) { message.error(e?.response?.data?.message || '批量打印标签失败') }
}

// ==================== 箱标签打印（新方案：批次明细） ====================

const printBoxLabel = async (box: any) => {
  try {
    const qrDataUrl = await QRCode.toDataURL(box.box_number, { width: 140, margin: 1 })
    // 批次明细替代袋列表
    const batchDetail = (box.labels || [])
      .reduce((acc: any[], lb: any) => {
        const existing = acc.find(a => a.batch_number === lb.batch_number)
        if (existing) { existing.quantity = Number(existing.quantity) + Number(lb.label_quantity); existing.label_count++ }
        else { acc.push({ batch_number: lb.batch_number, quantity: Number(lb.label_quantity), label_count: 1 }) }
        return acc
      }, [])
    const batchInfo = batchDetail.map((b: any) => `${b.batch_number}: ${b.quantity}(${b.label_count}袋)`).join('<br/>')
    const printWindow = window.open('', '_blank', 'width=500,height=600')
    if (!printWindow) { message.error('无法打开打印窗口'); return }
    printWindow.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>箱标签 - ${box.box_number}</title>
<style>
  @page { size: 100mm 80mm; margin: 2mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Microsoft YaHei", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label { width: 100mm; min-height: 80mm; border: 2px solid #333; padding: 3mm; display: flex; flex-direction: column; }
  .label-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 2mm; margin-bottom: 2mm; }
  .label-title { font-size: 14px; font-weight: bold; letter-spacing: 2px; }
  .label-subtitle { font-size: 11px; color: #666; margin-top: 1mm; }
  .label-qr { width: 22mm; height: 22mm; }
  .label-qr img { width: 100%; height: 100%; }
  .label-body { font-size: 10px; line-height: 1.8; flex: 1; }
  .label-row { display: flex; justify-content: space-between; }
  .label-key { color: #666; }
  .label-val { font-weight: bold; }
  .label-batches { font-size: 9px; border-top: 1px dashed #999; padding-top: 2mm; margin-top: 2mm; color: #333; }
  .label-footer { display: flex; justify-content: space-between; font-size: 9px; border-top: 1px solid #333; padding-top: 2mm; margin-top: 2mm; }
  @media screen { body { padding: 10px; background: #f5f5f5; } .label { background: #fff; margin-bottom: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); } }
</style></head><body>
<div class="label">
  <div class="label-header">
    <div>
      <div class="label-title">外包装标签（箱）</div>
      <div class="label-subtitle">${box.box_number}</div>
    </div>
    <div class="label-qr"><img src="${qrDataUrl}" /></div>
  </div>
  <div class="label-body">
    <div class="label-row"><span class="label-key">产品名称：</span><span class="label-val">${box.item_name || ''}</span></div>
    <div class="label-row"><span class="label-key">产品编号：</span><span class="label-val">${box.item_number || ''}</span></div>
    <div class="label-row"><span class="label-key">规格型号：</span><span class="label-val">${box.specifications || '-'}</span></div>
    <div class="label-row"><span class="label-key">产品总数：</span><span class="label-val">${box.total_quantity}</span></div>
    <div class="label-row"><span class="label-key">标签数：</span><span class="label-val">${box.actual_bag_qty} / ${box.standard_bag_qty} 袋</span></div>
    <div class="label-row"><span class="label-key">仓库：</span><span class="label-val">${box.warehouse_name || ''}</span></div>
  </div>
  ${batchInfo ? `<div class="label-batches">批次明细：<br/>${batchInfo}</div>` : ''}
  <div class="label-footer">
    <span>状态：${box.status || '在库'}</span>
    <span>打印时间：${new Date().toLocaleDateString()}</span>
  </div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
</body></html>`)
    printWindow.document.close()
  } catch (e: any) { message.error(e?.response?.data?.message || '生成箱标签失败') }
}

// 批量打印所有箱标签
const printAllBoxLabels = async () => {
  if (detailBoxes.value.length === 0) { message.warning('无箱标签可打印'); return }
  try {
    const qrPromises = detailBoxes.value.map((box: any) => QRCode.toDataURL(box.box_number, { width: 120, margin: 1 }))
    const qrUrls = await Promise.all(qrPromises)
    const labelsHtml = detailBoxes.value.map((box: any, idx: number) => {
      const batchDetail = (box.labels || [])
        .reduce((acc: any[], lb: any) => {
          const existing = acc.find(a => a.batch_number === lb.batch_number)
          if (existing) { existing.quantity = Number(existing.quantity) + Number(lb.label_quantity); existing.label_count++ }
          else { acc.push({ batch_number: lb.batch_number, quantity: Number(lb.label_quantity), label_count: 1 }) }
          return acc
        }, [])
      const batchInfo = batchDetail.map((b: any) => `${b.batch_number}: ${b.quantity}`).join('、')
      return `<div class="label">
  <div class="label-header">
    <div><div class="label-title">外包装标签（箱）</div><div class="label-subtitle">${box.box_number}</div></div>
    <div class="label-qr"><img src="${qrUrls[idx]}" /></div>
  </div>
  <div class="label-body">
    <div class="label-row"><span class="label-key">产品：</span><span class="label-val">${box.item_name || ''}</span></div>
    <div class="label-row"><span class="label-key">编号：</span><span class="label-val">${box.item_number || ''}</span></div>
    <div class="label-row"><span class="label-key">总数：</span><span class="label-val">${box.total_quantity}</span></div>
    <div class="label-row"><span class="label-key">标签：</span><span class="label-val">${box.actual_bag_qty} / ${box.standard_bag_qty} 袋</span></div>
  </div>
  ${batchInfo ? `<div class="label-batches">批次：${batchInfo}</div>` : ''}
</div>`
    }).join('')
    const printWindow = window.open('', '_blank', 'width=500,height=700')
    if (!printWindow) { message.error('无法打开打印窗口'); return }
    printWindow.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>箱标签批量打印</title>
<style>
  @page { size: 100mm 80mm; margin: 2mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Microsoft YaHei", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label { width: 100mm; min-height: 80mm; border: 2px solid #333; padding: 3mm; page-break-after: always; display: flex; flex-direction: column; }
  .label:last-child { page-break-after: avoid; }
  .label-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 2mm; margin-bottom: 2mm; }
  .label-title { font-size: 14px; font-weight: bold; letter-spacing: 2px; }
  .label-subtitle { font-size: 11px; color: #666; margin-top: 1mm; }
  .label-qr { width: 20mm; height: 20mm; }
  .label-qr img { width: 100%; height: 100%; }
  .label-body { font-size: 10px; line-height: 1.8; flex: 1; }
  .label-row { display: flex; justify-content: space-between; }
  .label-key { color: #666; }
  .label-val { font-weight: bold; }
  .label-batches { font-size: 9px; border-top: 1px dashed #999; padding-top: 2mm; margin-top: 2mm; color: #333; }
  @media screen { body { padding: 10px; background: #f5f5f5; } .label { background: #fff; margin-bottom: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); } }
</style></head><body>${labelsHtml}
<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
</body></html>`)
    printWindow.document.close()
  } catch (e: any) { message.error(e?.response?.data?.message || '批量打印箱标签失败') }
}

// ==================== 装箱操作 ====================

// 勾选标签
const selectedLabelIds = ref<number[]>([])

// 将勾选标签分配到目标箱
const handleAssignLabels = async () => {
  if (selectedLabelIds.value.length === 0) { message.warning('请先勾选标签'); return }
  if (!assignTargetBox.value) { message.warning('请选择目标箱号'); return }
  assignLoading.value = true
  try {
    await assignLabelsToBox(detailData.value.packing_number, {
      label_ids: selectedLabelIds.value,
      box_number: assignTargetBox.value
    })
    message.success('标签分配成功')
    selectedLabelIds.value = []
    // 刷新详情
    const res = await getPackingOrderDetail(detailData.value.packing_number)
    detailLabels.value = res.data.labels || []
    detailBoxes.value = res.data.boxes || []
  } catch (e: any) { message.error(e?.response?.data?.message || '分配失败') }
  finally { assignLoading.value = false }
}

// 从箱中移除标签
const handleRemoveLabels = async () => {
  if (selectedLabelIds.value.length === 0) { message.warning('请先勾选标签'); return }
  assignLoading.value = true
  try {
    await removeLabelFromBox(detailData.value.packing_number, {
      label_ids: selectedLabelIds.value
    })
    message.success('标签已移除')
    selectedLabelIds.value = []
    const res = await getPackingOrderDetail(detailData.value.packing_number)
    detailLabels.value = res.data.labels || []
    detailBoxes.value = res.data.boxes || []
  } catch (e: any) { message.error(e?.response?.data?.message || '移除失败') }
  finally { assignLoading.value = false }
}

// 重新自动装箱
const handleRegenerateBoxes = () => {
  Modal.confirm({
    title: '重新自动装箱', icon: createVNode(ExclamationCircleOutlined),
    content: '将清除当前箱分配，重新按顺序自动装箱，确定继续？',
    okText: '确定', cancelText: '取消',
    onOk: async () => {
      try {
        await regenerateBoxes(detailData.value.packing_number, {
          outer_pack_qty: detailData.value.outer_pack_qty || detailData.value.total_boxes > 0
            ? Math.ceil(detailData.value.total_labels / detailData.value.total_boxes) : 1
        })
        message.success('重新装箱成功')
        const res = await getPackingOrderDetail(detailData.value.packing_number)
        detailLabels.value = res.data.labels || []
        detailBoxes.value = res.data.boxes || []
      } catch (e: any) { message.error(e?.response?.data?.message || '重新装箱失败') }
    }
  })
}

// 从列表直接打开详情打印
const handlePrintFromList = async (record: any) => {
  detailData.value = {}
  detailLabels.value = []
  detailBoxes.value = []
  try {
    const res = await getPackingOrderDetail(record.packing_number)
    detailData.value = res.data.header || {}
    detailLabels.value = res.data.labels || []
    detailBoxes.value = res.data.boxes || []
    detailVisible.value = true
    detailTab.value = 'boxes'
  } catch (e: any) { message.error(e?.response?.data?.message || '获取详情失败') }
}

onMounted(() => { fetchWarehouses(); fetchProducts(); fetchData() })
</script>

<template>
  <div>
    <a-card :bordered="false">
      <template #title>
        <span style="font-size:18px;font-weight:600">装箱管理</span>
      </template>
      <template #extra>
        <a-space>
          <a-input-search v-model:value="searchText" placeholder="搜索单号/产品" style="width: 200px" @search="handleSearch" />
          <a-select v-model:value="statusFilter" placeholder="状态" allow-clear style="width: 100px" @change="() => fetchData({ status: statusFilter })">
            <a-select-option value="草稿">草稿</a-select-option>
            <a-select-option value="已确认">已确认</a-select-option>
            <a-select-option value="已取消">已取消</a-select-option>
            <a-select-option value="已拆箱">已拆箱</a-select-option>
          </a-select>
          <a-button @click="() => { handleReset(); statusFilter = '' }"><template #icon><ReloadOutlined /></template>重置</a-button>
          <a-button type="primary" @click="openCreate"><template #icon><PlusOutlined /></template>新建装箱单</a-button>
        </a-space>
      </template>

      <a-table :columns="columns" :data-source="dataSource" :loading="loading" :pagination="pagination" @change="handleTableChange" row-key="packing_number" :scroll="{ x: 1600 }" size="small">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">{{ (pagination.current - 1) * pagination.pageSize + index + 1 }}</template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="statusColor(record.status)">{{ record.status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleDetail(record)">查看</a-button>
              <a-button v-if="record.status !== '已取消'" type="link" size="small" @click="handlePrintFromList(record)"><PrinterOutlined /></a-button>
              <a-button v-if="record.status === '草稿'" type="link" size="small" @click="handleConfirm(record)">确认</a-button>
              <a-button v-if="record.status === '已确认'" type="link" size="small" danger @click="handleUnpack(record)"><ScissorOutlined />拆箱</a-button>
              <a-button v-if="record.status === '草稿' || record.status === '已确认'" type="link" size="small" danger @click="handleCancel(record)">取消</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 创建装箱单弹窗 -->
    <a-modal v-model:open="createVisible" :width="760" :style="createModalStyle" @ok="handleCreate" :ok-button-props="{ loading: createSaving }" okText="创建" cancelText="取消">
      <template #title>
        <div class="drag-handle" @mousedown="createOnDragStart">新建装箱单</div>
      </template>
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="仓库" required>
              <a-select v-model:value="createForm.warehouse_number" show-search allow-clear placeholder="请选择仓库"
                :options="warehouseOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="handleWarehouseChange" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="产品" required>
              <a-select v-model:value="createForm.item_number" show-search allow-clear placeholder="请选择产品"
                :options="productOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="handleProductChange" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="规格"><a-input v-model:value="createForm.specifications" disabled /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="单位"><a-input v-model:value="createForm.basic_unit" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="装箱总数量" required>
              <a-input-number v-model:value="createForm.total_quantity" :min="1" :precision="0" placeholder="输入本次装箱总数量" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="每袋数量">
              <a-input-number v-model:value="createForm.inner_pack_qty" :min="1" :precision="0" style="width:100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="每箱袋数">
              <a-input-number v-model:value="createForm.outer_pack_qty" :min="1" :precision="0" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="备注"><a-input v-model:value="createForm.remark" placeholder="选填" /></a-form-item>
          </a-col>
        </a-row>

        <!-- 预估信息 -->
        <a-divider orientation="left" style="font-size:13px;margin:12px 0 8px;">装箱预估</a-divider>
        <div v-if="createForm.total_quantity > 0 && createForm.inner_pack_qty > 0" style="padding:8px 0;">
          <a-descriptions :column="4" size="small">
            <a-descriptions-item label="预计标签数">{{ selectedBatchLabels }}</a-descriptions-item>
            <a-descriptions-item label="预计箱数">{{ createForm.outer_pack_qty > 0 ? Math.ceil(selectedBatchLabels / createForm.outer_pack_qty) : '-' }}</a-descriptions-item>
            <a-descriptions-item label="已选批次库存">{{ selectedBatchTotal() }}</a-descriptions-item>
            <a-descriptions-item label="全部批次库存">{{ availableBatches.reduce((s: number, b: any) => s + parseFloat(b.quantity), 0) }}</a-descriptions-item>
          </a-descriptions>
        </div>

        <!-- 可用批次列表（含预计标签数） -->
        <template v-if="availableBatches.length > 0">
          <a-divider orientation="left" style="font-size:13px;margin:12px 0 8px;">可用批次（先进先出）</a-divider>
          <a-table
            :columns="[
              { title: '批次号', dataIndex: 'batch_number', width: 150 },
              { title: '库存数量', dataIndex: 'quantity', width: 90 },
              { title: '质量状态', dataIndex: 'quality_status', width: 90 },
              { title: '满袋标签', key: 'full_labels', width: 80, align: 'center' as const },
              { title: '尾袋标签', key: 'tail_label', width: 80, align: 'center' as const },
              { title: '选择', key: 'select', width: 60, align: 'center' as const }
            ]"
            :data-source="availableBatches"
            :pagination="false"
            size="small"
            row-key="batch_number"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'quality_status'">
                <a-tag :color="record.quality_status === '合格品' ? 'green' : 'red'">{{ record.quality_status }}</a-tag>
              </template>
              <template v-else-if="column.key === 'full_labels'">
                {{ createForm.inner_pack_qty > 0 ? Math.floor(parseFloat(record.quantity) / createForm.inner_pack_qty) : '-' }}
              </template>
              <template v-else-if="column.key === 'tail_label'">
                <template v-if="createForm.inner_pack_qty > 0">
                  <template v-if="parseFloat(record.quantity) % createForm.inner_pack_qty > 0">
                    <a-tag color="orange">{{ parseFloat(record.quantity) % createForm.inner_pack_qty }}</a-tag>
                  </template>
                  <template v-else>-</template>
                </template>
              </template>
              <template v-else-if="column.key === 'select'">
                <a-checkbox
                  :checked="selectedBatchKeys.includes(record.batch_number)"
                  :disabled="record.quality_status === '不合格品'"
                  @change="(e: any) => {
                    if (e.target.checked) { selectedBatchKeys.push(record.batch_number) }
                    else { selectedBatchKeys = selectedBatchKeys.filter((k: string) => k !== record.batch_number) }
                  }"
                />
              </template>
            </template>
          </a-table>
        </template>
      </a-form>
    </a-modal>

    <!-- 详情弹窗 -->
    <a-modal v-model:open="detailVisible" :width="1100" :footer="null" :style="detailModalStyle">
      <template #title>
        <div class="drag-handle" @mousedown="detailOnDragStart">装箱单详情 - {{ detailData.packing_number }}</div>
      </template>
      <a-spin :spinning="detailLoading">
        <a-descriptions :column="4" bordered size="small" style="margin-bottom:16px">
          <a-descriptions-item label="装箱单号">{{ detailData.packing_number }}</a-descriptions-item>
          <a-descriptions-item label="仓库">{{ detailData.warehouse_name }}</a-descriptions-item>
          <a-descriptions-item label="状态"><a-tag :color="statusColor(detailData.status)">{{ detailData.status }}</a-tag></a-descriptions-item>
          <a-descriptions-item label="产品">{{ detailData.item_name }}</a-descriptions-item>
          <a-descriptions-item label="产品编号">{{ detailData.item_number }}</a-descriptions-item>
          <a-descriptions-item label="规格">{{ detailData.specifications || '-' }}</a-descriptions-item>
          <a-descriptions-item label="总数量">{{ detailData.total_quantity }}</a-descriptions-item>
          <a-descriptions-item label="标签数">{{ detailData.total_labels || detailData.total_bags }}</a-descriptions-item>
        </a-descriptions>

        <a-tabs v-model:activeKey="detailTab" :animated="false">
          <!-- 批次标签Tab -->
          <a-tab-pane key="labels" tab="批次标签">
            <div style="margin-bottom:8px;text-align:right;">
              <a-button size="small" @click="printAllBagLabels"><template #icon><PrinterOutlined /></template>批量打印标签</a-button>
            </div>
            <a-table :columns="[
              { title: '序号', dataIndex: 'label_sequence', width: 50 },
              { title: '批次号', dataIndex: 'batch_number', width: 150 },
              { title: '产品', dataIndex: 'item_name', width: 120 },
              { title: '编号', dataIndex: 'item_number', width: 100 },
              { title: '标签数量', dataIndex: 'label_quantity', width: 80 },
              { title: '标准数量', dataIndex: 'standard_qty', width: 80 },
              { title: '满袋', dataIndex: 'is_full', width: 60 },
              { title: '所属箱号', dataIndex: 'box_number', width: 170 },
              { title: '操作', key: 'label_action', width: 70, fixed: 'right' as const }
            ]" :data-source="detailLabels" :pagination="false" size="small" row-key="id" :scroll="{ x: 880 }">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'is_full'">
                  <a-tag :color="record.is_full ? 'green' : 'orange'">{{ record.is_full ? '满袋' : '尾袋' }}</a-tag>
                </template>
                <template v-else-if="column.key === 'label_action'">
                  <a-button type="link" size="small" @click="printBagLabel(record)">打印</a-button>
                </template>
              </template>
            </a-table>
          </a-tab-pane>

          <!-- 箱明细Tab -->
          <a-tab-pane key="boxes" tab="箱明细">
            <div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
              <a-button v-if="detailData.status === '已确认'" size="small" danger @click="openBoxUnpack"><template #icon><ScissorOutlined /></template>逐箱拆箱</a-button>
              <span v-else></span>
              <a-button size="small" @click="printAllBoxLabels"><template #icon><PrinterOutlined /></template>批量打印箱标签</a-button>
            </div>
            <a-table :columns="[
              { title: '箱序号', dataIndex: 'box_sequence', width: 60 },
              { title: '箱编号', dataIndex: 'box_number', width: 170 },
              { title: '标准袋数', dataIndex: 'standard_bag_qty', width: 80 },
              { title: '实际袋数', dataIndex: 'actual_bag_qty', width: 80 },
              { title: '产品总数', dataIndex: 'total_quantity', width: 80 },
              { title: '满箱', dataIndex: 'is_full', width: 60 },
              { title: '状态', dataIndex: 'status', width: 80 },
              { title: '批次', key: 'batches', width: 200 },
              { title: '操作', key: 'box_action', width: 70, fixed: 'right' as const }
            ]" :data-source="detailBoxes" :pagination="false" size="small" row-key="box_number" :scroll="{ x: 900 }">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'is_full'">
                  <a-tag :color="record.is_full ? 'green' : 'orange'">{{ record.is_full ? '满箱' : '未满' }}</a-tag>
                </template>
                <template v-else-if="column.key === 'status'">
                  <a-tag :color="record.status === '在库' ? 'green' : record.status === '已出库' ? 'red' : record.status === '已拆箱' ? 'orange' : 'blue'">{{ record.status }}</a-tag>
                </template>
                <template v-else-if="column.key === 'batches'">
                  <div v-for="(lb, i) in (record.labels || [])" :key="i" style="font-size:12px;line-height:1.6;">
                    {{ lb.batch_number }}: {{ lb.label_quantity }}
                  </div>
                </template>
                <template v-else-if="column.key === 'box_action'">
                  <a-button type="link" size="small" @click="printBoxLabel(record)">打印</a-button>
                </template>
              </template>
            </a-table>
          </a-tab-pane>

          <!-- 装箱操作Tab（仅草稿状态可用） -->
          <a-tab-pane v-if="detailData.status === '草稿'" key="packing" tab="装箱操作">
            <a-row :gutter="16">
              <!-- 左侧：标签列表 -->
              <a-col :span="14">
                <div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-weight:600;">批次标签</span>
                  <a-space>
                    <a-button size="small" :loading="assignLoading" @click="handleRemoveLabels">移除选中</a-button>
                    <a-select v-model:value="assignTargetBox" placeholder="选择目标箱" style="width:180px" size="small"
                      :options="detailBoxes.map((b: any) => ({ label: b.box_number, value: b.box_number }))" />
                    <a-button size="small" type="primary" :loading="assignLoading" @click="handleAssignLabels">分配到箱</a-button>
                  </a-space>
                </div>
                <a-table :columns="[
                  { title: '选择', key: 'chk', width: 50 },
                  { title: '序号', dataIndex: 'label_sequence', width: 50 },
                  { title: '批次号', dataIndex: 'batch_number', width: 140 },
                  { title: '数量', dataIndex: 'label_quantity', width: 70 },
                  { title: '满袋', dataIndex: 'is_full', width: 50 },
                  { title: '当前箱号', dataIndex: 'box_number', width: 150 }
                ]" :data-source="detailLabels" :pagination="false" size="small" row-key="id" :scroll="{ y: 400 }">
                  <template #bodyCell="{ column, record }">
                    <template v-if="column.key === 'chk'">
                      <a-checkbox
                        :checked="selectedLabelIds.includes(record.id)"
                        @change="(e: any) => {
                          if (e.target.checked) { selectedLabelIds.push(record.id) }
                          else { selectedLabelIds = selectedLabelIds.filter((id: number) => id !== record.id) }
                        }"
                      />
                    </template>
                    <template v-else-if="column.key === 'is_full'">
                      <a-tag :color="record.is_full ? 'green' : 'orange'" style="font-size:11px;">{{ record.is_full ? '满' : '尾' }}</a-tag>
                    </template>
                    <template v-else-if="column.key === 'box_number'">
                      <span :style="{ color: record.box_number ? '#1890ff' : '#999' }">{{ record.box_number || '未装箱' }}</span>
                    </template>
                  </template>
                </a-table>
              </a-col>
              <!-- 右侧：箱列表 -->
              <a-col :span="10">
                <div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-weight:600;">箱列表</span>
                  <a-button size="small" @click="handleRegenerateBoxes"><template #icon><SwapOutlined /></template>重新自动装箱</a-button>
                </div>
                <a-collapse :bordered="false" size="small">
                  <a-collapse-panel v-for="box in detailBoxes" :key="box.box_number" :header="`${box.box_number} (${box.actual_bag_qty}袋, ${box.total_quantity}个)`">
                    <div v-if="box.labels && box.labels.length > 0">
                      <div v-for="(lb, i) in box.labels" :key="i" style="font-size:12px;line-height:1.8;display:flex;justify-content:space-between;">
                        <span>{{ lb.batch_number }}</span>
                        <span>{{ lb.label_quantity }} {{ lb.is_full ? '' : '(尾袋)' }}</span>
                      </div>
                    </div>
                    <div v-else style="color:#999;font-size:12px;">空箱</div>
                  </a-collapse-panel>
                </a-collapse>
              </a-col>
            </a-row>
          </a-tab-pane>
        </a-tabs>
      </a-spin>
    </a-modal>

    <!-- 逐箱拆箱弹窗 -->
    <a-modal v-model:open="unpackVisible" :width="600" @ok="handleBoxUnpack" :ok-button-props="{ loading: unpackSaving }" okText="确认拆箱" cancelText="取消" ok-type="danger">
      <template #title>
        <span><ScissorOutlined style="color:#ff4d4f;margin-right:8px;" />逐箱拆箱</span>
      </template>
      <a-alert message="拆箱后将恢复该箱的批次库存至散件库存，箱状态变更为已拆箱。装箱单状态不变。" type="warning" show-icon style="margin-bottom:16px;" />
      <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 18 }">
        <a-form-item label="仓库">
          <a-select v-model:value="unpackForm.warehouse_number" disabled :options="warehouseOptions" style="width:100%" />
        </a-form-item>
        <a-form-item label="选择箱号" required>
          <a-checkbox-group v-model:value="unpackForm.box_numbers" style="width:100%">
            <a-row>
              <a-col v-for="box in detailBoxes.filter((b: any) => b.status === '在库')" :key="box.box_number" :span="12" style="margin-bottom:4px;">
                <a-checkbox :value="box.box_number">{{ box.box_number }} ({{ box.total_quantity }}个)</a-checkbox>
              </a-col>
            </a-row>
          </a-checkbox-group>
          <div v-if="detailBoxes.filter((b: any) => b.status === '在库').length === 0" style="color:#999;">无在库状态的箱可拆箱</div>
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="unpackForm.remark" placeholder="选填拆箱原因" :rows="2" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
:deep(.ant-card-extra) { padding: 0; }
.drag-handle { cursor: move; user-select: none; }
</style>
