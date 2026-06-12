<template>
  <div class="page-header-title" style="padding:16px 24px 0">
    <a-button type="link" @click="router.push('/sample-boms')" style="padding:0;margin-right:8px">&lt; 返回</a-button>
    样件BOM详情
  </div>
  <a-card :bordered="false" style="margin:12px 24px">
    <a-spin :spinning="loading">
      <!-- 基本信息 -->
      <a-descriptions :column="3" size="small" bordered style="margin-bottom:16px">
        <a-descriptions-item label="样件BOM编号">{{ header.sample_bom_number }}</a-descriptions-item>
        <a-descriptions-item label="样品申请编号">
          <a-button type="link" size="small" style="padding:0" @click="router.push(`/sample-request/${header.sample_request_number}`)">{{ header.sample_request_number }}</a-button>
        </a-descriptions-item>
        <a-descriptions-item label="BOM名称">{{ header.bom_name }}</a-descriptions-item>
        <a-descriptions-item label="产品编号">{{ header.item_number }}</a-descriptions-item>
        <a-descriptions-item label="产品名称">{{ header.item_name }}</a-descriptions-item>
        <a-descriptions-item label="基准用量">{{ header.base_quantity }} {{ header.base_unit }}</a-descriptions-item>
        <a-descriptions-item label="当前版本">V{{ header.current_version }}</a-descriptions-item>
        <a-descriptions-item label="最终版本">{{ header.final_version ? 'V' + header.final_version : '-' }}</a-descriptions-item>
        <a-descriptions-item label="状态">
          <a-tag :color="header.status === '已导入' ? 'green' : header.status === '已确定' ? 'blue' : 'orange'">{{ header.status }}</a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="来源设计BOM" v-if="header.source_design_bom_number">
          <a-button type="link" size="small" style="padding:0" @click="router.push(`/boms/${header.source_design_bom_number}`)">{{ header.source_design_bom_number }}</a-button>
        </a-descriptions-item>
      </a-descriptions>

      <!-- Tab区 -->
      <a-tabs v-model:activeKey="activeTab">
        <!-- 版本管理 -->
        <a-tab-pane key="versions" tab="版本管理">
          <div style="margin-bottom:12px">
            <a-button v-if="header.status === '试制中'" type="primary" @click="handleCreateVersion" style="margin-right:8px">创建新版本</a-button>
            <a-button v-if="header.status === '试制中' && selectedVersion" type="primary" danger @click="determineVisible = true" style="margin-right:8px">确定最终版本</a-button>
          </div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <a-card v-for="v in versions" :key="v.version_number" size="small"
              :style="{ width: '220px', cursor: 'pointer', border: selectedVersion === v.version_number ? '2px solid #1890ff' : '1px solid #d9d9d9' }"
              @click="selectVersion(v.version_number)">
              <p style="font-weight:bold;margin-bottom:4px">V{{ v.version_number }}</p>
              <p style="font-size:12px;color:#888">状态：<a-tag :color="v.status === '已检测' ? 'green' : v.status === '已提交' ? 'blue' : 'default'" size="small">{{ v.status }}</a-tag></p>
              <p v-if="v.inspection_result" style="font-size:12px;color:#888">检测：<span :style="{ color: v.inspection_result === '合格' ? '#52c41a' : v.inspection_result === '不合格' ? '#f5222d' : '#faad14' }">{{ v.inspection_result }}</span></p>
              <p style="font-size:11px;color:#aaa">{{ v.version_remark || '' }}</p>
              <div style="margin-top:4px">
                <a-button v-if="v.status === '草稿'" type="link" size="small" @click.stop="handleSubmitVersion(v)">提交</a-button>
                <a-button v-if="header.status === '试制中' && v.status === '草稿'" type="link" size="small" @click.stop="handleCopyVersion(v)">复制为新版本</a-button>
                <a-popconfirm v-if="v.status === '草稿'" title="确认删除此版本？" @confirm="handleDeleteVersion(v)">
                  <a-button type="link" size="small" danger @click.stop>删除</a-button>
                </a-popconfirm>
              </div>
            </a-card>
          </div>
        </a-tab-pane>

        <!-- 版本明细 -->
        <a-tab-pane key="details" tab="版本明细" :disabled="!selectedVersion">
          <div style="margin-bottom:12px;display:flex;gap:8px">
            <span style="line-height:32px;font-weight:bold">V{{ selectedVersion }} 明细</span>
            <div style="flex:1" />
            <template v-if="editingQuantities">
              <a-button type="primary" size="small" :loading="saveLoading" @click="handleSaveQuantities">保存</a-button>
              <a-button size="small" @click="cancelEditingQuantities">取消</a-button>
            </template>
            <template v-else-if="currentVersionStatus === '草稿'">
              <a-button size="small" @click="startEditingQuantities">调整数量</a-button>
              <a-button type="primary" size="small" @click="openAddDetail">添加行</a-button>
              <a-button size="small" @click="designBomDetailModalVisible = true">从设计BOM导入明细</a-button>
            </template>
          </div>
          <a-table :columns="detailColumns" :data-source="editingQuantities ? editingDetails : versionDetails" row-key="id" size="small" :pagination="false" :scroll="{ x: 1600 }">
            <template #bodyCell="{ column, record }">
              <template v-if="editingQuantities && column.dataIndex === 'standard_quantity'">
                <a-input-number v-model:value="record.standard_quantity" :min="0" :precision="4" size="small" style="width:80px" />
              </template>
              <template v-else-if="editingQuantities && column.dataIndex === 'wastage_rate'">
                <a-input-number v-model:value="record.wastage_rate" :min="0" :precision="2" size="small" style="width:80px" />
              </template>
              <template v-else-if="editingQuantities && column.dataIndex === 'actual_quantity'">
                <a-input-number v-model:value="record.actual_quantity" :min="0" :precision="4" size="small" style="width:80px" />
              </template>
              <template v-else-if="column.dataIndex === 'is_key_material'">
                <a-tag :color="record.is_key_material === 1 ? 'red' : 'default'">{{ record.is_key_material === 1 ? '是' : '否' }}</a-tag>
              </template>
              <template v-if="column.dataIndex === 'action'">
                <template v-if="currentVersionStatus === '草稿'">
                  <a-button type="link" size="small" @click="openEditDetail(record)">编辑</a-button>
                  <a-popconfirm title="确认删除？" @confirm="handleDeleteDetail(record)">
                    <a-button type="link" size="small" danger>删除</a-button>
                  </a-popconfirm>
                </template>
              </template>
            </template>
          </a-table>
        </a-tab-pane>

        <!-- 检测报告 -->
        <a-tab-pane key="report" tab="检测报告" :disabled="!selectedVersion">
          <div v-if="inspectionReport">
            <a-descriptions :column="2" size="small" bordered style="margin-bottom:12px">
              <a-descriptions-item label="报告编号">{{ inspectionReport.report_number }}</a-descriptions-item>
              <a-descriptions-item label="检测日期">{{ inspectionReport.inspection_date }}</a-descriptions-item>
              <a-descriptions-item label="检测人">{{ inspectionReport.inspector }}</a-descriptions-item>
              <a-descriptions-item label="检测结论">
                <a-tag :color="inspectionReport.inspection_result === '合格' ? 'green' : inspectionReport.inspection_result === '不合格' ? 'red' : 'orange'">{{ inspectionReport.inspection_result }}</a-tag>
              </a-descriptions-item>
              <a-descriptions-item label="评价说明" :span="2">{{ inspectionReport.conclusion }}</a-descriptions-item>
            </a-descriptions>
            <div style="margin-bottom:8px;display:flex;gap:8px">
              <span style="font-weight:bold;line-height:32px">检测项</span>
              <div style="flex:1" />
              <a-button v-if="inspectionReport.status === '草稿'" size="small" @click="handleBatchImport">从质量特性库导入</a-button>
              <a-button v-if="inspectionReport.status === '草稿'" type="primary" size="small" @click="itemAddVisible = true">添加检测项</a-button>
              <a-button v-if="inspectionReport.status === '草稿'" type="primary" size="small" @click="handleSubmitReport">提交报告</a-button>
            </div>
            <a-table :columns="reportItemColumns" :data-source="reportItems" row-key="id" size="small" :pagination="false">
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'is_qualified'">
                  <a-tag v-if="record.is_qualified" :color="record.is_qualified === 'Y' ? 'green' : 'red'">{{ record.is_qualified === 'Y' ? '合格' : '不合格' }}</a-tag>
                  <span v-else>-</span>
                </template>
                <template v-if="column.dataIndex === 'action'">
                  <template v-if="inspectionReport?.status === '草稿'">
                    <a-button type="link" size="small" @click="openEditItem(record)">编辑</a-button>
                    <a-popconfirm title="确认删除？" @confirm="handleDeleteItem(record)">
                      <a-button type="link" size="small" danger>删除</a-button>
                    </a-popconfirm>
                  </template>
                </template>
              </template>
            </a-table>
          </div>
          <a-empty v-else description="该版本尚无检测报告">
            <a-button type="primary" @click="handleCreateReport">创建检测报告</a-button>
          </a-empty>
        </a-tab-pane>

        <!-- 导入设计BOM -->
        <a-tab-pane key="import" tab="导入设计BOM" :disabled="header.status !== '已确定'">
          <a-alert v-if="header.status === '已确定'" message="已确定最终版本，可导入设计BOM" type="info" show-icon style="margin-bottom:16px" />
          <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 14 }">
            <a-form-item label="设计BOM编号">
              <a-input v-model:value="importBomNumber" placeholder="输入新的设计BOM编号" />
            </a-form-item>
            <a-form-item label="导入版本">
              <span>V{{ header.final_version }}</span>
            </a-form-item>
            <a-form-item :wrapper-col="{ offset: 6 }">
              <a-button type="primary" @click="handleImport" :loading="importLoading">确认导入设计BOM</a-button>
            </a-form-item>
          </a-form>
        </a-tab-pane>
      </a-tabs>
    </a-spin>
  </a-card>

  <!-- 添加/编辑明细行弹窗 -->
  <a-modal v-model:open="detailAddVisible" :title="detailIsEdit ? '编辑明细行' : '添加明细行'" @ok="handleSaveDetail" width="600px">
    <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
      <a-form-item label="物料编号"><a-input v-model:value="detailForm.material_number" /></a-form-item>
      <a-form-item label="物料名称"><a-input v-model:value="detailForm.material_name" /></a-form-item>
      <a-form-item label="物料类型"><a-input v-model:value="detailForm.material_type" /></a-form-item>
      <a-form-item label="标准用量"><a-input-number v-model:value="detailForm.standard_quantity" :min="0" :precision="4" style="width:100%" /></a-form-item>
      <a-form-item label="单位"><a-input v-model:value="detailForm.unit" /></a-form-item>
      <a-form-item label="损耗率(%)"><a-input-number v-model:value="detailForm.wastage_rate" :min="0" :precision="2" style="width:100%" /></a-form-item>
      <a-form-item label="实际用量"><a-input-number v-model:value="detailForm.actual_quantity" :min="0" :precision="4" style="width:100%" /></a-form-item>
      <a-form-item label="工序号"><a-input v-model:value="detailForm.step_number" /></a-form-item>
      <a-form-item label="关键物料"><a-select v-model:value="detailForm.is_key_material"><a-select-option :value="1">是</a-select-option><a-select-option :value="0">否</a-select-option></a-select></a-form-item>
      <a-form-item label="供应类型"><a-input v-model:value="detailForm.supply_type" /></a-form-item>
      <a-form-item label="默认仓库"><a-input v-model:value="detailForm.default_warehouse" /></a-form-item>
      <a-form-item label="备注"><a-input v-model:value="detailForm.remark" /></a-form-item>
    </a-form>
  </a-modal>

  <!-- 添加检测项弹窗 -->
  <a-modal v-model:open="itemAddVisible" title="添加检测项" @ok="handleAddItem" width="520px">
    <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
      <a-form-item label="质量特性">
        <a-auto-complete
          v-model:value="itemForm.char_name"
          :options="charSearchResults"
          @search="handleCharSearch"
          @select="handleCharSelect"
          placeholder="输入搜索质量特性或手动录入"
          :filter-option="false"
          allow-clear
        />
      </a-form-item>
      <a-form-item label="检验要求"><a-input v-model:value="itemForm.inspect_requirement" /></a-form-item>
      <a-form-item label="数据类型"><a-select v-model:value="itemForm.data_type"><a-select-option value="数值">数值</a-select-option><a-select-option value="单选">单选</a-select-option><a-select-option value="多选">多选</a-select-option><a-select-option value="文本">文本</a-select-option></a-select></a-form-item>
      <a-form-item label="上限"><a-input-number v-model:value="itemForm.upper_limit" style="width:100%" /></a-form-item>
      <a-form-item label="标准值"><a-input v-model:value="itemForm.standard_value" /></a-form-item>
      <a-form-item label="下限"><a-input-number v-model:value="itemForm.lower_limit" style="width:100%" /></a-form-item>
      <a-form-item label="实测值"><a-input v-model:value="itemForm.measured_value" /></a-form-item>
      <a-form-item label="是否合格"><a-select v-model:value="itemForm.is_qualified" allow-clear><a-select-option value="Y">合格</a-select-option><a-select-option value="N">不合格</a-select-option></a-select></a-form-item>
    </a-form>
  </a-modal>

  <!-- 编辑检测项弹窗 -->
  <a-modal v-model:open="itemEditVisible" title="编辑检测项" @ok="handleEditItem" width="520px">
    <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
      <a-form-item label="质量特性"><a-input v-model:value="itemEditForm.char_name" /></a-form-item>
      <a-form-item label="检验要求"><a-input v-model:value="itemEditForm.inspect_requirement" /></a-form-item>
      <a-form-item label="数据类型"><a-select v-model:value="itemEditForm.data_type"><a-select-option value="数值">数值</a-select-option><a-select-option value="单选">单选</a-select-option><a-select-option value="多选">多选</a-select-option><a-select-option value="文本">文本</a-select-option></a-select></a-form-item>
      <a-form-item label="上限"><a-input-number v-model:value="itemEditForm.upper_limit" style="width:100%" /></a-form-item>
      <a-form-item label="标准值"><a-input v-model:value="itemEditForm.standard_value" /></a-form-item>
      <a-form-item label="下限"><a-input-number v-model:value="itemEditForm.lower_limit" style="width:100%" /></a-form-item>
      <a-form-item label="实测值"><a-input v-model:value="itemEditForm.measured_value" /></a-form-item>
      <a-form-item label="是否合格"><a-select v-model:value="itemEditForm.is_qualified" allow-clear><a-select-option value="Y">合格</a-select-option><a-select-option value="N">不合格</a-select-option></a-select></a-form-item>
    </a-form>
  </a-modal>

  <!-- 确定最终版本弹窗 -->
  <a-modal v-model:open="determineVisible" title="确定最终版本" @ok="handleDetermine" width="400px">
    <p>确定选择 <b>V{{ selectedVersion }}</b> 为最终版本？</p>
    <p style="color:#888;font-size:12px">确定后不可再创建新版本</p>
  </a-modal>

  <!-- 从设计BOM导入明细弹窗 -->
  <DesignBomSelectModal v-model:open="designBomDetailModalVisible" @select="handleDesignBomDetailSelect" />
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  getSampleBomDetail, getVersions, getVersionDetail, createVersion, copyVersion,
  submitVersion, deleteVersion, addVersionDetail, updateVersionDetail, deleteVersionDetail,
  batchUpdateVersionDetails, determineFinalVersion, importToDesignBom,
  getReportByBomVersion, createInspectionReport, submitInspectionReport,
  addReportItem, updateReportItem, deleteReportItem, batchImportReportItems,
  importDetailsFromDesignBom,
} from '@/api/sales/sampleBom'
import { getQualityCharacteristics } from '@/api/quality/qualityCharacteristic'
import DesignBomSelectModal from './DesignBomSelectModal.vue'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const header = ref<any>({})
const versions = ref<any[]>([])
const activeTab = ref('versions')
const selectedVersion = ref<number>(0)

// 版本明细
const versionDetails = ref<any[]>([])
const editingQuantities = ref(false)
const editingDetails = ref<any[]>([])
const saveLoading = ref(false)
const currentVersionStatus = computed(() => {
  const v = versions.value.find((x: any) => x.version_number === selectedVersion.value)
  return v?.status || ''
})

const detailColumns = [
  { title: '行号', dataIndex: 'line_number', width: 60 },
  { title: '物料编号', dataIndex: 'material_number', width: 120 },
  { title: '物料名称', dataIndex: 'material_name', width: 140 },
  { title: '物料类型', dataIndex: 'material_type', width: 90 },
  { title: '标准用量', dataIndex: 'standard_quantity', width: 90 },
  { title: '单位', dataIndex: 'unit', width: 60 },
  { title: '损耗率(%)', dataIndex: 'wastage_rate', width: 90 },
  { title: '实际用量', dataIndex: 'actual_quantity', width: 90 },
  { title: '工序号', dataIndex: 'step_number', width: 70 },
  { title: '关键物料', dataIndex: 'is_key_material', width: 80 },
  { title: '供应类型', dataIndex: 'supply_type', width: 80 },
  { title: '默认仓库', dataIndex: 'default_warehouse', width: 90 },
  { title: '备注', dataIndex: 'remark', width: 120 },
  { title: '操作', dataIndex: 'action', width: 120, fixed: 'right' },
]

// 检测报告
const inspectionReport = ref<any>(null)
const reportItems = ref<any[]>([])
const reportItemColumns = [
  { title: '质量特性', dataIndex: 'char_name', width: 120 },
  { title: '检验要求', dataIndex: 'inspect_requirement', width: 140 },
  { title: '数据类型', dataIndex: 'data_type', width: 70 },
  { title: '上限', dataIndex: 'upper_limit', width: 80 },
  { title: '标准值', dataIndex: 'standard_value', width: 80 },
  { title: '下限', dataIndex: 'lower_limit', width: 80 },
  { title: '实测值', dataIndex: 'measured_value', width: 80 },
  { title: '合格', dataIndex: 'is_qualified', width: 70 },
  { title: '操作', dataIndex: 'action', width: 100, fixed: 'right' },
]

// 导入设计BOM
const importBomNumber = ref('')
const importLoading = ref(false)

// 确定最终版本
const determineVisible = ref(false)

// 从设计BOM导入明细
const designBomDetailModalVisible = ref(false)

const handleDesignBomDetailSelect = async (record: any) => {
  if (!header.value.sample_bom_number || !selectedVersion.value) return
  try {
    const res = await importDetailsFromDesignBom(header.value.sample_bom_number, selectedVersion.value, {
      design_bom_number: record.bom_number,
    })
    message.success(`已导入 ${res.data?.added_count || 0} 行明细`)
    loadVersionData()
  } catch (e: any) { message.error(e?.response?.data?.message || '导入失败') }
}

// 详情行表单
const detailAddVisible = ref(false)
const detailIsEdit = ref(false)
const detailForm = reactive({ id: 0, material_number: '', material_name: '', material_type: '', standard_quantity: 0, unit: '', wastage_rate: 0, actual_quantity: 0, step_number: '', is_key_material: 0, substitute_group: '', substitute_priority: 0, supply_type: '', default_warehouse: '', remark: '' })

// 检测项表单
const itemAddVisible = ref(false)
const itemForm = reactive({ char_name: '', inspect_requirement: '', data_type: '数值', upper_limit: null as any, standard_value: '', lower_limit: null as any, measured_value: '', is_qualified: null as any })
const itemEditVisible = ref(false)
const itemEditForm = reactive({ id: 0, char_name: '', inspect_requirement: '', data_type: '数值', upper_limit: null as any, standard_value: '', lower_limit: null as any, measured_value: '', is_qualified: null as any })

// 质量特性模糊搜索
const charSearchResults = ref<any[]>([])
const charSearchLoading = ref(false)
const handleCharSearch = async (value: string) => {
  if (!value || value.length < 1) { charSearchResults.value = []; return }
  charSearchLoading.value = true
  try {
    const res: any = await getQualityCharacteristics({ search: value, limit: 20 })
    charSearchResults.value = (res.data?.items || []).map((item: any) => ({
      value: item.char_name,
      label: item.char_name,
      ...item,
    }))
  } catch { charSearchResults.value = [] }
  finally { charSearchLoading.value = false }
}
const handleCharSelect = (value: string, option: any) => {
  itemForm.char_name = option.char_name || value
  const typeMap: Record<string, string> = { '文本型': '文本', '计量型': '数值' }
  itemForm.data_type = typeMap[option.data_type as string] || option.data_type || '数值'
  itemForm.inspect_requirement = option.inspect_requirement || ''
  itemForm.upper_limit = option.upper_limit != null ? Number(option.upper_limit) : null
  itemForm.standard_value = option.standard_value != null ? String(option.standard_value) : ''
  itemForm.lower_limit = option.lower_limit != null ? Number(option.lower_limit) : null
}

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getSampleBomDetail(route.params.id as string)
    header.value = res.data.header || {}
    versions.value = res.data.versions || []
    if (versions.value.length > 0 && !selectedVersion.value) {
      selectedVersion.value = versions.value[versions.value.length - 1].version_number
    }
  } catch { message.error('获取详情失败') }
  finally { loading.value = false }
}

const selectVersion = (ver: number) => {
  selectedVersion.value = ver
  if (activeTab.value === 'details' || activeTab.value === 'report') {
    loadVersionData()
  }
}

const loadVersionData = async () => {
  if (!selectedVersion.value || !header.value.sample_bom_number) return
  try {
    const bn = header.value.sample_bom_number
    const ver = selectedVersion.value
    const [detailRes, reportRes] = await Promise.all([
      getVersionDetail(bn, ver),
      getReportByBomVersion(bn, ver).catch(() => ({ data: null })),
    ])
    versionDetails.value = detailRes.data?.details || []
    inspectionReport.value = reportRes.data?.report || null
    reportItems.value = reportRes.data?.items || []
  } catch { /* ignore */ }
}

watch(activeTab, (tab) => {
  if ((tab === 'details' || tab === 'report') && selectedVersion.value) {
    loadVersionData()
  }
})

// 版本操作
const handleCreateVersion = async () => {
  try {
    await createVersion(header.value.sample_bom_number, { version_remark: '' })
    message.success('新版本已创建')
    fetchData()
  } catch (e: any) { message.error(e?.response?.data?.message || '创建版本失败') }
}

const handleCopyVersion = async (v: any) => {
  try {
    await copyVersion(header.value.sample_bom_number, v.version_number, { version_remark: `基于V${v.version_number}复制` })
    message.success('已复制为新版本')
    fetchData()
  } catch (e: any) { message.error(e?.response?.data?.message || '复制版本失败') }
}

const handleSubmitVersion = async (v: any) => {
  try {
    await submitVersion(header.value.sample_bom_number, v.version_number)
    message.success('版本已提交')
    fetchData()
  } catch (e: any) { message.error(e?.response?.data?.message || '提交失败') }
}

const handleDeleteVersion = async (v: any) => {
  try {
    await deleteVersion(header.value.sample_bom_number, v.version_number)
    message.success('版本已删除')
    selectedVersion.value = 0
    fetchData()
  } catch (e: any) { message.error(e?.response?.data?.message || '删除版本失败') }
}

// 明细操作
const openAddDetail = () => {
  detailIsEdit.value = false
  Object.assign(detailForm, { id: 0, material_number: '', material_name: '', material_type: '', standard_quantity: 0, unit: '', wastage_rate: 0, actual_quantity: 0, step_number: '', is_key_material: 0, substitute_group: '', substitute_priority: 0, supply_type: '', default_warehouse: '', remark: '' })
  detailAddVisible.value = true
}

const openEditDetail = (record: any) => {
  detailIsEdit.value = true
  Object.assign(detailForm, { ...record })
  detailAddVisible.value = true
}

const handleSaveDetail = async () => {
  try {
    if (detailIsEdit.value) {
      await updateVersionDetail(detailForm.id, { ...detailForm })
      message.success('更新成功')
    } else {
      await addVersionDetail(header.value.sample_bom_number, selectedVersion.value, { ...detailForm })
      message.success('添加成功')
    }
    detailAddVisible.value = false
    Object.assign(detailForm, { id: 0, material_number: '', material_name: '', material_type: '', standard_quantity: 0, unit: '', wastage_rate: 0, actual_quantity: 0, step_number: '', is_key_material: 0, substitute_group: '', substitute_priority: 0, supply_type: '', default_warehouse: '', remark: '' })
    loadVersionData()
  } catch (e: any) { message.error(e?.response?.data?.message || '操作失败') }
}

const handleDeleteDetail = async (record: any) => {
  try {
    await deleteVersionDetail(record.id)
    message.success('删除成功')
    loadVersionData()
  } catch (e: any) { message.error(e?.response?.data?.message || '删除失败') }
}

// 检测报告
const handleCreateReport = async () => {
  try {
    await createInspectionReport({ sample_bom_number: header.value.sample_bom_number, version_number: selectedVersion.value })
    message.success('检测报告已创建')
    loadVersionData()
  } catch (e: any) { message.error(e?.response?.data?.message || '创建失败') }
}

const handleSubmitReport = async () => {
  try {
    if (!inspectionReport.value) return
    await submitInspectionReport(inspectionReport.value.report_number)
    message.success('报告已提交')
    loadVersionData()
    fetchData()
  } catch (e: any) { message.error(e?.response?.data?.message || '提交失败') }
}

const handleBatchImport = async () => {
  try {
    if (!inspectionReport.value) return
    const res = await batchImportReportItems(inspectionReport.value.report_number)
    message.success(`已导入 ${res.data?.count || 0} 项`)
    loadVersionData()
  } catch (e: any) { message.error(e?.response?.data?.message || '导入失败') }
}

const handleAddItem = async () => {
  try {
    if (!inspectionReport.value) return
    await addReportItem(inspectionReport.value.report_number, { ...itemForm })
    message.success('添加检测项成功')
    itemAddVisible.value = false
    Object.assign(itemForm, { char_name: '', inspect_requirement: '', data_type: '数值', upper_limit: null, standard_value: '', lower_limit: null, measured_value: '', is_qualified: null })
    loadVersionData()
  } catch (e: any) { message.error(e?.response?.data?.message || '添加失败') }
}

const openEditItem = (record: any) => {
  Object.assign(itemEditForm, { ...record })
  itemEditVisible.value = true
}

const handleEditItem = async () => {
  try {
    await updateReportItem(itemEditForm.id, { ...itemEditForm })
    message.success('更新成功')
    itemEditVisible.value = false
    loadVersionData()
  } catch (e: any) { message.error(e?.response?.data?.message || '更新失败') }
}

const handleDeleteItem = async (record: any) => {
  try {
    await deleteReportItem(record.id)
    message.success('删除成功')
    loadVersionData()
  } catch (e: any) { message.error(e?.response?.data?.message || '删除失败') }
}

// 确定最终版本
const handleDetermine = async () => {
  try {
    await determineFinalVersion(header.value.sample_bom_number, { final_version: selectedVersion.value })
    message.success('已确定最终版本')
    determineVisible.value = false
    fetchData()
  } catch (e: any) { message.error(e?.response?.data?.message || '确定失败') }
}

// 导入设计BOM
const handleImport = async () => {
  if (!importBomNumber.value) { message.warning('请输入设计BOM编号'); return }
  importLoading.value = true
  try {
    const res = await importToDesignBom(header.value.sample_bom_number, {
      version_number: header.value.final_version,
      bom_number: importBomNumber.value,
    })
    message.success('导入设计BOM成功')
    fetchData()
  } catch (e: any) { message.error(e?.response?.data?.message || '导入失败') }
  finally { importLoading.value = false }
}

// ==================== 调整数量 ====================

const startEditingQuantities = () => {
  editingDetails.value = JSON.parse(JSON.stringify(versionDetails.value))
  editingQuantities.value = true
}

const handleSaveQuantities = async () => {
  if (!header.value.sample_bom_number || !selectedVersion.value) return
  const changed = editingDetails.value.filter((ed: any, idx: number) => {
    const vd = versionDetails.value[idx]
    if (!vd) return false
    return ed.standard_quantity !== vd.standard_quantity
      || ed.wastage_rate !== vd.wastage_rate
      || ed.actual_quantity !== vd.actual_quantity
  }).map((ed: any) => ({
    id: ed.id,
    standard_quantity: ed.standard_quantity,
    wastage_rate: ed.wastage_rate,
    actual_quantity: ed.actual_quantity,
  }))
  if (changed.length === 0) {
    message.info('未检测到变更')
    editingQuantities.value = false
    return
  }
  saveLoading.value = true
  try {
    await batchUpdateVersionDetails(header.value.sample_bom_number, selectedVersion.value, { details: changed })
    message.success(`已保存 ${changed.length} 行`)
    editingQuantities.value = false
    loadVersionData()
  } catch (e: any) { message.error(e?.response?.data?.message || '保存失败') }
  finally { saveLoading.value = false }
}

const cancelEditingQuantities = () => {
  editingDetails.value = []
  editingQuantities.value = false
  loadVersionData()
}

onMounted(() => fetchData())
</script>
