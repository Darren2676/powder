<template>
  <a-modal
    ref="modalRef"
    v-model:open="visible"
    :width="800"
    :footer="null"
    :mask-closable="false"
    :style="modalStyle"
    :modal-class="'manual-close-modal'"
    @cancel="handleClose"
  >
    <template #title>
      <div class="drag-handle" @mousedown="onDragStart">批量关闭单据</div>
    </template>
    <!-- Step 1: 异常检测结果 -->
    <template v-if="step === 1">
      <a-tabs v-model:activeKey="activeTab" size="small" style="margin-bottom: 12px;">
        <a-tab-pane v-for="tab in tabs" :key="tab.key">
          <template #tab>
            <span>{{ tab.label }} <a-badge :count="tab.data.length" :number-style="{ backgroundColor: tab.color }" /></span>
          </template>
          <a-alert v-if="tab.data.length === 0" type="info" :message="'无' + tab.label + '记录'" style="margin-bottom: 12px;" />
          <a-table
            v-else
            :columns="detectColumns"
            :data-source="tab.data"
            :pagination="false"
            row-key="recordId"
            size="small"
            :row-class-name="(record: any) => record.eligible ? '' : 'row-disabled'"
            :row-selection="rowSelection"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'recordId'">
                <span :style="{ color: record.eligible ? undefined : '#999' }">{{ record.recordId }}</span>
              </template>
              <template v-if="column.key === 'eligible'">
                <a-tag v-if="record.category === 'manual_close_ok'" color="green">可以手动批量关闭</a-tag>
                <a-tag v-else-if="record.category === 'need_material_return'" color="orange">退料处理</a-tag>
                <a-tag v-else-if="record.category === 'need_scrap'" color="orange">在制品报废处理</a-tag>
                <a-tag v-else-if="record.eligible" color="green">可关闭</a-tag>
                <a-tag v-else color="red">不可关闭</a-tag>
              </template>
              <template v-if="column.key === 'exceptions'">
                <a-tag v-for="ex in record.exceptions" :key="ex.code" color="orange" style="margin: 2px;">
                  {{ ex.label }}: {{ ex.description }}
                </a-tag>
                <span v-if="!record.eligible" style="color: #ff4d4f; font-size: 12px;">{{ record.ineligibleReason }}</span>
              </template>
              <template v-if="column.key === 'cascade'">
                <span v-for="c in record.cascadePreview" :key="c.downstreamType" style="font-size: 12px;">
                  {{ c.downstreamType }}: {{ c.count }}条 &nbsp;
                </span>
                <span v-if="!record.cascadePreview?.length" style="color: #999;">无</span>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <a-button @click="handleExport" :disabled="detectResults.length === 0">导出Excel</a-button>
        <div>
          <a-button @click="handleClose">取消</a-button>
          <a-button type="primary" danger :disabled="eligibleCount === 0" @click="step = 2" style="margin-left: 8px;">下一步</a-button>
        </div>
      </div>
    </template>

    <!-- Step 2: 原因与备注 -->
    <template v-if="step === 2">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }" style="margin-top: 16px;">
        <a-form-item label="关闭原因" required>
          <a-select v-model:value="closeReason" placeholder="请选择关闭原因" style="width: 100%;">
            <a-select-option v-for="r in reasonOptions" :key="r.code" :value="r.code">
              {{ r.label }}（{{ r.desc }}）
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="关闭备注">
          <a-textarea v-model:value="closeRemark" :rows="3" placeholder="请填写关闭备注说明" />
        </a-form-item>
        <a-form-item label="影响范围">
          <a-alert type="info" :message="`即将提交 ${eligibleCount} 条单据的关闭申请，关闭操作需主管审批后生效。`" />
        </a-form-item>
      </a-form>
      <div style="text-align: right;">
        <a-button @click="step = 1">上一步</a-button>
        <a-button type="primary" danger :disabled="!closeReason" :loading="submitting" @click="handleSubmit" style="margin-left: 8px;">提交关闭申请</a-button>
      </div>
    </template>

    <!-- Step 3: 结果 -->
    <template v-if="step === 3">
      <a-result
        :status="submitResult?.failed?.length ? 'warning' : 'success'"
        :title="submitResult?.failed?.length ? '部分提交失败' : '提交成功'"
        :sub-title="`成功 ${submitResult?.succeeded?.length || 0} 条，失败 ${submitResult?.failed?.length || 0} 条`"
      >
        <template #extra>
          <div v-if="submitResult?.failed?.length" style="text-align: left; margin-bottom: 16px;">
            <p v-for="f in submitResult.failed.slice(0, 5)" :key="f.recordId" style="color: #ff4d4f; font-size: 13px;">
              {{ f.recordId }}: {{ f.message }}
            </p>
          </div>
          <a-button type="primary" @click="handleClose">关闭</a-button>
        </template>
      </a-result>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { message } from 'ant-design-vue';
import { detectExceptions, submitManualClose, getCloseReasons } from '@/api/system/manualClose';
import { useModalDrag } from '@/composables/useModalDrag';

// ==================== 拖拽逻辑 ====================
const { modalStyle, onDragStart, resetDrag } = useModalDrag();

const props = defineProps<{
  module: string;
  recordIds: string[];
}>();

const emit = defineEmits<{
  (e: 'success'): void;
}>();

const visible = ref(false);
const step = ref(1);
const detectResults = ref<any[]>([]);
const reasonOptions = ref<any[]>([]);
const closeReason = ref('');
const closeRemark = ref('');
const submitting = ref(false);
const submitResult = ref<any>(null);

const detectColumns = [
  { title: '单据编号', key: 'recordId', width: 160 },
  { title: '状态', key: 'eligible', width: 140 },
  { title: '异常分类', key: 'exceptions' },
  { title: '级联影响', key: 'cascade', width: 180 },
];

const eligibleCount = computed(() => selectedRowKeys.value.filter(key =>
  detectResults.value.some(r => r.recordId === key && r.eligible)
).length);

const tabCloseable = computed(() => detectResults.value.filter(r => r.eligible));
const tabMaterialReturn = computed(() => detectResults.value.filter(r => r.category === 'need_material_return'));
const tabScrap = computed(() => detectResults.value.filter(r => r.category === 'need_scrap'));
const tabIneligible = computed(() => detectResults.value.filter(r => !r.eligible && r.category !== 'need_material_return' && r.category !== 'need_scrap'));

const selectedRowKeys = ref<string[]>([]);
const activeTab = ref('closeable');

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys; },
  getCheckboxProps: (record: any) => ({ disabled: !record.eligible }),
}));
const tabs = computed(() => [
  { key: 'closeable', label: '可以手动批量关闭', data: tabCloseable.value, color: '#52c41a' },
  { key: 'material_return', label: '退料处理', data: tabMaterialReturn.value, color: '#faad14' },
  { key: 'scrap', label: '在制品报废处理', data: tabScrap.value, color: '#faad14' },
  { key: 'ineligible', label: '不可关闭', data: tabIneligible.value, color: '#ff4d4f' },
]);

async function open() {
  visible.value = true;
  step.value = 1;
  closeReason.value = '';
  closeRemark.value = '';
  submitResult.value = null;
  selectedRowKeys.value = [];
  activeTab.value = 'closeable';
  resetDrag();

  // 检测异常
  try {
    const res = await detectExceptions(props.module, props.recordIds);
    detectResults.value = (res as any).data || [];
  } catch {
    message.error('异常检测失败');
    detectResults.value = [];
  }

  // 获取关闭原因选项
  try {
    const res = await getCloseReasons(props.module);
    reasonOptions.value = (res as any).data || [];
  } catch {
    reasonOptions.value = [];
  }
}

async function handleSubmit() {
  if (!closeReason.value) {
    message.warning('请选择关闭原因');
    return;
  }
  const eligibleIds = selectedRowKeys.value.filter(key =>
      detectResults.value.some(r => r.recordId === key && r.eligible)
    );
  submitting.value = true;
  try {
    const res = await submitManualClose(props.module, eligibleIds, closeReason.value, closeRemark.value);
    submitResult.value = (res as any).data;
    step.value = 3;
    emit('success');
  } catch {
    message.error('提交失败');
  } finally {
    submitting.value = false;
  }
}

function handleClose() {
  visible.value = false;
}

function getCategoryLabel(record: any): string {
  if (record.category === 'manual_close_ok' || record.eligible) return '可以手动批量关闭';
  if (record.category === 'need_material_return') return '退料处理';
  if (record.category === 'need_scrap') return '在制品报废处理';
  return '不可关闭';
}

function getExceptionText(record: any): string {
  const parts = (record.exceptions || []).map((ex: any) => `${ex.label}:${ex.description}`);
  if (!record.eligible) parts.push(record.ineligibleReason || '');
  return parts.join('; ');
}

function getCascadeText(record: any): string {
  if (!record.cascadePreview?.length) return '无';
  return record.cascadePreview.map((c: any) => `${c.downstreamType}:${c.count}条`).join('; ');
}

function handleExport() {
  const rows = detectResults.value;
  if (rows.length === 0) { message.warning('无数据可导出'); return; }

  const headers = ['分类', '单据编号', '状态', '异常分类', '级联影响'];
  const csvRows = [headers.join(',')];

  for (const r of rows) {
    const row = [
      getCategoryLabel(r),
      r.recordId || '',
      getExceptionText(r),
      getCascadeText(r),
    ];
    csvRows.push(row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','));
  }

  const bom = '\uFEFF';
  const blob = new Blob([bom + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `批量关闭检测报告_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
  message.success('导出成功');
}

defineExpose({ open });
</script>

<style scoped>
:deep(.row-disabled) {
  background-color: #fafafa;
  opacity: 0.6;
}
.drag-handle {
  cursor: move;
  user-select: none;
}
</style>
