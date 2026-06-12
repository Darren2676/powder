<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import {
  getLabelTemplateDetail,
  createLabelTemplate,
  updateLabelTemplate,
  getLabelTemplatePresetFields,
} from '@/api/master-data/labelTemplate'
import { getFactories } from '@/api/system/factory'

const props = defineProps<{
  open: boolean
  editingId: number | null
}>()

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  (e: 'ok'): void
}>()

const showModal = computed({
  get: () => props.open,
  set: (val) => emit('update:open', val),
})

const loading = ref(false)
const saving = ref(false)
const factories = ref<any[]>([])

// 表单数据
const form = ref<any>({
  template_name: '',
  template_code: '',
  description: '',
  paper_width: 100,
  paper_height: 80,
  qr_format: '{item_number}|{batch_number}|{production_date}|{box_number}|{net_weight}',
  qr_size: 20,
  qr_position: 'bottom-right',
  is_active: '是',
  factory_id: null,
  fields: [] as any[],
})

// 预置字段
const presetFields = ref<any[]>([])
const showPresetDrawer = ref(false)

// 加载预置字段
const loadPresetFields = async () => {
  try {
    const res: any = await getLabelTemplatePresetFields()
    presetFields.value = res.data?.data || res.data || []
  } catch { /* ignore */ }
}

// 加载工厂
const loadFactories = async () => {
  try {
    const res: any = await getFactories()
    factories.value = res.data?.data?.items || res.data?.items || []
  } catch { /* ignore */ }
}

// 加载详情
const loadDetail = async (id: number) => {
  loading.value = true
  try {
    const res: any = await getLabelTemplateDetail(id)
    const data = res.data?.data || res.data
    if (data) {
      form.value = {
        template_name: data.template_name || '',
        template_code: data.template_code || '',
        description: data.description || '',
        paper_width: data.paper_width || 100,
        paper_height: data.paper_height || 80,
        qr_format: data.qr_format || '',
        qr_size: data.qr_size || 20,
        qr_position: data.qr_position || 'bottom-right',
        is_active: data.is_active || '是',
        factory_id: data.factory_id || null,
        fields: (data.fields || []).map((f: any) => ({
          field_key: f.field_key,
          field_label: f.field_label,
          field_type: f.field_type,
          data_source: f.data_source || '',
          display_order: f.display_order || 0,
          visible: f.visible || '是',
          is_in_qr: f.is_in_qr || '否',
          font_size: f.font_size || 9,
          col_span: f.col_span || 1,
          default_value: f.default_value || '',
        })),
      }
    }
  } catch { /* ignore */ }
  loading.value = false
}

// 重置表单
const resetForm = () => {
  form.value = {
    template_name: '',
    template_code: '',
    description: '',
    paper_width: 100,
    paper_height: 80,
    qr_format: '{item_number}|{batch_number}|{production_date}|{box_number}|{net_weight}',
    qr_size: 20,
    qr_position: 'bottom-right',
    is_active: '是',
    factory_id: null,
    fields: [],
  }
}

// 监听弹窗打开
watch(() => props.open, (val) => {
  if (val) {
    loadFactories()
    loadPresetFields()
    if (props.editingId) {
      loadDetail(props.editingId)
    } else {
      resetForm()
    }
  }
})

// 字段操作
const addField = (type: 'system' | 'custom') => {
  if (type === 'custom') {
    form.value.fields.push({
      field_key: `custom_${form.value.fields.filter((f: any) => f.field_type === 'custom').length + 1}`,
      field_label: '',
      field_type: 'custom',
      data_source: '',
      display_order: form.value.fields.length + 1,
      visible: '是',
      is_in_qr: '否',
      font_size: 9,
      col_span: 1,
      default_value: '',
    })
  }
}

const addPresetField = (preset: any) => {
  // 检查是否已存在
  if (form.value.fields.some((f: any) => f.field_key === preset.field_key)) {
    message.warning(`字段「${preset.field_label}」已存在`)
    return
  }
  form.value.fields.push({
    field_key: preset.field_key,
    field_label: preset.field_label,
    field_type: preset.field_type || 'system',
    data_source: preset.data_source || '',
    display_order: form.value.fields.length + 1,
    visible: preset.visible || '是',
    is_in_qr: preset.is_in_qr || '否',
    font_size: preset.font_size || 9,
    col_span: preset.col_span || 1,
    default_value: '',
  })
}

const addAllPresetFields = () => {
  for (const p of presetFields.value) {
    if (!form.value.fields.some((f: any) => f.field_key === p.field_key)) {
      addPresetField(p)
    }
  }
  message.success('已添加所有预置字段')
}

const removeField = (index: number) => {
  form.value.fields.splice(index, 1)
}

// 保存
const handleOk = async () => {
  if (!form.value.template_name) { message.warning('请输入模板名称'); return }
  if (!form.value.template_code) { message.warning('请输入模板编码'); return }

  saving.value = true
  try {
    if (props.editingId) {
      await updateLabelTemplate(props.editingId, form.value)
      message.success('更新成功')
    } else {
      await createLabelTemplate(form.value)
      message.success('创建成功')
    }
    emit('ok')
    showModal.value = false
  } catch (e: any) {
    message.error(e?.response?.data?.message || '操作失败')
  }
  saving.value = false
}

const fieldColumns = [
  { title: '字段标识', dataIndex: 'field_key', key: 'field_key', width: 120 },
  { title: '显示名称', dataIndex: 'field_label', key: 'field_label', width: 120 },
  { title: '类型', dataIndex: 'field_type', key: 'field_type', width: 80 },
  { title: '显示', dataIndex: 'visible', key: 'visible', width: 70 },
  { title: '纳入QR', dataIndex: 'is_in_qr', key: 'is_in_qr', width: 70 },
  { title: '占列数', dataIndex: 'col_span', key: 'col_span', width: 70 },
  { title: '默认值', dataIndex: 'default_value', key: 'default_value', width: 120 },
  { title: '操作', key: 'action', width: 60 },
]
</script>

<template>
  <a-modal
    v-model:open="showModal"
    :title="editingId ? '编辑标签模板' : '新增标签模板'"
    width="900px"
    :confirm-loading="saving"
    @ok="handleOk"
    :mask-closable="false"
  >
    <a-spin :spinning="loading">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="模板名称" required>
              <a-input v-model:value="form.template_name" placeholder="如：标准成品标签" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="模板编码" required>
              <a-input v-model:value="form.template_code" placeholder="如：STANDARD_PRODUCT_LABEL" :disabled="!!editingId" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="状态">
              <a-select v-model:value="form.is_active">
                <a-select-option value="是">启用</a-select-option>
                <a-select-option value="否">停用</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="纸张宽度(mm)">
              <a-input-number v-model:value="form.paper_width" :min="40" :max="300" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="纸张高度(mm)">
              <a-input-number v-model:value="form.paper_height" :min="30" :max="200" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="工厂">
              <a-select v-model:value="form.factory_id" allow-clear placeholder="不限">
                <a-select-option v-for="f in factories" :key="f.id" :value="f.id">{{ f.factory_name }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-row :gutter="16">
          <a-col :span="16">
            <a-form-item label="QR码格式">
              <a-input v-model:value="form.qr_format" placeholder="如：{item_number}|{batch_number}|{production_date}|{box_number}|{net_weight}" />
            </a-form-item>
          </a-col>
          <a-col :span="4">
            <a-form-item label="QR尺寸(mm)">
              <a-input-number v-model:value="form.qr_size" :min="10" :max="50" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="4">
            <a-form-item label="QR位置">
              <a-select v-model:value="form.qr_position">
                <a-select-option value="top-right">右上</a-select-option>
                <a-select-option value="bottom-right">右下</a-select-option>
                <a-select-option value="bottom-center">底部居中</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item label="描述">
          <a-textarea v-model:value="form.description" :rows="2" />
        </a-form-item>

        <!-- 字段配置 -->
        <a-divider>字段配置</a-divider>
        <div style="margin-bottom:8px;display:flex;gap:8px;">
          <a-button size="small" @click="addAllPresetFields"><PlusOutlined />添加全部预置字段</a-button>
          <a-button size="small" @click="addField('custom')"><PlusOutlined />添加自定义字段</a-button>
          <a-button size="small" @click="showPresetDrawer = true">选择预置字段...</a-button>
        </div>
        <a-table
          :columns="fieldColumns"
          :data-source="form.fields"
          :pagination="false"
          :scroll="{ y: 300 }"
          size="small"
          bordered
          row-key="field_key"
        >
          <template #bodyCell="{ column, record, index }">
            <template v-if="column.key === 'field_label'">
              <a-input v-model:value="record.field_label" size="small" />
            </template>
            <template v-if="column.key === 'visible'">
              <a-select v-model:value="record.visible" size="small" style="width:60px">
                <a-select-option value="是">是</a-select-option>
                <a-select-option value="否">否</a-select-option>
              </a-select>
            </template>
            <template v-if="column.key === 'is_in_qr'">
              <a-select v-model:value="record.is_in_qr" size="small" style="width:60px">
                <a-select-option value="是">是</a-select-option>
                <a-select-option value="否">否</a-select-option>
              </a-select>
            </template>
            <template v-if="column.key === 'col_span'">
              <a-select v-model:value="record.col_span" size="small" style="width:60px">
                <a-select-option :value="1">半行</a-select-option>
                <a-select-option :value="2">整行</a-select-option>
              </a-select>
            </template>
            <template v-if="column.key === 'default_value'">
              <a-input v-model:value="record.default_value" size="small" />
            </template>
            <template v-if="column.key === 'action'">
              <a @click="removeField(index)" style="color:#ff4d4f"><DeleteOutlined /></a>
            </template>
          </template>
        </a-table>

        <!-- QR格式预览 -->
        <a-divider>QR内容预览</a-divider>
        <a-typography-text type="secondary">{{ form.qr_format }}</a-typography-text>
      </a-form>
    </a-spin>

    <!-- 预置字段选择抽屉 -->
    <a-drawer v-model:visible="showPresetDrawer" title="选择预置字段" :width="400">
      <a-list size="small" :data-source="presetFields">
        <template #renderItem="{ item }">
          <a-list-item>
            <a-list-item-meta>
              <template #title>{{ item.field_label }}</template>
              <template #description>{{ item.field_key }} | 数据源: {{ item.data_source }}</template>
            </a-list-item-meta>
            <template #actions>
              <a-button size="small" @click="addPresetField(item)" :disabled="form.fields.some((f: any) => f.field_key === item.field_key)">添加</a-button>
            </template>
          </a-list-item>
        </template>
      </a-list>
    </a-drawer>
  </a-modal>
</template>
