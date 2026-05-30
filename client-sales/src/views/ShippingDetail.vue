<template>
  <div class="shipping-detail">
    <van-nav-bar :title="'发货单 ' + (header.shipping_order_number || '')" left-arrow @click-left="router.back()" />

    <van-loading v-if="loading" class="page-loading" />

    <template v-else-if="header.shipping_order_number">
      <!-- 头部信息 -->
      <div class="detail-section">
        <div class="detail-section__title">基本信息</div>
        <van-cell-group inset>
          <van-cell title="发货单号" :value="header.shipping_order_number" />
          <van-cell title="状态">
            <template #value>
              <van-tag :type="statusType(header.status)">{{ header.status }}</van-tag>
            </template>
          </van-cell>
          <van-cell title="客户" :value="header.customer_name || '-'" />
          <van-cell title="联系人" :value="header.linkman || '-'" />
          <van-cell title="联系电话" :value="header.contacts || '-'" />
          <van-cell title="收货地址" :value="header.shipping_address || '-'" />
          <van-cell title="承运商" :value="header.carrier || '-'" />
          <van-cell title="物流单号" :value="header.tracking_number || '-'" />
          <van-cell title="创建日期" :value="fmtDate(header.creation_date)" />
          <van-cell title="发货日期" :value="fmtDate(header.shipping_date)" />
          <van-cell title="备注" :value="header.remark || '-'" />
        </van-cell-group>
      </div>

      <!-- 发货明细 -->
      <div class="detail-section">
        <div class="detail-section__title">发货明细 ({{ details.length }}行)</div>
        <div v-for="(d, idx) in details" :key="idx" class="detail-line">
          <van-cell-group inset>
            <van-cell title="物料编号" :value="d.item_number" />
            <van-cell title="物料名称" :value="d.item_name || '-'" />
            <van-cell title="规格" :value="d.specifications || '-'" />
            <van-cell title="单位" :value="d.basic_unit || '-'" />
            <van-cell title="发货数量" :value="d.quantity ?? '-'" />
            <van-cell title="销售订单号" :value="d.sales_order_number || '-'" />
            <van-cell title="订单行号" :value="d.line_number ?? '-'" />
          </van-cell-group>
        </div>
        <van-empty v-if="!details.length" description="无明细" />
      </div>
    </template>

    <van-empty v-else description="未找到发货单信息" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getShippingOrderDetail } from '@/api/salesOrder'

const router = useRouter()
const route = useRoute()

const loading = ref(true)
const header = ref<any>({})
const details = ref<any[]>([])

function statusType(status: string): 'default' | 'success' | 'warning' | 'danger' | 'primary' {
  const map: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'primary'> = {
    '待发货': 'warning', '已发货': 'primary', '已签收': 'success', '已取消': 'danger'
  }
  return map[status] || 'default'
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '-'
  return d.slice(0, 10)
}

async function fetchData() {
  const id = route.params.id as string
  if (!id) return
  loading.value = true
  try {
    const res: any = await getShippingOrderDetail(id)
    if (res.success && res.data) {
      header.value = res.data.header || {}
      details.value = res.data.details || []
    }
  } finally {
    loading.value = false
  }
}

onMounted(fetchData)
</script>

<style scoped>
.shipping-detail { background: #f5f5f5; min-height: 100vh; padding-bottom: 16px; }
.page-loading { display: flex; justify-content: center; padding: 60px 0; }
.detail-section { margin-top: 12px; }
.detail-section__title {
  font-size: 14px; font-weight: 600; color: #333;
  padding: 12px 16px 8px;
}
.detail-line { margin-bottom: 8px; }
</style>
