<template>
  <div>
    <a-page-header title="单据自动完成配置" style="padding: 0; margin-bottom: 16px;" />

    <a-spin :spinning="loading">
      <a-row :gutter="16">
        <a-col :span="8" v-for="config in configs" :key="config.document_type">
          <a-card :bordered="false" size="small" :title="config.document_type_name" style="margin-bottom: 16px;">
            <template #extra>
              <a-switch
                :checked="config.enabled"
                checked-children="启用"
                un-checked-children="停用"
                @change="(checked: boolean) => handleToggle(config, checked)"
              />
            </template>

            <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 16 }" size="small">
              <a-form-item label="完成状态">
                <a-tag :color="config.completion_status === '已完成' ? 'green' : 'blue'">
                  {{ config.completion_status }}
                </a-tag>
              </a-form-item>
              <a-form-item label="容差百分比">
                <a-input-number
                  v-model:value="config.tolerance_pct"
                  :min="0"
                  :max="100"
                  :precision="1"
                  addon-after="%"
                  style="width: 100%"
                  @change="() => handleSave(config)"
                />
              </a-form-item>
              <a-form-item label="完成条件">
                <div v-for="(cond, idx) in parseConditions(config.conditions)" :key="idx" style="margin-bottom: 4px;">
                  <a-tag :color="cond.required ? 'orange' : 'default'" style="margin: 0;">
                    {{ cond.required ? '必须' : '可选' }}
                  </a-tag>
                  <span style="margin-left: 4px; font-size: 13px;">{{ cond.label }}</span>
                </div>
              </a-form-item>
            </a-form>

            <div style="margin-top: 8px; text-align: right;">
              <a-button type="link" size="small" @click="handleEditConditions(config)">编辑条件</a-button>
              <a-popconfirm title="确定重置为默认配置？" @confirm="handleReset(config)">
                <a-button type="link" size="small" danger>重置默认</a-button>
              </a-popconfirm>
            </div>
          </a-card>
        </a-col>
      </a-row>
    </a-spin>

    <!-- 条件编辑弹窗 -->
    <a-modal
      v-model:open="condModalVisible"
      :title="'编辑完成条件 - ' + (editingConfig?.document_type_name || '')"
      @ok="handleCondModalOk"
      :confirm-loading="condSaving"
      width="720px"
    >
      <a-table
        :columns="condColumns"
        :data-source="editingConditions"
        :pagination="false"
        row-key="field"
        size="small"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'label'">
            <a-input v-model:value="record.label" size="small" />
          </template>
          <template v-if="column.key === 'field'">
            <code style="font-size: 12px;">{{ record.field }}</code>
          </template>
          <template v-if="column.key === 'scope'">
            <a-tag :color="record.scope === 'header' ? 'blue' : 'green'" size="small">
              {{ record.scope === 'header' ? '表头' : '明细' }}
            </a-tag>
          </template>
          <template v-if="column.key === 'operator'">
            <a-select v-model:value="record.operator" size="small" style="width: 100%">
              <a-select-option value="equals">等于</a-select-option>
              <a-select-option value="in">属于</a-select-option>
              <a-select-option value="all_lines">所有行满足</a-select-option>
            </a-select>
          </template>
          <template v-if="column.key === 'value'">
            <a-select
              v-if="record.operator === 'in' || record.operator === 'all_lines'"
              v-model:value="record.value"
              mode="tags"
              size="small"
              style="width: 100%"
              placeholder="输入后回车添加"
            />
            <a-input v-else v-model:value="record.value" size="small" />
          </template>
          <template v-if="column.key === 'required'">
            <a-switch v-model:checked="record.required" size="small" />
          </template>
          <template v-if="column.key === 'action'">
            <a-button type="link" size="small" danger @click="editingConditions.splice(index, 1)">删除</a-button>
          </template>
        </template>
      </a-table>
      <div style="margin-top: 8px;">
        <a-button type="dashed" size="small" @click="addCondition">
          <PlusOutlined /> 添加条件
        </a-button>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import {
  getAllConfigs,
  updateConfig,
  resetConfig,
  type DocumentCompletionConfig,
  type CompletionCondition,
} from '@/api/system/documentCompletionConfig';

const loading = ref(false);
const configs = ref<DocumentCompletionConfig[]>([]);

const condModalVisible = ref(false);
const condSaving = ref(false);
const editingConfig = ref<DocumentCompletionConfig | null>(null);
const editingConditions = ref<CompletionCondition[]>([]);

const condColumns = [
  { title: '条件名称', key: 'label', width: 140 },
  { title: '字段', key: 'field', width: 120 },
  { title: '范围', key: 'scope', width: 70 },
  { title: '运算符', key: 'operator', width: 120 },
  { title: '值', key: 'value', width: 180 },
  { title: '必须', key: 'required', width: 60 },
  { title: '操作', key: 'action', width: 60 },
];

function parseConditions(jsonStr: string): CompletionCondition[] {
  try {
    return JSON.parse(jsonStr);
  } catch {
    return [];
  }
}

async function fetchConfigs() {
  loading.value = true;
  try {
    const res = await getAllConfigs();
    configs.value = (res as any).data || [];
  } finally {
    loading.value = false;
  }
}

async function handleToggle(config: DocumentCompletionConfig, checked: boolean) {
  config.enabled = checked;
  await updateConfig(config.document_type, { enabled: checked });
  message.success(checked ? '已启用' : '已停用');
}

async function handleSave(config: DocumentCompletionConfig) {
  await updateConfig(config.document_type, {
    tolerance_pct: config.tolerance_pct,
  });
  message.success('已保存');
}

async function handleReset(config: DocumentCompletionConfig) {
  await resetConfig(config.document_type);
  message.success('已重置为默认配置');
  await fetchConfigs();
}

function handleEditConditions(config: DocumentCompletionConfig) {
  editingConfig.value = config;
  editingConditions.value = parseConditions(config.conditions).map(c => ({ ...c }));
  condModalVisible.value = true;
}

function addCondition() {
  editingConditions.value.push({
    field: '',
    operator: 'equals',
    value: '',
    scope: 'header',
    required: true,
    label: '',
  });
}

async function handleCondModalOk() {
  if (!editingConfig.value) return;
  condSaving.value = true;
  try {
    await updateConfig(editingConfig.value.document_type, {
      conditions: JSON.stringify(editingConditions.value),
    });
    message.success('条件已保存');
    condModalVisible.value = false;
    await fetchConfigs();
  } finally {
    condSaving.value = false;
  }
}

onMounted(fetchConfigs);
</script>
