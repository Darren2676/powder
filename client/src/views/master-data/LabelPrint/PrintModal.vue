<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { message } from 'ant-design-vue'
import { PrinterOutlined, EyeOutlined } from '@ant-design/icons-vue'
import {
  previewLabel,
  printLabel,
  matchLabelScheme,
  getLabelTemplates,
} from '@/api/master-data/labelTemplate'

const props = defineProps<{
  visible: boolean
  record: any  // finished_batch_inventory 记录
}>()

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
}>()

const showModal = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val),
})

const loading = ref(false)
const printing = ref(false)
const labelHtml = ref('')
const qrContent = ref('')
const matchedScheme = ref<any>(null)
const templates = ref<any[]>([])

// 打印参数
const printForm = ref<any>({
  item_number: '',
  item_name: '',
  batch_number: '',
  production_date: '',
  box_number: '',
  net_weight: '',
  remark: '',
  customer_number: '',
  scheme_id: null,
  template_id: null,
  custom_values: {} as Record<string, string>,
})

// 监听弹窗打开
watch(() => props.visible, async (val) => {
  if (val && props.record) {
    const r = props.record
    printForm.value = {
      item_number: r.item_number || '',
      item_name: r.item_name || '',
      batch_number: r.batch_number || '',
      production_date: r.production_date || dayjsFormat(r.last_updated),
      box_number: '1',
      net_weight: '',
      remark: '',
      customer_number: '',
      scheme_id: null,
      template_id: null,
      custom_values: {},
    }

    // 加载模板列表
    try {
      const res: any = await getLabelTemplates({ limit: 999, is_active: '是' })
      templates.value = res.data?.data?.items || res.data?.items || []
    } catch { /* ignore */ }

    // 自动匹配方案
    try {
      const res: any = await matchLabelScheme({ item_number: r.item_number })
      const data = res.data?.data || res.data
      if (data) {
        matchedScheme.value = data
        printForm.value.scheme_id = data.id
        printForm.value.template_id = data.template_id

        // 填充自定义字段默认值
        if (data.custom_fields) {
          const cv: Record<string, string> = {}
          for (const f of data.custom_fields) {
            cv[f.field_key] = f.field_value || ''
          }
          printForm.value.custom_values = cv
        }
      }
    } catch { /* 没有匹配方案 */ }

    // 自动预览
    handlePreview()
  }
})

function dayjsFormat(date: any): string {
  if (!date) return ''
  try {
    const d = new Date(date)
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
  } catch { return '' }
}

// 预览
const handlePreview = async () => {
  loading.value = true
  try {
    const res: any = await previewLabel({
      item_number: printForm.value.item_number,
      batch_number: printForm.value.batch_number,
      production_date: printForm.value.production_date,
      box_number: printForm.value.box_number,
      net_weight: printForm.value.net_weight,
      remark: printForm.value.remark,
      customer_number: printForm.value.customer_number,
      scheme_id: printForm.value.scheme_id,
      template_id: printForm.value.template_id,
      custom_values: printForm.value.custom_values,
    })
    const data = res.data?.data || res.data
    labelHtml.value = data.label_html || ''
    qrContent.value = data.qr_content || ''
  } catch (e: any) {
    message.error(e?.response?.data?.message || '预览失败')
  }
  loading.value = false
}

// 打印
const handlePrint = async () => {
  printing.value = true
  try {
    await printLabel({
      item_number: printForm.value.item_number,
      batch_number: printForm.value.batch_number,
      production_date: printForm.value.production_date,
      box_number: printForm.value.box_number,
      net_weight: printForm.value.net_weight,
      remark: printForm.value.remark,
      customer_number: printForm.value.customer_number,
      scheme_id: printForm.value.scheme_id,
      custom_values: printForm.value.custom_values,
      qr_content: qrContent.value,
    })
    message.success('打印成功，日志已记录')

    // 调用浏览器打印
    printLabelHtml()
  } catch (e: any) {
    message.error(e?.response?.data?.message || '打印失败')
  }
  printing.value = false
}

// 浏览器打印
const printLabelHtml = () => {
  if (!labelHtml.value) return
  const printWindow = window.open('', '_blank', 'width=400,height=300')
  if (printWindow) {
    printWindow.document.write(`
      <html><head><title>标签打印</title>
      <style>body{margin:0;padding:10px;}</style>
      </head><body>${labelHtml.value}</body></html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print() }, 500)
  }
}
</script>

<template>
  <a-modal
    v-model:visible="showModal"
    title="打印产品标签"
    width="800px"
    :footer="null"
    :mask-closable="false"
  >
    <a-spin :spinning="loading">
      <a-row :gutter="16">
        <!-- 左侧：打印参数 -->
        <a-col :span="12">
          <a-form layout="vertical" size="small">
            <a-form-item label="产品编号">
              <a-input v-model:value="printForm.item_number" disabled />
            </a-form-item>
            <a-form-item label="批号">
              <a-input v-model:value="printForm.batch_number" disabled />
            </a-form-item>
            <a-form-item label="生产日期">
              <a-input v-model:value="printForm.production_date" />
            </a-form-item>
            <a-form-item label="箱号">
              <a-input v-model:value="printForm.box_number" placeholder="如：1" />
            </a-form-item>
            <a-form-item label="净重">
              <a-input v-model:value="printForm.net_weight" placeholder="如：25KG" />
            </a-form-item>
            <a-form-item label="备注">
              <a-textarea v-model:value="printForm.remark" :rows="2" placeholder="客户特定要求" />
            </a-form-item>
            <a-form-item label="客户编号（用于匹配方案）">
              <a-input v-model:value="printForm.customer_number" placeholder="可选" />
            </a-form-item>
            <a-form-item label="标签模板">
              <a-select v-model:value="printForm.template_id" allow-clear placeholder="自动匹配" @change="handlePreview">
                <a-select-option v-for="tpl in templates" :key="tpl.id" :value="tpl.id">
                  {{ tpl.template_name }}
                </a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item v-if="matchedScheme && matchedScheme.custom_fields && matchedScheme.custom_fields.length > 0">
              <template #label>自定义字段</template>
              <div v-for="cf in matchedScheme.custom_fields" :key="cf.field_key" style="margin-bottom:4px;">
                <a-input v-model:value="printForm.custom_values[cf.field_key]" :placeholder="cf.field_label" size="small" />
              </div>
            </a-form-item>
            <div style="display:flex;gap:8px;margin-top:12px;">
              <a-button @click="handlePreview"><EyeOutlined />预览</a-button>
              <a-button type="primary" @click="handlePrint" :loading="printing"><PrinterOutlined />打印</a-button>
            </div>
          </a-form>
        </a-col>
        <!-- 右侧：标签预览 -->
        <a-col :span="12">
          <div style="margin-bottom:8px;font-weight:600;">标签预览</div>
          <div v-if="qrContent" style="margin-bottom:8px;">
            <a-typography-text type="secondary">QR内容：{{ qrContent }}</a-typography-text>
          </div>
          <div v-if="matchedScheme" style="margin-bottom:8px;">
            <a-tag color="blue">匹配方式：{{ matchedScheme.match_type }}</a-tag>
            <a-tag v-if="matchedScheme.scheme_name" color="green">{{ matchedScheme.scheme_name }}</a-tag>
          </div>
          <div style="border:1px solid #e8e8e8;border-radius:4px;padding:8px;background:#fff;min-height:200px;">
            <div v-if="labelHtml" v-html="labelHtml"></div>
            <a-empty v-else description="点击预览按钮查看标签" />
          </div>
        </a-col>
      </a-row>
    </a-spin>
  </a-modal>
</template>
