<template>
  <div class="order-detail">
    <van-nav-bar :title="'订单 ' + orderId" left-arrow @click-left="router.back()" />

    <van-loading v-if="loading" class="page-loading" />

    <template v-else-if="header">
      <!-- 订单头 -->
      <div class="section-title">基本信息</div>
      <van-cell-group inset>
        <van-cell title="订单编号" :value="header.sales_order_number" />
        <van-cell title="客户名称" :value="header.customer_name" />
        <van-cell title="订单日期" :value="formatDate(header.order_date)" />
        <van-cell title="交货日期" :value="formatDate(header.delivery_date)" />
        <van-cell title="客户PO号" :value="header.customer_po_number || '-'" />
        <van-cell title="销售负责人" :value="header.head_of_sales || '-'" />
        <van-cell title="联系人" :value="header.linkman || '-'" />
        <van-cell title="联系方式" :value="header.contacts || '-'" />
        <van-cell title="审批状态">
          <template #value>
            <van-tag :type="approvalStatusType(header.approval_status)">{{ header.approval_status }}</van-tag>
          </template>
        </van-cell>
        <van-cell title="订单状态" :value="header.order_status || '-'" />
        <van-cell title="备注" :value="header.remark || '-'" />
      </van-cell-group>

      <!-- 订单明细 -->
      <div class="section-title">订单明细 ({{ details.length }}行)</div>
      <div v-for="(line, idx) in details" :key="idx" class="detail-card">
        <div class="detail-card__header">
          <span>行 {{ idx + 1 }} — {{ line.item_name || line.item_number }}</span>
          <van-tag plain :type="detailStatusType(line.status)">{{ line.status }}</van-tag>
        </div>
        <van-cell-group inset>
          <van-cell title="产品编号" :value="line.item_number" />
          <van-cell title="产品名称" :value="line.item_name || '-'" />
          <van-cell title="规格" :value="line.specifications || '-'" />
          <van-cell title="单位" :value="line.basic_unit || '-'" />
          <van-cell title="产品图号" :value="line.product_drawing_number || '-'" />
          <van-cell title="订单数量" :value="line.order_quantity" />
          <van-cell title="含税单价" :value="line.unit_price" />
          <van-cell title="税率(%)" :value="line.tax_rate" />
          <van-cell title="金额">
            <template #value>
              <span style="color:#1677ff;font-weight:600">{{ line.total_amount || '0.00' }}</span>
            </template>
          </van-cell>
          <van-cell title="交货日期" :value="formatDate(line.delivery_date)" />
          <van-cell title="承诺交货日期" :value="formatDate(line.promised_delivery_date)" />
          <van-cell title="发货状态">
            <template #value>
              <van-tag plain :type="shippingStatusType(line.shipping_status)">{{ line.shipping_status || '-' }}</van-tag>
            </template>
          </van-cell>
          <van-cell title="生产状态">
            <template #value>
              <van-tag plain :type="productionStatusType(line.production_status)">{{ line.production_status || '-' }}</van-tag>
            </template>
          </van-cell>
          <van-cell title="退货状态" :value="line.return_status || '-'" />
          <van-cell title="开票状态" :value="line.invoice_status || '未开票'" />
          <van-cell title="客户物料号" :value="line.customer_item_number || '-'" />
          <van-cell title="客户物料描述" :value="line.customer_item_description || '-'" />
          <van-cell v-if="line.remark" title="备注" :value="line.remark" />
        </van-cell-group>
      </div>

      <van-empty v-if="!details.length" description="暂无明细" />

      <!-- 操作按钮 -->
      <div class="action-bar" v-if="showActions">
        <template v-if="header.approval_status === '草稿'">
          <van-button block type="primary" @click="handleSubmitApproval" :loading="acting">提交审批</van-button>
          <van-button block type="default" @click="handleEdit">编辑</van-button>
          <van-button block type="danger" plain @click="handleDelete" :loading="acting">删除</van-button>
        </template>
        <template v-else-if="header.approval_status === '待审批'">
          <van-button block type="default" @click="handleWithdraw" :loading="acting">撤回</van-button>
        </template>
        <template v-else-if="header.approval_status === '已审批'">
          <van-button block type="default" @click="handleReverse" :loading="acting">反审</van-button>
        </template>
      </div>
    </template>

    <van-empty v-else description="订单不存在" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { showToast, showSuccessToast, showConfirmDialog } from 'vant'
import * as api from '@/api/salesOrder'

const router = useRouter()
const route = useRoute()
const orderId = route.params.id as string

const loading = ref(true)
const header = ref<any>(null)
const details = ref<any[]>([])
const acting = ref(false)

const showActions = computed(() => {
  const s = header.value?.approval_status
  return s === '草稿' || s === '待审批' || s === '已审批'
})

function approvalStatusType(status: string): 'default' | 'success' | 'warning' | 'danger' | 'primary' {
  const map: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'primary'> = { '草稿': 'default', '待审批': 'warning', '已审批': 'success', '已撤回': 'danger' }
  return map[status] || 'default'
}

function detailStatusType(status: string): 'default' | 'success' | 'warning' | 'danger' | 'primary' {
  const map: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'primary'> = { '未开始': 'default', '进行中': 'primary', '已完成': 'success', '已作废': 'danger' }
  return map[status] || 'default'
}

function shippingStatusType(status: string): 'default' | 'success' | 'warning' | 'danger' | 'primary' {
  const map: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'primary'> = { '未申请': 'default', '未发货': 'default', '部分发货': 'warning', '全部发货': 'success', '超额发货': 'danger' }
  return map[status] || 'default'
}

function productionStatusType(status: string): 'default' | 'success' | 'warning' | 'danger' | 'primary' {
  const map: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'primary'> = { '未加入计划': 'default', '待排产': 'default', '计划中': 'primary', '待生产': 'warning', '生产中': 'primary', '生产完成': 'success' }
  return map[status] || 'default'
}

function formatDate(d: string | null | undefined) {
  if (!d) return '-'
  return d.length > 10 ? d.substring(0, 10) : d
}

async function fetchDetail() {
  loading.value = true
  try {
    const res: any = await api.getSalesOrderDetail(orderId)
    if (res.success) {
      header.value = res.data.header
      details.value = res.data.details || []
    }
  } catch { showToast('获取详情失败') }
  finally { loading.value = false }
}

async function handleSubmitApproval() {
  acting.value = true
  try {
    const res: any = await api.submitForApproval(orderId)
    if (res.success) {
      showSuccessToast('已提交审批')
      fetchDetail()
    } else {
      showToast(res.message || '提交失败')
    }
  } catch { showToast('提交失败') }
  finally { acting.value = false }
}

async function handleWithdraw() {
  try {
    await showConfirmDialog({ title: '确认撤回', message: '确定要撤回该订单的审批申请吗？' })
  } catch { return }
  acting.value = true
  try {
    const res: any = await api.withdrawOrder(orderId)
    if (res.success) {
      showSuccessToast('已撤回')
      fetchDetail()
    } else {
      showToast(res.message || '撤回失败')
    }
  } catch { showToast('撤回失败') }
  finally { acting.value = false }
}

async function handleReverse() {
  try {
    await showConfirmDialog({ title: '确认反审', message: '反审后订单将退回草稿状态，确定继续吗？' })
  } catch { return }
  acting.value = true
  try {
    const res: any = await api.reverseOrder(orderId)
    if (res.success) {
      showSuccessToast('已反审')
      fetchDetail()
    } else {
      showToast(res.message || '反审失败')
    }
  } catch { showToast('反审失败') }
  finally { acting.value = false }
}

function handleEdit() {
  router.push(`/order-create?edit=${orderId}`)
}

async function handleDelete() {
  try {
    await showConfirmDialog({ title: '确认删除', message: '删除后不可恢复，确定继续吗？' })
  } catch { return }
  acting.value = true
  try {
    const res: any = await api.deleteSalesOrder(orderId)
    if (res.success) {
      showSuccessToast('已删除')
      router.back()
    } else {
      showToast(res.message || '删除失败')
    }
  } catch { showToast('删除失败') }
  finally { acting.value = false }
}

onMounted(fetchDetail)
</script>

<style scoped>
.order-detail { background: #f5f5f5; min-height: 100vh; padding-bottom: 24px; }
.page-loading { margin: 60px auto; }
.section-title {
  font-size: 14px; font-weight: 600; color: #333;
  padding: 12px 16px 8px; margin: 0;
}
.detail-card {
  margin: 0 12px 12px; background: #fff; border-radius: 8px; overflow: hidden;
}
.detail-card__header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 16px; background: #f7f8fa; font-size: 13px; font-weight: 600;
}
.action-bar {
  display: flex; gap: 8px; padding: 16px;
}
.action-bar .van-button { flex: 1; }
</style>
