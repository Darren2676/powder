<template>
  <div class="page-container">
    <van-nav-bar
      :title="'按工序备料'"
      left-arrow
      @click-left="router.back()"
      fixed
      placeholder
    />

    <!-- 加载中 -->
    <div v-if="pageLoading" style="padding: 40px 0;">
      <van-loading type="spinner" vertical>加载中...</van-loading>
    </div>

    <template v-else>
      <!-- 无备料单 -->
      <div v-if="!statusData?.has_preparation" class="card" style="margin: 16px; padding: 20px; text-align: center;">
        <div v-if="statusData?.order">
          <div class="order-brief">
            <div class="order-brief__number">{{ orderNo }}</div>
            <div class="order-brief__product">{{ statusData.order.item_name }} {{ statusData.order.specifications || '' }}</div>
            <div class="order-brief__qty">计划数量: {{ formatNum(statusData.order.planned_quantity) }}</div>
          </div>
        </div>
        <p style="color: var(--text-secondary); margin: 16px 0;">该生产单暂无按工序备料单</p>
        <van-button type="primary" :loading="generating" @click="handleGenerate">生成按工序备料单</van-button>
      </div>

      <!-- 有备料单 -->
      <template v-if="statusData?.has_preparation">
        <!-- 生产单信息 -->
        <div class="card info-card">
          <div class="info-card__header">
            <span class="info-card__number">{{ orderNo }}</span>
            <span :class="['status-tag', prepStatusClass]">{{ statusData.preparation_status }}</span>
          </div>
          <div class="info-card__grid">
            <div class="info-row">
              <span class="info-row__label">产品</span>
              <span class="info-row__value">{{ statusData.order.item_name || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-row__label">规格</span>
              <span class="info-row__value">{{ statusData.order.specifications || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-row__label">计划数量</span>
              <span class="info-row__value num-highlight">{{ formatNum(statusData.order.planned_quantity) }}</span>
            </div>
            <div class="info-row">
              <span class="info-row__label">备料进度</span>
              <span class="info-row__value num-highlight">{{ completedStepCount }}/{{ totalStepCount }}</span>
            </div>
          </div>
        </div>

        <!-- 工序步骤条 -->
        <div class="steps-wrapper">
          <van-steps :active="activeStepIndex" finish-icon="success" active-icon="circle" @click-step="onClickStep">
            <van-step v-for="(step, idx) in statusData.steps" :key="step.step_number">
              <template #default>
                <div class="step-label" @click="onClickStep(idx)">
                  <span class="step-label__name">{{ step.standard_process_name || '工序' + step.step_number }}</span>
                  <span v-if="!step.has_materials" class="step-label__tag step-label__tag--skip">无物料</span>
                  <span v-else-if="step.is_fully_issued" class="step-label__tag step-label__tag--done">已备料</span>
                  <span v-else class="step-label__tag step-label__tag--pending">{{ step.issued_count }}/{{ step.material_count }}</span>
                </div>
              </template>
            </van-step>
          </van-steps>
        </div>

        <!-- 当前工序区域 -->
        <div v-if="currentStep" class="current-step-section">
          <div class="section-title">
            <span>工序{{ currentStep.step_number }}: {{ currentStep.standard_process_name || '' }}</span>
            <span class="section-title__wc">{{ currentStep.work_center_name || '' }}</span>
          </div>

          <!-- 无物料工序 -->
          <div v-if="!currentStep.has_materials" class="card no-material-card">
            <div class="no-material-card__icon">📋</div>
            <div class="no-material-card__text">该工序无需备料，可直接报工</div>
            <van-button
              v-if="currentStep.process_task_number"
              size="small"
              type="primary"
              plain
              round
              @click="goReport(currentStep.process_task_number)"
            >前往报工</van-button>
          </div>

          <!-- 有物料工序 -->
          <template v-else>
            <div class="material-list">
              <div
                v-for="item in currentMaterials"
                :key="item.id"
                class="material-item card"
              >
                <div class="material-item__info">
                  <div class="material-item__header">
                    <span class="material-item__name">{{ item.material_name || item.material_number }}</span>
                    <span v-if="item.is_key_material" class="key-badge">关键</span>
                    <span v-if="isFullyIssued(item)" class="done-badge">&#10003;</span>
                  </div>
                  <div class="material-item__number">{{ item.material_number }}</div>
                  <div class="material-item__progress">
                    <van-progress
                      :percentage="getIssuePercent(item)"
                      :stroke-width="6"
                      :color="isFullyIssued(item) ? 'var(--success, #07c160)' : 'var(--primary, #1989fa)'"
                      :show-pivot="false"
                      style="flex:1;"
                    />
                    <span class="progress-text">{{ formatNum(item.issued_quantity) }}/{{ formatNum(item.required_quantity) }}</span>
                  </div>
                  <div class="material-item__qty">
                    <span>需求: <b>{{ formatNum(item.required_quantity) }}</b>{{ item.unit }}</span>
                    <span>已领: <b :style="{ color: isFullyIssued(item) ? 'var(--success)' : 'var(--warning)' }">{{ formatNum(item.issued_quantity) }}</b>{{ item.unit }}</span>
                    <span>未领: <b :style="{ color: item.remaining_quantity > 0 ? 'var(--danger, #ee0a24)' : 'var(--success)' }">{{ formatNum(item.remaining_quantity) }}</b>{{ item.unit }}</span>
                  </div>
                  <div class="material-item__extra">
                    <span v-if="item.default_warehouse">仓库: {{ item.default_warehouse }}</span>
                    <span v-if="item.material_type">类型: {{ item.material_type }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 底部操作栏 -->
            <div class="bottom-action" v-if="currentMaterials.length > 0 && !currentStep.is_fully_issued">
              <van-button
                type="primary"
                block
                round
                @click="openIssuePopup"
              >备料</van-button>
            </div>

            <!-- 当前工序已备料完成 -->
            <div v-if="currentStep.is_fully_issued" class="card done-card">
              <span class="done-card__icon">&#10003;</span>
              <span>该工序物料已全部领取</span>
              <van-button
                v-if="currentStep.process_task_number"
                size="mini"
                type="primary"
                plain
                round
                @click="goReport(currentStep.process_task_number)"
              >前往报工</van-button>
            </div>
          </template>
        </div>

        <!-- 全部完成 -->
        <div v-if="allCompleted" class="card complete-card">
          <div class="complete-card__icon">&#127881;</div>
          <div class="complete-card__text">所有工序备料已完成</div>
          <div class="complete-card__actions">
            <van-button size="small" plain round @click="router.back()">返回</van-button>
            <van-button size="small" type="primary" round @click="goFirstTask">去报工</van-button>
          </div>
        </div>
      </template>
    </template>

    <!-- 领料弹出层 -->
    <van-popup
      v-model:show="issuePopupVisible"
      position="bottom"
      round
      :style="{ height: '85%' }"
      closeable
      :close-on-click-overlay="false"
    >
      <div class="issue-popup">
        <div class="issue-popup__header">
          <div class="issue-popup__title">
            工序{{ currentStep?.step_number }}备料 - {{ currentStep?.standard_process_name || '' }}
          </div>
        </div>

        <div class="issue-popup__body">
          <div
            v-for="(item, idx) in issueItems"
            :key="item._uid"
            class="issue-row card"
          >
            <!-- 物料信息 -->
            <div class="issue-row__info">
              <div class="issue-row__head">
                <span class="issue-row__name">{{ item.material_name || item.material_number }}</span>
                <span v-if="item.is_key_material" class="key-badge">关键</span>
                <span v-if="item.is_added" class="batch-badge">批次行</span>
              </div>
              <div class="issue-row__number">{{ item.material_number }} | {{ item.unit }}</div>
              <div v-if="!item.is_added" class="issue-row__qty">
                <span>需求: {{ formatNum(item.required_quantity) }}</span>
                <span>已领: {{ formatNum(item.issued_quantity) }}</span>
                <span style="color: var(--danger, #ee0a24);">未领: {{ formatNum(item.remaining_quantity) }}</span>
              </div>
            </div>

            <!-- 输入区域 -->
            <div class="issue-row__inputs">
              <van-field
                v-model="item.input_actual_quantity"
                type="number"
                label="实际数量"
                placeholder="输入数量"
                input-align="right"
                class="issue-field"
              />
              <van-field
                v-model="item.input_batch_number"
                label="批次号"
                placeholder="输入批次号"
                input-align="right"
                class="issue-field"
              />
            </div>

            <!-- 操作按钮 -->
            <div class="issue-row__actions">
              <van-button size="mini" icon="plus" plain round @click="addBatchRow(idx)" />
              <van-button v-if="item.is_added" size="mini" icon="minus" plain round type="danger" @click="removeBatchRow(idx)" />
            </div>
          </div>

          <!-- 空状态 -->
          <div v-if="issueItems.length === 0" style="text-align:center; padding: 40px 0; color: var(--text-muted);">
            当前工序物料已全部领取
          </div>
        </div>

        <!-- 底部操作 -->
        <div class="issue-popup__footer">
          <van-field
            v-model="issueRemark"
            label="备注"
            placeholder="本次领料备注（选填）"
            class="remark-field"
          />
          <div class="issue-popup__buttons">
            <van-button size="small" plain round @click="fillRemaining">填充未领量</van-button>
            <van-button
              type="primary"
              size="small"
              round
              :loading="saving"
              :disabled="filledCount <= 0"
              @click="handleSaveIssue"
            >保存领料 ({{ filledCount }}项)</van-button>
          </div>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showDialog } from 'vant'
import {
  getProcessPrepStatus,
  generateByProcess,
  getPreparationDetailsGrouped,
  createMaterialIssue
} from '@/api/materialPreparation'

interface IssueItem {
  _uid: number
  is_added: boolean
  id: number
  material_number: string
  material_name: string
  material_type: string
  unit: string
  required_quantity: number
  issued_quantity: number
  remaining_quantity: number
  step_number: number | null
  work_center_name: string
  is_key_material: number
  default_warehouse: string
  input_actual_quantity: string
  input_batch_number: string
}

const route = useRoute()
const router = useRouter()
const orderNo = decodeURIComponent(route.params.orderNo as string)

const pageLoading = ref(true)
const generating = ref(false)
const saving = ref(false)
const viewStepIndex = ref(0)

const statusData = ref<any>(null)
const prepNumber = ref('')
const groupedData = ref<any>(null)
const materialGroups = ref<Record<number, any[]>>({})

// 领料弹出层状态
const issuePopupVisible = ref(false)
const issueItems = ref<IssueItem[]>([])
const issueRemark = ref('')
let uidSeq = 0

// 步骤条相关计算
const activeStepIndex = computed(() => {
  if (!statusData.value?.steps) return 0
  const steps = statusData.value.steps
  const idx = steps.findIndex((s: any) => !s.is_fully_issued && s.has_materials)
  return idx >= 0 ? idx : steps.length
})

const completedStepCount = computed(() => {
  if (!statusData.value?.steps) return 0
  return statusData.value.steps.filter((s: any) => s.is_fully_issued).length
})

const totalStepCount = computed(() => {
  return statusData.value?.steps?.length || 0
})

const currentStep = computed(() => {
  if (!statusData.value?.steps) return null
  return statusData.value.steps[viewStepIndex.value] || null
})

const currentMaterials = computed(() => {
  if (!currentStep.value) return []
  const stepNum = currentStep.value.step_number
  return materialGroups.value[stepNum] || []
})

const allCompleted = computed(() => {
  if (!statusData.value?.steps || statusData.value.steps.length === 0) return false
  return statusData.value.steps.every((s: any) => s.is_fully_issued)
})

const filledCount = computed(() => {
  return issueItems.value.filter(d => parseFloat(d.input_actual_quantity) > 0).length
})

const isFullyIssued = (item: any) => {
  const req = parseFloat(item.required_quantity) || 0
  const issued = parseFloat(item.issued_quantity) || 0
  return req > 0 && issued >= req
}

const getIssuePercent = (item: any) => {
  const req = parseFloat(item.required_quantity) || 0
  const issued = parseFloat(item.issued_quantity) || 0
  if (req <= 0) return 0
  return Math.min(Math.round((issued / req) * 100), 100)
}

const formatNum = (n: any) => {
  if (n == null) return '0'
  const num = parseFloat(n)
  return isNaN(num) ? '0' : Number(num.toFixed(4)).toString()
}

const prepStatusClass = computed(() => {
  const m: Record<string, string> = {
    '已领料': 'status-tag--success',
    '部分领料': 'status-tag--primary',
    '未领料': 'status-tag--default',
    '已关闭': 'status-tag--danger'
  }
  return m[statusData.value?.preparation_status] || 'status-tag--default'
})

const onClickStep = (idx: number) => {
  viewStepIndex.value = idx
}

// 加载状态数据
const loadStatus = async () => {
  try {
    const res: any = await getProcessPrepStatus(orderNo)
    if (res.success) {
      statusData.value = res.data
      if (res.data.has_preparation) {
        prepNumber.value = res.data.preparation_number
        await loadMaterialDetails()
      }
      viewStepIndex.value = activeStepIndex.value < (statusData.value.steps?.length || 0)
        ? activeStepIndex.value
        : 0
    } else {
      showToast({ message: res.message || '加载失败', type: 'fail' })
    }
  } catch (e) {
    console.error('Failed to load status:', e)
    showToast({ message: '加载失败', type: 'fail' })
  }
}

// 加载物料明细
const loadMaterialDetails = async () => {
  if (!prepNumber.value) return
  try {
    const res: any = await getPreparationDetailsGrouped(prepNumber.value)
    if (res.success) {
      groupedData.value = res.data
      const groups: Record<number, any[]> = {}
      if (res.data.groups) {
        for (const g of res.data.groups) {
          if (g.step_number != null) {
            groups[g.step_number] = (g.items || []).map((item: any) => {
              const req = parseFloat(item.required_quantity) || 0
              const issued = parseFloat(item.issued_quantity) || 0
              return {
                ...item,
                remaining_quantity: Math.max(Math.round((req - issued) * 10000) / 10000, 0)
              }
            })
          }
        }
      }
      materialGroups.value = groups
    }
  } catch (e) {
    console.error('Failed to load material details:', e)
  }
}

// 生成按工序备料单
const handleGenerate = async () => {
  generating.value = true
  try {
    const res: any = await generateByProcess([orderNo])
    if (res.success) {
      showToast({ message: '按工序备料单生成成功', type: 'success' })
      await loadStatus()
    } else {
      showToast({ message: res.message || '生成失败', type: 'fail' })
    }
  } catch (e: any) {
    const msg = e?.response?.data?.message || '生成失败'
    showToast({ message: msg, type: 'fail' })
  } finally {
    generating.value = false
  }
}

// 打开领料弹出层
const openIssuePopup = () => {
  const materials = currentMaterials.value.filter((d: any) => !isFullyIssued(d))
  if (materials.length === 0) {
    // 如果所有物料都领完了，也显示全部物料
    issueItems.value = currentMaterials.value.map((item: any) => ({
      _uid: ++uidSeq,
      is_added: false,
      id: item.id,
      material_number: item.material_number,
      material_name: item.material_name,
      material_type: item.material_type || '',
      unit: item.unit || '',
      required_quantity: parseFloat(item.required_quantity) || 0,
      issued_quantity: parseFloat(item.issued_quantity) || 0,
      remaining_quantity: item.remaining_quantity || 0,
      step_number: item.step_number ?? null,
      work_center_name: item.work_center_name || '',
      is_key_material: item.is_key_material || 0,
      default_warehouse: item.default_warehouse || '',
      input_actual_quantity: '',
      input_batch_number: ''
    }))
  } else {
    issueItems.value = materials.map((item: any) => ({
      _uid: ++uidSeq,
      is_added: false,
      id: item.id,
      material_number: item.material_number,
      material_name: item.material_name,
      material_type: item.material_type || '',
      unit: item.unit || '',
      required_quantity: parseFloat(item.required_quantity) || 0,
      issued_quantity: parseFloat(item.issued_quantity) || 0,
      remaining_quantity: item.remaining_quantity || 0,
      step_number: item.step_number ?? null,
      work_center_name: item.work_center_name || '',
      is_key_material: item.is_key_material || 0,
      default_warehouse: item.default_warehouse || '',
      input_actual_quantity: '',
      input_batch_number: ''
    }))
  }
  issueRemark.value = ''
  issuePopupVisible.value = true
}

// 新增批次行
const addBatchRow = (index: number) => {
  const source = issueItems.value[index]
  const newRow: IssueItem = {
    ...source,
    _uid: ++uidSeq,
    is_added: true,
    remaining_quantity: 0,
    input_actual_quantity: '',
    input_batch_number: ''
  }
  issueItems.value.splice(index + 1, 0, newRow)
}

// 删除批次行
const removeBatchRow = (index: number) => {
  issueItems.value.splice(index, 1)
}

// 一键填充未领量
const fillRemaining = () => {
  let count = 0
  for (const d of issueItems.value) {
    if (!d.is_added && d.remaining_quantity > 0) {
      d.input_actual_quantity = String(d.remaining_quantity)
      count++
    }
  }
  showToast({ message: `已填充 ${count} 项未领量`, type: 'success' })
}

// 保存领料
const handleSaveIssue = async () => {
  const validItems = issueItems.value.filter(d => parseFloat(d.input_actual_quantity) > 0)
  if (validItems.length === 0) {
    showToast({ message: '至少需要一行实际备料数量大于0', type: 'fail' })
    return
  }

  try {
    await showDialog({
      title: '确认领料',
      message: `确定要领取 ${validItems.length} 项物料吗？`,
      confirmButtonText: '确认领料'
    })
  } catch {
    return
  }

  saving.value = true
  try {
    const payload = {
      preparation_number: prepNumber.value,
      production_order_number: orderNo,
      remark: issueRemark.value,
      items: validItems.map(d => ({
        preparation_detail_id: d.id,
        material_number: d.material_number,
        material_name: d.material_name,
        material_type: d.material_type,
        unit: d.unit,
        required_quantity: d.required_quantity,
        actual_quantity: parseFloat(d.input_actual_quantity) || 0,
        batch_number: d.input_batch_number || '',
        step_number: d.step_number,
        work_center_name: d.work_center_name,
        is_key_material: d.is_key_material,
        default_warehouse: d.default_warehouse
      }))
    }

    const res: any = await createMaterialIssue(payload)
    const issueNumber = res?.data?.issue_number || ''
    showToast({ message: `领料成功${issueNumber ? '，单号: ' + issueNumber : ''}`, type: 'success' })
    issuePopupVisible.value = false

    // 重新加载状态和明细
    await loadStatus()
  } catch (e: any) {
    const msg = e?.response?.data?.message || '保存失败'
    showToast({ message: msg, type: 'fail' })
  } finally {
    saving.value = false
  }
}

const goReport = (taskNumber: string) => {
  router.push(`/report/${encodeURIComponent(taskNumber)}`)
}

const goFirstTask = () => {
  const firstTask = statusData.value?.steps?.find((s: any) => s.process_task_number)
  if (firstTask) {
    router.push(`/report/${encodeURIComponent(firstTask.process_task_number)}`)
  }
}

onMounted(async () => {
  pageLoading.value = true
  await loadStatus()
  pageLoading.value = false
})
</script>

<style scoped>
.page-container {
  padding-bottom: 80px;
  background: var(--bg-page);
  min-height: 100vh;
}

/* 生产单简要信息 */
.order-brief {
  text-align: center;
  margin-bottom: 8px;
}

.order-brief__number {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.order-brief__product {
  font-size: 14px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.order-brief__qty {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 2px;
}

/* 信息卡片 */
.info-card {
  margin: 12px 16px;
  padding: 14px 16px;
}

.info-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.info-card__number {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.info-card__grid {
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

/* 步骤条 */
.steps-wrapper {
  margin: 0 16px 12px;
  padding: 12px;
  background: var(--bg-card);
  border-radius: 8px;
  overflow-x: auto;
}

.steps-wrapper :deep(.van-steps) {
  padding: 0;
}

.step-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  min-width: 60px;
}

.step-label__name {
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
}

.step-label__tag {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  white-space: nowrap;
}

.step-label__tag--done {
  background: var(--success-light, #e8f5e9);
  color: var(--success);
}

.step-label__tag--pending {
  background: var(--warning-light, #fff3e0);
  color: var(--warning);
}

.step-label__tag--skip {
  background: #f5f5f5;
  color: var(--text-muted);
}

/* 当前工序区域 */
.current-step-section {
  padding: 0 16px;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  padding: 8px 0;
}

.section-title__wc {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-muted);
}

/* 无物料卡片 */
.no-material-card {
  padding: 24px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.no-material-card__icon {
  font-size: 28px;
}

.no-material-card__text {
  font-size: 14px;
  color: var(--text-secondary);
}

/* 物料列表 */
.material-list {
  padding: 0;
}

.material-item {
  padding: 12px;
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
  font-size: 10px;
  background: var(--warning-light, #fff3e0);
  color: var(--warning);
  padding: 1px 5px;
  border-radius: 3px;
}

.done-badge {
  font-size: 12px;
  color: var(--success, #07c160);
  font-weight: 700;
}

.batch-badge {
  font-size: 10px;
  background: #e6f7ff;
  color: #1890ff;
  padding: 1px 5px;
  border-radius: 3px;
}

.material-item__number {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.material-item__progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.progress-text {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}

.material-item__qty {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
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

/* 底部操作栏 */
.bottom-action {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 10px 16px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom));
  background: var(--bg-card);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06);
  z-index: 100;
}

/* 已完成卡片 */
.done-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  font-size: 14px;
  color: var(--success);
}

.done-card__icon {
  font-size: 18px;
  font-weight: 700;
}

/* 全部完成 */
.complete-card {
  margin: 16px;
  padding: 24px 16px;
  text-align: center;
}

.complete-card__icon {
  font-size: 40px;
  display: block;
  margin-bottom: 8px;
}

.complete-card__text {
  font-size: 16px;
  font-weight: 600;
  color: var(--success);
  margin-bottom: 16px;
}

.complete-card__actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}

/* ===== 领料弹出层 ===== */
.issue-popup {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.issue-popup__header {
  padding: 16px 16px 8px;
  flex-shrink: 0;
}

.issue-popup__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.issue-popup__body {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px;
  -webkit-overflow-scrolling: touch;
}

.issue-row {
  padding: 12px;
  margin-bottom: 8px;
}

.issue-row__info {
  margin-bottom: 8px;
}

.issue-row__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.issue-row__name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.issue-row__number {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.issue-row__qty {
  display: flex;
  gap: 10px;
  font-size: 12px;
  color: var(--text-secondary);
}

.issue-row__inputs {
  margin: 8px 0 4px;
}

.issue-field {
  padding: 4px 0;
}

.issue-field :deep(.van-field__label) {
  width: 70px;
  font-size: 13px;
}

.issue-field :deep(.van-field__control) {
  font-size: 14px;
}

.issue-row__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.issue-popup__footer {
  flex-shrink: 0;
  padding: 8px 16px;
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
  background: var(--bg-card);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06);
}

.remark-field {
  padding: 4px 0;
  margin-bottom: 8px;
}

.remark-field :deep(.van-field__label) {
  width: 40px;
  font-size: 13px;
}

.issue-popup__buttons {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
