<template>
  <div class="page-container">
    <van-nav-bar
      title="备料操作"
      left-arrow
      @click-left="router.back()"
      fixed
      placeholder
    />

    <div v-if="loading" style="padding: 40px 0;">
      <van-loading type="spinner" vertical>加载中...</van-loading>
    </div>

    <template v-else>
      <!-- 未找到备料单，显示生成入口 -->
      <div v-if="!prepData && fromOrder" class="card" style="padding: 20px; text-align: center;">
        <p style="color: var(--text-secondary); margin-bottom: 16px;">该生产单暂无备料单</p>
        <van-button type="primary" :loading="generating" @click="handleGenerate">从生产单生成备料单</van-button>
      </div>

      <template v-if="prepData">
        <!-- 备料单信息 -->
        <div class="card prep-info">
          <div class="prep-info__header">
            <span class="prep-info__number">{{ prepData.preparation_number }}</span>
            <span :class="['status-tag', prepStatusClass(prepData.preparation_status)]">{{ prepData.preparation_status }}</span>
          </div>
          <div class="prep-info__grid">
            <div class="info-row">
              <span class="info-row__label">生产单</span>
              <span class="info-row__value">{{ prepData.production_order_number }}</span>
            </div>
            <div class="info-row">
              <span class="info-row__label">产品</span>
              <span class="info-row__value">{{ prepData.item_name || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-row__label">BOM版本</span>
              <span class="info-row__value">{{ prepData.bom_version || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-row__label">物料种类</span>
              <span class="info-row__value num-highlight">{{ prepData.total_material_types || 0 }}</span>
            </div>
          </div>
        </div>

        <!-- Tab切换 -->
        <van-tabs v-model:active="activeTab" shrink sticky offset-top="46">
          <van-tab :title="`全部 ${details.length}`" name="all" />
          <van-tab :title="`未领 ${pendingCount}`" name="pending" />
          <van-tab :title="`已领 ${issuedCount}`" name="issued" />
        </van-tabs>

        <!-- 物料明细按工序分组 -->
        <div class="material-list">
          <template v-for="(group, idx) in filteredGroups" :key="idx">
            <div class="group-header">
              <span class="group-header__icon">{{ group.step || '通用' }}</span>
              <span class="group-header__name">{{ group.name || '通用物料' }}</span>
              <span class="group-header__count">{{ group.items.length }}项</span>
            </div>
            <div v-for="item in group.items" :key="item.id" class="material-item card">
              <div class="material-item__check" @click="toggleSelect(item)">
                <van-checkbox v-model="item._selected" :disabled="isFullyIssued(item)" />
              </div>
              <div class="material-item__info">
                <div class="material-item__header">
                  <span class="material-item__name">{{ item.material_name || item.material_number }}</span>
                  <span v-if="item.is_key_material" class="key-badge">🔑关键</span>
                </div>
                <div class="material-item__number">{{ item.material_number }}</div>
                <div class="material-item__qty">
                  <span>需求: <b>{{ formatNum(item.required_quantity) }}</b>{{ item.unit }}</span>
                  <span>已领: <b :style="{ color: isFullyIssued(item) ? 'var(--success)' : 'var(--warning)' }">{{ formatNum(item.issued_quantity) }}</b>{{ item.unit }}</span>
                </div>
                <div class="material-item__extra">
                  <span v-if="item.default_warehouse">仓库: {{ item.default_warehouse }}</span>
                  <span v-if="item.material_type">类型: {{ item.material_type }}</span>
                </div>
              </div>
            </div>
          </template>

          <div v-if="filteredDetails.length === 0" class="empty-state" style="padding: 30px;">
            <div class="empty-state__text">暂无物料明细</div>
          </div>
        </div>

        <!-- 底部操作栏 -->
        <div class="bottom-action" v-if="details.length > 0">
          <div class="bottom-action__info">
            已选 <b class="num-highlight">{{ selectedCount }}</b> 项
          </div>
          <van-button
            type="primary"
            size="small"
            :disabled="selectedCount === 0"
            :loading="confirming"
            @click="handleConfirmIssue"
          >
            确认领料
          </van-button>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showDialog } from 'vant'
import { getMaterialPreparations, getPreparationDetails, updatePreparationDetails, generateFromOrder } from '@/api/materialPreparation'

const route = useRoute()
const router = useRouter()
const paramId = decodeURIComponent(route.params.id as string)
const fromOrder = route.query.from === 'order'

const loading = ref(true)
const generating = ref(false)
const confirming = ref(false)
const activeTab = ref('all')

const prepData = ref<any>(null)
const details = ref<any[]>([])

const pendingCount = computed(() => details.value.filter(d => !isFullyIssued(d)).length)
const issuedCount = computed(() => details.value.filter(d => isFullyIssued(d)).length)
const selectedCount = computed(() => details.value.filter(d => d._selected).length)

const isFullyIssued = (item: any) => {
  const req = parseFloat(item.required_quantity) || 0
  const issued = parseFloat(item.issued_quantity) || 0
  return req > 0 && issued >= req
}

const filteredDetails = computed(() => {
  if (activeTab.value === 'pending') return details.value.filter(d => !isFullyIssued(d))
  if (activeTab.value === 'issued') return details.value.filter(d => isFullyIssued(d))
  return details.value
})

const filteredGroups = computed(() => {
  const items = filteredDetails.value
  const groupMap = new Map<number | string, { step: string; name: string; items: any[] }>()
  items.forEach(item => {
    const key = item.step_number || 'general'
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        step: item.step_number ? `工序${item.step_number}` : '',
        name: item.work_center_name || (item.step_number ? `工序${item.step_number}` : '通用物料'),
        items: []
      })
    }
    groupMap.get(key)!.items.push(item)
  })
  return Array.from(groupMap.values())
})

const prepStatusClass = (s: string) => {
  const m: Record<string, string> = { '已领料': 'status-tag--success', '部分领料': 'status-tag--primary', '未领料': 'status-tag--default', '已关闭': 'status-tag--danger' }
  return m[s] || 'status-tag--default'
}

const formatNum = (n: any) => {
  if (n == null) return '0'
  const num = parseFloat(n)
  return isNaN(num) ? '0' : Number(num.toFixed(4)).toString()
}

const toggleSelect = (item: any) => {
  if (!isFullyIssued(item)) {
    item._selected = !item._selected
  }
}

const loadData = async () => {
  loading.value = true
  try {
    // 判断参数是备料单编号还是生产单编号
    if (paramId.startsWith('MP-') || paramId.startsWith('mp-')) {
      // 直接用备料单编号
      await loadPrepDetails(paramId)
    } else {
      // 按生产单搜索备料单
      const res: any = await getMaterialPreparations({ search: paramId, limit: 1 })
      if (res.success) {
        const items = res.data?.items || res.data || []
        const found = items.find((p: any) => p.production_order_number === paramId)
        if (found) {
          prepData.value = found
          await loadPrepDetails(found.preparation_number)
        }
      }
    }
  } catch (e) {
    console.error('Failed to load material data:', e)
  } finally {
    loading.value = false
  }
}

const loadPrepDetails = async (prepNumber: string) => {
  try {
    // 先加载主表（如果没有的话）
    if (!prepData.value) {
      const listRes: any = await getMaterialPreparations({ search: prepNumber, limit: 1 })
      if (listRes.success) {
        const items = listRes.data?.items || listRes.data || []
        prepData.value = items.find((p: any) => p.preparation_number === prepNumber) || items[0]
      }
    }
    // 加载明细
    const detailRes: any = await getPreparationDetails(prepNumber)
    if (detailRes.success) {
      details.value = (detailRes.data || []).map((d: any) => ({ ...d, _selected: false }))
    }
  } catch (e) {
    console.error('Failed to load details:', e)
  }
}

const handleGenerate = async () => {
  generating.value = true
  try {
    const res: any = await generateFromOrder([paramId])
    if (res.success) {
      showToast({ message: '备料单生成成功', type: 'success' })
      await loadData()
    } else {
      showToast({ message: res.message || '生成失败', type: 'fail' })
    }
  } catch (e: any) {
    console.error('Generate error:', e)
  } finally {
    generating.value = false
  }
}

const handleConfirmIssue = async () => {
  const selectedItems = details.value.filter(d => d._selected)
  if (selectedItems.length === 0) return

  try {
    await showDialog({
      title: '确认领料',
      message: `确定要领取选中的 ${selectedItems.length} 种物料吗？`,
      confirmButtonText: '确认领料'
    })
  } catch {
    return
  }

  confirming.value = true
  try {
    // 将已选物料标记为已领取（issued_quantity = required_quantity）
    const updatedDetails = selectedItems.map(item => ({
      id: item.id,
      issued_quantity: parseFloat(item.required_quantity) || 0
    }))

    const res: any = await updatePreparationDetails(prepData.value.preparation_number, updatedDetails)
    if (res.success) {
      showToast({ message: '领料确认成功', type: 'success' })
      await loadPrepDetails(prepData.value.preparation_number)
    } else {
      showToast({ message: res.message || '操作失败', type: 'fail' })
    }
  } catch (e) {
    console.error('Confirm issue error:', e)
  } finally {
    confirming.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.page-container {
  padding-bottom: 80px;
}

.prep-info {
  margin: 12px 16px;
  padding: 16px;
}

.prep-info__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.prep-info__number {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.prep-info__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
}

.info-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info-row__label {
  font-size: 12px;
  color: var(--text-muted);
}

.info-row__value {
  font-size: 13px;
  color: var(--text-primary);
}

.material-list {
  padding: 8px 16px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0 6px;
}

.group-header__icon {
  font-size: 12px;
  background: var(--primary-light);
  color: var(--primary);
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}

.group-header__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.group-header__count {
  font-size: 12px;
  color: var(--text-muted);
}

.material-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
}

.material-item__check {
  padding-top: 2px;
  flex-shrink: 0;
}

.material-item__info {
  flex: 1;
  min-width: 0;
}

.material-item__header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.material-item__name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.key-badge {
  font-size: 11px;
  background: var(--warning-light);
  color: var(--warning);
  padding: 1px 6px;
  border-radius: 3px;
}

.material-item__number {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.material-item__qty {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: var(--text-secondary);
}

.material-item__qty b {
  font-weight: 600;
}

.material-item__extra {
  display: flex;
  gap: 12px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-muted);
}

.bottom-action {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom));
  background: var(--bg-card);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06);
}

.bottom-action__info {
  font-size: 14px;
  color: var(--text-secondary);
}
</style>
