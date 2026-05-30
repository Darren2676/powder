<template>
  <div class="order-create">
    <van-nav-bar title="新建销售订单" left-arrow @click-left="router.back()" />

    <van-form @submit="handleSubmit" class="order-form">
      <!-- 订单头信息 -->
      <div class="section-title">订单信息</div>
      <van-cell-group inset>
        <van-field v-model="form.customer_name" is-link readonly label="客户名称" placeholder="点击选择客户" @click="showCustomerPicker = true" :rules="[{ required: true, message: '请选择客户' }]" />
        <van-field v-model="form.order_date" is-link readonly label="订单日期" placeholder="选择日期" @click="showOrderDatePicker = true" />
        <van-field v-model="form.delivery_date" is-link readonly label="交货日期" placeholder="选择日期" @click="showDeliveryDatePicker = true" />
        <van-field v-model="form.customer_po_number" label="客户PO号" placeholder="请输入" />
        <van-field v-model="form.head_of_sales" label="销售负责人" placeholder="请输入" />
        <van-field v-model="form.linkman" label="联系人" placeholder="请输入" />
        <van-field v-model="form.contacts" label="联系方式" placeholder="请输入" />
        <van-field v-model="form.remark" label="备注" type="textarea" placeholder="请输入" rows="2" autosize />
      </van-cell-group>

      <!-- 订单行 -->
      <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>订单明细 ({{ form.details.length }}行)</span>
        <van-button size="small" type="primary" plain icon="add-o" @click="addDetailLine">添加行</van-button>
      </div>

      <div v-for="(line, idx) in form.details" :key="idx" class="detail-card">
        <div class="detail-card__header">
          <span>行 {{ idx + 1 }}</span>
          <van-icon name="delete" color="#ee0a24" @click="removeDetailLine(idx)" />
        </div>
        <van-cell-group inset>
          <!-- 物料：行内模糊搜索 + 下拉选择 -->
          <div class="item-field-wrap">
            <van-field
              v-model="line._itemSearch"
              label="产品编号"
              placeholder="输入编号/名称搜索"
              :rules="[{ required: true, message: '请选择物料' }]"
              @update:model-value="onItemSearch(idx, $event)"
              @focus="onItemFocus(idx)"
              @blur="onItemBlur"
              clearable
            />
            <div v-if="activeItemLine === idx && showItemDropdown && lineItemOptions.length" class="item-dropdown">
              <van-loading v-if="itemLoading" size="20" class="item-dropdown__loading" />
              <template v-else>
                <div v-for="it in lineItemOptions" :key="it.item_number" class="item-dropdown__option" @mousedown.prevent="selectItem(it, idx)">
                  <div class="item-dropdown__name">{{ it.item_name }}</div>
                  <div class="item-dropdown__sub">{{ it.item_number }}{{ it.specifications ? ' | ' + it.specifications : '' }}</div>
                </div>
              </template>
            </div>
          </div>
          <van-field v-model="line.item_name" label="产品名称" placeholder="自动填入" readonly />
          <van-field v-model="line.specifications" label="规格" placeholder="自动填入" readonly />
          <van-field v-model="line.basic_unit" label="单位" placeholder="自动填入" readonly />
          <van-field v-model="line.product_drawing_number" label="产品图号" placeholder="自动填入" readonly />
          <van-field v-model="line.order_quantity" type="number" label="订单数量" placeholder="请输入" @update:model-value="calcLineAmount(idx)" />
          <van-field v-model="line.unit_price" type="number" label="含税单价" placeholder="自动取价" @update:model-value="calcLineAmount(idx)" @blur="formatPrice(idx, 'unit_price')" />
          <van-field v-model="line.tax_rate" type="number" label="税率%" placeholder="如: 13" />
          <van-field v-model="line.total_amount" label="金额" placeholder="自动计算" readonly>
            <template #input>
              <span style="color:#1677ff;font-weight:600">{{ formatAmt(line.total_amount) }}</span>
            </template>
          </van-field>
          <van-field v-model="line.delivery_date" is-link readonly label="交货日期" placeholder="选择" @click="openLineDatePicker(idx, 'delivery_date')" />
          <van-field v-model="line.promised_delivery_date" is-link readonly label="承诺交货日期" placeholder="选择" @click="openLineDatePicker(idx, 'promised_delivery_date')" />
          <van-field v-model="line.status" is-link readonly label="状态" placeholder="选择" @click="openStatusPicker(idx)" />
          <van-field v-model="line.shipping_status" is-link readonly label="发货状态" placeholder="选择" @click="openShippingStatusPicker(idx)" />
          <van-field v-model="line.production_status" is-link readonly label="生产状态" placeholder="选择" @click="openProductionStatusPicker(idx)" />
          <van-field v-model="line.return_status" is-link readonly label="退货状态" placeholder="选择" @click="openReturnStatusPicker(idx)" />
          <van-field v-model="line.customer_item_number" label="客户物料号" placeholder="输入后回车查询" @keypress.enter="handleCustomerItemLookup(idx)" />
          <van-field v-model="line.customer_item_description" label="客户物料描述" placeholder="自动填入" readonly />
          <van-field v-model="line.remark" label="备注" placeholder="请输入" />
        </van-cell-group>
      </div>

      <div v-if="!form.details.length" class="empty-detail">
        <van-empty description="暂无明细行，请点击添加" />
      </div>
    </van-form>

    <!-- 底部操作栏 -->
    <div class="bottom-bar">
      <van-button block type="default" @click="handleSaveDraft" :loading="saving">存草稿</van-button>
      <van-button block type="primary" @click="handleSubmit" :loading="submitting">提交审批</van-button>
    </div>

    <!-- 客户搜索选择 -->
    <van-popup v-model:show="showCustomerPicker" position="bottom" round style="height:70%">
      <div class="picker-popup">
        <van-search v-model="customerSearch" placeholder="搜索客户名称/编号" @search="searchCustomers" @update:model-value="searchCustomers" />
        <van-loading v-if="customerLoading" class="picker-loading" />
        <van-cell-group v-else>
          <van-cell v-for="c in customerOptions" :key="c.customer_number" :title="c.customer_name" :label="c.customer_number" is-link @click="selectCustomer(c)" />
        </van-cell-group>
      </div>
    </van-popup>

    <!-- 日期选择器 -->
    <van-popup v-model:show="showOrderDatePicker" position="bottom" round>
      <van-date-picker v-model="orderDateValue" title="订单日期" @confirm="onOrderDateConfirm" @cancel="showOrderDatePicker = false" />
    </van-popup>
    <van-popup v-model:show="showDeliveryDatePicker" position="bottom" round>
      <van-date-picker v-model="deliveryDateValue" title="交货日期" @confirm="onDeliveryDateConfirm" @cancel="showDeliveryDatePicker = false" />
    </van-popup>
    <van-popup v-model:show="showLineDatePicker" position="bottom" round>
      <van-date-picker v-model="lineDateValue" :title="lineDateTitle" @confirm="onLineDateConfirm" @cancel="showLineDatePicker = false" />
    </van-popup>

    <!-- 状态选择器 -->
    <van-popup v-model:show="showStatusPickerPopup" position="bottom" round>
      <van-picker :columns="statusOptions" @confirm="onStatusConfirm" @cancel="showStatusPickerPopup = false" />
    </van-popup>
    <van-popup v-model:show="showShippingStatusPickerPopup" position="bottom" round>
      <van-picker :columns="shippingStatusOptions" @confirm="onShippingStatusConfirm" @cancel="showShippingStatusPickerPopup = false" />
    </van-popup>
    <van-popup v-model:show="showProductionStatusPickerPopup" position="bottom" round>
      <van-picker :columns="productionStatusOptions" @confirm="onProductionStatusConfirm" @cancel="showProductionStatusPickerPopup = false" />
    </van-popup>
    <van-popup v-model:show="showReturnStatusPickerPopup" position="bottom" round>
      <van-picker :columns="returnStatusOptions" @confirm="onReturnStatusConfirm" @cancel="showReturnStatusPickerPopup = false" />
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showSuccessToast } from 'vant'
import dayjs from 'dayjs'
import * as api from '@/api/salesOrder'

const router = useRouter()

// ==================== Form ====================
const form = reactive({
  customer_number: '',
  customer_name: '',
  order_date: dayjs().format('YYYY-MM-DD'),
  delivery_date: '',
  customer_po_number: '',
  head_of_sales: '',
  head_of_sales_id: null as number | null,
  linkman: '',
  contacts: '',
  remark: '',
  details: [] as any[]
})

const saving = ref(false)
const submitting = ref(false)

// ==================== Customer Picker ====================
const showCustomerPicker = ref(false)
const customerSearch = ref('')
const customerOptions = ref<any[]>([])
const customerLoading = ref(false)
let customerSearchTimer: any = null

async function searchCustomers() {
  clearTimeout(customerSearchTimer)
  customerSearchTimer = setTimeout(async () => {
    if (!customerSearch.value) { customerOptions.value = []; return }
    customerLoading.value = true
    try {
      const res: any = await api.getCustomers({ search: customerSearch.value, limit: 20 })
      customerOptions.value = res.success ? (res.data?.items || res.data || []) : []
    } catch { customerOptions.value = [] }
    finally { customerLoading.value = false }
  }, 300)
}

function selectCustomer(c: any) {
  form.customer_number = c.customer_number
  form.customer_name = c.customer_name
  form.head_of_sales = c.head_of_sales || form.head_of_sales
  form.head_of_sales_id = c.head_of_sales_id || null
  form.linkman = c.linkman || form.linkman
  form.contacts = c.contacts || form.contacts
  // 客户税率带入明细行
  const customerTaxRate = c.sales_tax_rate
  if (customerTaxRate !== undefined && customerTaxRate !== null) {
    form.details.forEach((d: any) => {
      if (!d.tax_rate) d.tax_rate = customerTaxRate
    })
  }
  showCustomerPicker.value = false
}

// ==================== Item Inline Search ====================
const showItemDropdown = ref(false)
const lineItemOptions = ref<any[]>([])
const itemLoading = ref(false)
const activeItemLine = ref(-1)
let itemSearchTimer: any = null

function onItemFocus(idx: number) {
  activeItemLine.value = idx
  const line = form.details[idx]
  if (line._itemSearch && line._itemSearch.length > 0) {
    doItemSearch(idx, line._itemSearch)
  }
}

function onItemBlur() {
  setTimeout(async () => {
    showItemDropdown.value = false
    // blur 时自动匹配：如果搜索文本与某条结果完全匹配，自动选中
    const idx = activeItemLine.value
    if (idx < 0 || idx >= form.details.length) return
    const line = form.details[idx]
    const search = (line._itemSearch || '').trim()
    if (!search) return
    // 已选中过且文本未变，跳过
    if (line.item_number && line._itemSearch === line.item_number) return
    // 从当前下拉结果中精确匹配
    const exactMatch = lineItemOptions.value.find((it: any) => it.item_number === search)
    if (exactMatch) {
      await selectItem(exactMatch, idx)
      return
    }
    // 无精确匹配：如果搜索结果只有1条，自动选中（便捷）
    if (lineItemOptions.value.length === 1) {
      await selectItem(lineItemOptions.value[0], idx)
      return
    }
    // 允许手工录入：将输入内容作为 item_number 保留
    line.item_number = search
  }, 250)
}

function onItemSearch(idx: number, val: string) {
  const line = form.details[idx]
  line._itemSearch = val
  if (line.item_number && val !== line.item_number) {
    line.item_number = ''
    line.item_name = ''
    line.specifications = ''
    line.basic_unit = ''
    line.product_drawing_number = ''
  }
  activeItemLine.value = idx
  doItemSearch(idx, val)
}

function doItemSearch(idx: number, keyword: string) {
  clearTimeout(itemSearchTimer)
  if (!keyword || keyword.length === 0) {
    lineItemOptions.value = []
    showItemDropdown.value = false
    return
  }
  itemSearchTimer = setTimeout(async () => {
    itemLoading.value = true
    showItemDropdown.value = true
    try {
      const res: any = await api.getItems({ search: keyword, limit: 20 })
      lineItemOptions.value = res.success ? (res.data?.items || res.data || []) : []
      // 唯一结果时自动选中，无需用户手动点下拉
      if (lineItemOptions.value.length === 1) {
        const only = lineItemOptions.value[0]
        if (only.item_number === keyword || only.item_name === keyword) {
          await selectItem(only, idx)
          return
        }
      }
      if (lineItemOptions.value.length === 0) showItemDropdown.value = false
    } catch { lineItemOptions.value = []; showItemDropdown.value = false }
    finally { itemLoading.value = false }
  }, 300)
}

async function selectItem(it: any, idx: number) {
  const line = form.details[idx]
  line.item_number = it.item_number
  line.item_name = it.item_name
  line._itemSearch = it.item_number
  line.specifications = it.specifications || ''
  line.basic_unit = it.basic_unit || ''
  line.product_drawing_number = it.product_drawing_number || ''
  showItemDropdown.value = false
  lineItemOptions.value = []

  // 自动查询客户物料对照信息
  if (form.customer_number && it.item_number) {
    try {
      const cmRes: any = await api.getCustomerMaterialMappings({ customer_number: form.customer_number, item_number: it.item_number, approval_status: '已审核', limit: 1 })
      if (cmRes.success && cmRes.data?.items?.length > 0) {
        const cm = cmRes.data.items[0]
        line.customer_item_number = cm.customer_item_number || ''
        line.customer_item_description = cm.customer_item_description || ''
      } else {
        line.customer_item_number = ''
        line.customer_item_description = ''
      }
    } catch {
      line.customer_item_number = ''
      line.customer_item_description = ''
    }

    // 自动查询销售价目表价格（按客户+物料）
    try {
      const priceRes: any = await api.getSalesPriceForOrder({ customer_number: form.customer_number, item_number: it.item_number })
      if (priceRes.success && priceRes.data) {
        line.unit_price = priceRes.data.unit_price || 0
        line.tax_rate = priceRes.data.tax_rate || 0
        calcLineAmount(idx)
      } else {
        line.unit_price = 0
        line.tax_rate = 0
        calcLineAmount(idx)
      }
    } catch {
      line.unit_price = 0
      line.tax_rate = 0
      calcLineAmount(idx)
    }
  }
}

// 反向查询：客户物料号 → 产品信息
async function handleCustomerItemLookup(idx: number) {
  const line = form.details[idx]
  if (!line.customer_item_number || !form.customer_number) return
  try {
    const res: any = await api.reverseLookupProduct({ customer_number: form.customer_number, customer_item_number: line.customer_item_number })
    if (res.success && res.data) {
      const p = res.data
      line.item_number = p.item_number || ''
      line.item_name = p.item_name || ''
      line._itemSearch = p.item_number || ''
      line.specifications = p.specifications || ''
      line.basic_unit = p.basic_unit || ''
      line.product_drawing_number = p.product_drawing_number || ''
      line.customer_item_description = p.customer_item_description || ''
    }
  } catch {}
}

// ==================== Date Pickers ====================
const showOrderDatePicker = ref(false)
const showDeliveryDatePicker = ref(false)
const showLineDatePicker = ref(false)
const lineDateTitle = ref('交货日期')
const lineDateField = ref<'delivery_date' | 'promised_delivery_date'>('delivery_date')

const orderDateValue = ref<string[]>(dayjs().format('YYYY-MM-DD').split('-'))
const deliveryDateValue = ref<string[]>(dayjs().format('YYYY-MM-DD').split('-'))
const lineDateValue = ref<string[]>(dayjs().format('YYYY-MM-DD').split('-'))

function onOrderDateConfirm({ selectedValues }: any) {
  form.order_date = selectedValues.join('-')
  showOrderDatePicker.value = false
}
function onDeliveryDateConfirm({ selectedValues }: any) {
  form.delivery_date = selectedValues.join('-')
  showDeliveryDatePicker.value = false
}
function openLineDatePicker(idx: number, field: 'delivery_date' | 'promised_delivery_date') {
  activeItemLine.value = idx
  lineDateField.value = field
  lineDateTitle.value = field === 'delivery_date' ? '交货日期' : '承诺交货日期'
  const d = form.details[idx]?.[field] || form.delivery_date || dayjs().format('YYYY-MM-DD')
  lineDateValue.value = d.split('-')
  showLineDatePicker.value = true
}
function onLineDateConfirm({ selectedValues }: any) {
  const idx = activeItemLine.value
  if (idx >= 0 && idx < form.details.length) {
    form.details[idx][lineDateField.value] = selectedValues.join('-')
  }
  showLineDatePicker.value = false
}

// ==================== Status Pickers ====================
const statusOptions = [{ text: '未开始' }, { text: '进行中' }, { text: '已完成' }, { text: '已作废' }]
const shippingStatusOptions = [{ text: '未申请' }, { text: '未发货' }, { text: '部分发货' }, { text: '全部发货' }, { text: '超额发货' }]
const productionStatusOptions = [{ text: '未加入计划' }, { text: '待排产' }, { text: '计划中' }, { text: '待生产' }, { text: '生产中' }, { text: '生产完成' }]
const returnStatusOptions = [{ text: '未申请' }, { text: '未退货' }, { text: '部分退货' }, { text: '全部退货' }]

const showStatusPickerPopup = ref(false)
const showShippingStatusPickerPopup = ref(false)
const showProductionStatusPickerPopup = ref(false)
const showReturnStatusPickerPopup = ref(false)

function openStatusPicker(idx: number) { activeItemLine.value = idx; showStatusPickerPopup.value = true }
function openShippingStatusPicker(idx: number) { activeItemLine.value = idx; showShippingStatusPickerPopup.value = true }
function openProductionStatusPicker(idx: number) { activeItemLine.value = idx; showProductionStatusPickerPopup.value = true }
function openReturnStatusPicker(idx: number) { activeItemLine.value = idx; showReturnStatusPickerPopup.value = true }

function onStatusConfirm({ selectedOptions }: any) {
  const idx = activeItemLine.value
  if (idx >= 0 && idx < form.details.length) form.details[idx].status = selectedOptions[0]?.text
  showStatusPickerPopup.value = false
}
function onShippingStatusConfirm({ selectedOptions }: any) {
  const idx = activeItemLine.value
  if (idx >= 0 && idx < form.details.length) form.details[idx].shipping_status = selectedOptions[0]?.text
  showShippingStatusPickerPopup.value = false
}
function onProductionStatusConfirm({ selectedOptions }: any) {
  const idx = activeItemLine.value
  if (idx >= 0 && idx < form.details.length) form.details[idx].production_status = selectedOptions[0]?.text
  showProductionStatusPickerPopup.value = false
}
function onReturnStatusConfirm({ selectedOptions }: any) {
  const idx = activeItemLine.value
  if (idx >= 0 && idx < form.details.length) form.details[idx].return_status = selectedOptions[0]?.text
  showReturnStatusPickerPopup.value = false
}

// ==================== Detail Lines ====================
function addDetailLine() {
  let defaultTaxRate = 13
  if (form.customer_number) {
    const found = customerOptions.value.find((c: any) => c.customer_number === form.customer_number)
    if (found?.sales_tax_rate) defaultTaxRate = found.sales_tax_rate
  }
  form.details.push({
    item_number: '',
    item_name: '',
    _itemSearch: '',
    specifications: '',
    basic_unit: '',
    product_drawing_number: '',
    order_quantity: 0,
    unit_price: 0,
    tax_rate: defaultTaxRate,
    total_amount: 0,
    delivery_date: form.delivery_date || '',
    promised_delivery_date: '',
    remark: '',
    status: '未开始',
    shipping_status: '未申请',
    production_status: '未加入计划',
    return_status: '未申请',
    customer_item_number: '',
    customer_item_description: ''
  })
}

function removeDetailLine(idx: number) {
  form.details.splice(idx, 1)
}

function calcLineAmount(idx: number) {
  const line = form.details[idx]
  if (!line) return
  const qty = Number(line.order_quantity) || 0
  const price = Number(line.unit_price) || 0
  line.total_amount = Math.round(qty * price * 100) / 100
}

// 格式化金额显示2位小数
function formatAmt(val: any): string {
  const n = Number(val)
  return isNaN(n) ? '0.00' : n.toFixed(2)
}

// 含税单价失焦时格式化为2位小数
function formatPrice(idx: number, field: 'unit_price') {
  const line = form.details[idx]
  if (!line) return
  const n = Number(line[field])
  if (!isNaN(n)) line[field] = Math.round(n * 100) / 100
}

// ==================== Submit ====================
async function handleSaveDraft() {
  if (!form.customer_number) { showToast('请先选择客户'); return }
  saving.value = true
  try {
    const payload = buildPayload()
    const res: any = await api.createSalesOrder(payload)
    if (res.success) {
      showSuccessToast('草稿已保存')
      router.back()
    } else {
      showToast(res.message || '保存失败')
    }
  } catch { showToast('保存失败') }
  finally { saving.value = false }
}

async function handleSubmit() {
  if (!form.customer_number) { showToast('请先选择客户'); return }
  if (!form.details.length) { showToast('请添加至少一行明细'); return }
  submitting.value = true
  try {
    const payload = buildPayload()
    const res: any = await api.createSalesOrder(payload)
    if (res.success) {
      const orderNumber = res.data?.sales_order_number
      const approveRes: any = await api.submitForApproval(orderNumber)
      if (approveRes.success) {
        showSuccessToast('提交审批成功')
      } else {
        showSuccessToast('订单已创建，提交审批失败')
      }
      router.back()
    } else {
      showToast(res.message || '创建失败')
    }
  } catch { showToast('操作失败') }
  finally { submitting.value = false }
}

function buildPayload() {
  return {
    customer_number: form.customer_number,
    customer_name: form.customer_name,
    order_date: form.order_date || null,
    delivery_date: form.delivery_date || null,
    customer_po_number: form.customer_po_number,
    head_of_sales: form.head_of_sales,
    head_of_sales_id: form.head_of_sales_id,
    linkman: form.linkman,
    contacts: form.contacts,
    remark: form.remark,
    details: form.details.map((d: any, i: number) => ({
      line_number: (i + 1) * 10,
      item_number: d.item_number,
      item_name: d.item_name,
      specifications: d.specifications,
      basic_unit: d.basic_unit,
      product_drawing_number: d.product_drawing_number,
      order_quantity: Number(d.order_quantity) || 0,
      unit_price: Number(d.unit_price) || 0,
      tax_rate: Number(d.tax_rate) || 0,
      total_amount: Number(d.total_amount) || 0,
      delivery_date: d.delivery_date || null,
      promised_delivery_date: d.promised_delivery_date || null,
      remark: d.remark,
      status: d.status || '未开始',
      shipping_status: d.shipping_status || '未申请',
      production_status: d.production_status || '未加入计划',
      return_status: d.return_status || '未申请',
      customer_item_number: d.customer_item_number || '',
      customer_item_description: d.customer_item_description || ''
    }))
  }
}
</script>

<style scoped>
.order-create { background: #f5f5f5; min-height: 100vh; padding-bottom: 80px; }
.order-form { padding: 0 0 16px; }
.section-title {
  font-size: 14px; font-weight: 600; color: #333;
  padding: 12px 16px 8px; margin: 0;
}
.detail-card {
  margin: 0 12px 12px; background: #fff; border-radius: 8px; overflow: visible;
}
.detail-card__header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 16px; background: #f7f8fa; font-size: 13px; font-weight: 600;
}
.empty-detail { padding: 20px 0; }
.bottom-bar {
  position: fixed; bottom: 0; left: 0; right: 0;
  display: flex; gap: 8px; padding: 8px 16px;
  background: #fff; box-shadow: 0 -2px 8px rgba(0,0,0,.08);
  z-index: 100;
}
.bottom-bar .van-button { flex: 1; }
.picker-popup { padding: 16px 0; height: 100%; display: flex; flex-direction: column; }
.picker-loading { margin: 40px auto; }

/* 物料行内搜索下拉 */
.item-field-wrap { position: relative; }
.item-dropdown {
  position: absolute; left: 0; right: 0; top: 100%; z-index: 200;
  background: #fff; border: 1px solid #e8e8e8; border-radius: 0 0 8px 8px;
  max-height: 240px; overflow-y: auto; box-shadow: 0 4px 12px rgba(0,0,0,.12);
}
.item-dropdown__loading { padding: 12px; display: flex; justify-content: center; }
.item-dropdown__option {
  padding: 8px 16px; cursor: pointer; border-bottom: 1px solid #f5f5f5;
}
.item-dropdown__option:active { background: #f2f3f5; }
.item-dropdown__name { font-size: 14px; color: #333; }
.item-dropdown__sub { font-size: 12px; color: #999; margin-top: 2px; }
</style>
