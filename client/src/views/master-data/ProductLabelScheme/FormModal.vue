<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import {
  getProductLabelSchemeDetail,
  createProductLabelScheme,
  updateProductLabelScheme,
  getLabelTemplates,
} from '@/api/master-data/labelTemplate'
import { getCustomers } from '@/api/master-data/customer'
import { getItems } from '@/api/master-data/itemMaster'
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
const templates = ref<any[]>([])
const customers = ref<any[]>([])
const items = ref<any[]>([])
const factories = ref<any[]>([])

// 表单数据
const form = ref<any>({
  scheme_name: '',
  item_number: '',
  customer_number: null,
  customer_name: '',
  template_id: null,
  is_default: '否',
  is_active: '是',
  factory_id: null,
  custom_fields: [] as any[],
})

// 加载下拉数据
const loadDropdowns = async () => {
  try {
    const [tplRes, custRes, itemRes, facRes] = await Promise.all([
      getLabelTemplates({ limit: 999, is_active: '是' }),
      getCustomers({ limit: 999 }),
      getItems({ limit: 999 }),
      getFactories(),
    ])
    templates.value = tplRes.data?.data?.items || tplRes.data?.items || []
    customers.value = custRes.data?.data?.items || custRes.data?.items || []
    items.value = itemRes.data?.data?.items || itemRes.data?.items || []
    factories.value = facRes.data?.data?.items || facRes.data?.items || facRes.data?.data || []
  } catch { /* ignore */ }
}

// 加载详情
const loadDetail = async (id: number) => {
  loading.value = true
  try {
    const res: any = await getProductLabelSchemeDetail(id)
    const data = res.data?.data || res.data
    if (data) {
      form.value = {
        scheme_name: data.scheme_name || '',
        item_number: data.item_number || '',
        customer_number: data.customer_number || null,
        customer_name: data.customer_name || '',
        template_id: data.template_id || null,
        is_default: data.is_default || '否',
        is_active: data.is_active || '是',
        factory_id: data.factory_id || null,
        custom_fields: (data.custom_fields || []).map((f: any) => ({
          field_key: f.field_key,
          field_label: f.field_label,
          field_value: f.field_value || '',
          display_order: f.display_order || 0,
          is_in_qr: f.is_in_qr || '否',
        })),
      }
    }
  } catch { /* ignore */ }
  loading.value = false
}

const resetForm = () => {
  form.value = {
    scheme_name: '',
    item_number: '',
    customer_number: null,
    customer_name: '',
    template_id: null,
    is_default: '否',
    is_active: '是',
    factory_id: null,
    custom_fields: [],
  }
}

watch(() => props.open, (val) => {
  if (val) {
    loadDropdowns()
    if (props.editingId) {
      loadDetail(props.editingId)
    } else {
      resetForm()
    }
  }
})

// 产品搜索
const itemSearch = ref('')
const filteredItems = computed(() => {
  if (!itemSearch.value) return items.value.slice(0, 50)
  const s = itemSearch.value.toLowerCase()
  return items.value.filter((i: any) =>
    (i.item_number || '').toLowerCase().includes(s) || (i.item_name || '').toLowerCase().includes(s)
  ).slice(0, 50)
})

const handleItemSelect = (val: string) => {
  const item = items.value.find((i: any) => i.item_number === val)
  if (item && !form.value.scheme_name) {
    form.value.scheme_name = `${val}-标签方案`
  }
}

// 客户搜索
const customerSearch = ref('')
const filteredCustomers = computed(() => {
  if (!customerSearch.value) return customers.value.slice(0, 50)
  const s = customerSearch.value.toLowerCase()
  return customers.value.filter((c: any) =>
    (c.customer_number || '').toLowerCase().includes(s) || (c.customer_name || '').toLowerCase().includes(s)
  ).slice(0, 50)
})

const handleCustomerSelect = (val: string) => {
  const cust = customers.value.find((c: any) => c.customer_number === val)
  form.value.customer_name = cust?.customer_name || ''
}

// 自定义字段操作
const addCustomField = () => {
  form.value.custom_fields.push({
    field_key: `custom_${form.value.custom_fields.length + 1}`,
    field_label: '',
    field_value: '',
    display_order: form.value.custom_fields.length + 1,
    is_in_qr: '否',
  })
}

const removeCustomField = (index: number) => {
  form.value.custom_fields.splice(index, 1)
}

// 保存
const handleOk = async () => {
  if (saving.value) return // 防止重复提交
  if (!form.value.scheme_name) { message.warning('请输入方案名称'); return }
  if (!form.value.item_number) { message.warning('请选择产品'); return }
  if (!form.value.template_id) { message.warning('请选择标签模板'); return }

  // 验证自定义字段
  for (const cf of form.value.custom_fields) {
    if (!cf.field_label) { message.warning('自定义字段名称不能为空'); return }
  }

  saving.value = true
  try {
    if (props.editingId) {
      await updateProductLabelScheme(props.editingId, form.value)
      message.success('更新成功')
    } else {
      await createProductLabelScheme(form.value)
      message.success('创建成功')
    }
    emit('ok')
    showModal.value = false
  } catch (e: any) {
    message.error(e?.response?.data?.message || '操作失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <a-modal
    v-model:open="showModal"
    :title="editingId ? '编辑产品标签方案' : '新增产品标签方案'"
    width="750px"
    :confirm-loading="saving"
    @ok="handleOk"
    :mask-closable="false"
  >
    <a-spin :spinning="loading">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="方案名称" required>
              <a-input v-model:value="form.scheme_name" placeholder="如：110103-客户A标签方案" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="默认方案">
              <a-select v-model:value="form.is_default">
                <a-select-option value="否">否</a-select-option>
                <a-select-option value="是">是</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="状态">
              <a-select v-model:value="form.is_active">
                <a-select-option value="是">启用</a-select-option>
                <a-select-option value="否">停用</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="产品编号" required>
              <a-select
                v-model:value="form.item_number"
                show-search
                :filter-option="false"
                @search="(v: string) => itemSearch = v"
                @select="handleItemSelect"
                placeholder="搜索产品编号/名称"
              >
                <a-select-option v-for="item in filteredItems" :key="item.item_number" :value="item.item_number">
                  {{ item.item_number }} - {{ item.item_name }}
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="客户编号（空=默认方案）">
              <a-select
                v-model:value="form.customer_number"
                show-search
                :filter-option="false"
                allow-clear
                @search="(v: string) => customerSearch = v"
                @select="handleCustomerSelect"
                placeholder="搜索客户编号/名称"
              >
                <a-select-option v-for="c in filteredCustomers" :key="c.customer_number" :value="c.customer_number">
                  {{ c.customer_number }} - {{ c.customer_name }}
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="标签模板" required>
              <a-select v-model:value="form.template_id" placeholder="选择标签模板">
                <a-select-option v-for="tpl in templates" :key="tpl.id" :value="tpl.id">
                  {{ tpl.template_name }} ({{ tpl.template_code }})
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="工厂">
              <a-select v-model:value="form.factory_id" allow-clear placeholder="不限">
                <a-select-option v-for="f in factories" :key="f.id" :value="f.id">{{ f.factory_name }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <!-- 自定义字段 -->
        <a-divider>自定义字段</a-divider>
        <div style="margin-bottom:8px;">
          <a-button size="small" @click="addCustomField"><PlusOutlined />添加自定义字段</a-button>
        </div>
        <a-table
          v-if="form.custom_fields.length > 0"
          :columns="[
            { title: '字段标识', dataIndex: 'field_key', key: 'field_key', width: 120 },
            { title: '字段名称', dataIndex: 'field_label', key: 'field_label', width: 150 },
            { title: '字段值/默认值', dataIndex: 'field_value', key: 'field_value', width: 180 },
            { title: '纳入QR', dataIndex: 'is_in_qr', key: 'is_in_qr', width: 80 },
            { title: '操作', key: 'action', width: 60 },
          ]"
          :data-source="form.custom_fields"
          :pagination="false"
          size="small"
          bordered
          row-key="field_key"
        >
          <template #bodyCell="{ column, record, index }">
            <template v-if="column.key === 'field_label'">
              <a-input v-model:value="record.field_label" size="small" placeholder="如：参考标准" />
            </template>
            <template v-if="column.key === 'field_value'">
              <a-input v-model:value="record.field_value" size="small" placeholder="如：HC/T2006 2006" />
            </template>
            <template v-if="column.key === 'is_in_qr'">
              <a-select v-model:value="record.is_in_qr" size="small" style="width:60px">
                <a-select-option value="是">是</a-select-option>
                <a-select-option value="否">否</a-select-option>
              </a-select>
            </template>
            <template v-if="column.key === 'action'">
              <a @click="removeCustomField(index)" style="color:#ff4d4f"><DeleteOutlined /></a>
            </template>
          </template>
        </a-table>
        <a-empty v-else description="暂无自定义字段" />
      </a-form>
    </a-spin>
  </a-modal>
</template>
