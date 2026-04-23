<script setup lang="ts">
import { ref, onMounted, createVNode, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { CONDITION_STATUS } from '@/constants/statuses'
import {
  ArrowLeftOutlined, CheckCircleOutlined, StopOutlined, ExclamationCircleOutlined,
  UploadOutlined, DownloadOutlined, DeleteOutlined, PlusOutlined, EditOutlined,
  FileOutlined, FilePdfOutlined, FileExcelOutlined, FileWordOutlined, FileImageOutlined, FileZipOutlined
} from '@ant-design/icons-vue'
import {
  getCustomerDetail, updateCustomerCondition,
  addCustomerAddress, updateCustomerAddress, removeCustomerAddress,
  uploadCustomerAttachment, downloadCustomerAttachment, removeCustomerAttachment
} from '@/api/master-data/customer'

defineOptions({ name: 'CustomerDetail' })

const route = useRoute()
const router = useRouter()
const customerId = computed(() => route.params.id as string)

const loading = ref(false)
const data = ref<any>({})
const addresses = ref<any[]>([])
const attachments = ref<any[]>([])

// 地址弹窗
const addressModalVisible = ref(false)
const addressModalTitle = ref('新增地址')
const addressForm = ref<any>({ address_type: '公司地址', region: '', detail_address: '', receiver: '', mobile: '', telephone: '', fax: '' })
const editingAddressId = ref<number | null>(null)

// 附件上传
const fileInputRef = ref<HTMLInputElement>()

const t = (val: any) => {
  if (val === null || val === undefined || val === '') return '-'
  return typeof val === 'string' ? val.trim() || '-' : val
}

const formatDateTime = (val: string) => {
  if (!val) return '-'
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

const conditionText = computed(() => (data.value.condition || '').trim() || CONDITION_STATUS.ENABLED)
const isEnabled = computed(() => conditionText.value === CONDITION_STATUS.ENABLED)

const fetchDetail = async () => {
  loading.value = true
  try {
    const res = await getCustomerDetail(customerId.value)
    data.value = res.data
    addresses.value = res.data.addresses || []
    attachments.value = res.data.attachments || []
  } catch { message.error('获取客户详情失败') }
  finally { loading.value = false }
}

const handleBack = () => { router.push('/customers') }

const handleToggleCondition = () => {
  const newCondition = isEnabled.value ? CONDITION_STATUS.DISABLED : CONDITION_STATUS.ENABLED
  Modal.confirm({
    title: `确认${newCondition}`,
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要${newCondition}客户"${(data.value.customer_name || '').trim()}"吗？`,
    okText: '确定', cancelText: '取消',
    onOk: async () => {
      try {
        await updateCustomerCondition(customerId.value, { condition: newCondition })
        message.success(`客户已${newCondition}`)
        fetchDetail()
      } catch { message.error('操作失败') }
    }
  })
}

// 地址操作
const handleAddAddress = () => {
  addressModalTitle.value = '新增地址'
  editingAddressId.value = null
  addressForm.value = { address_type: '公司地址', region: '', detail_address: '', receiver: '', mobile: '', telephone: '', fax: '' }
  addressModalVisible.value = true
}

const handleEditAddress = (addr: any) => {
  addressModalTitle.value = '编辑地址'
  editingAddressId.value = addr.id
  addressForm.value = { ...addr }
  addressModalVisible.value = true
}

const handleAddressSubmit = async () => {
  try {
    if (editingAddressId.value) {
      await updateCustomerAddress(editingAddressId.value, addressForm.value)
      message.success('更新地址成功')
    } else {
      await addCustomerAddress(customerId.value, addressForm.value)
      message.success('添加地址成功')
    }
    addressModalVisible.value = false
    fetchDetail()
  } catch { message.error('操作失败') }
}

const handleDeleteAddress = (addr: any) => {
  Modal.confirm({
    title: '确认删除', icon: createVNode(ExclamationCircleOutlined),
    content: '确定要删除此地址吗？', okText: '确定', cancelText: '取消',
    onOk: async () => {
      try { await removeCustomerAddress(addr.id); message.success('删除成功'); fetchDetail() }
      catch { message.error('删除失败') }
    }
  })
}

// 附件操作
const handleUploadClick = () => { fileInputRef.value?.click() }
const handleFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  try {
    const formData = new FormData()
    formData.append('file', file)
    await uploadCustomerAttachment(customerId.value, formData)
    message.success('上传成功')
    fetchDetail()
  } catch { message.error('上传失败') }
  finally { target.value = '' }
}

const handleDownload = async (att: any) => {
  try {
    const res = await downloadCustomerAttachment(att.id)
    const blob = new Blob([res.data], { type: res.headers?.['content-type'] || 'application/octet-stream' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = att.file_name
    link.click()
    URL.revokeObjectURL(link.href)
  } catch { message.error('下载失败') }
}

const handleDeleteAttachment = (att: any) => {
  Modal.confirm({
    title: '确认删除', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除附件"${att.file_name}"吗？`, okText: '确定', cancelText: '取消',
    onOk: async () => {
      try { await removeCustomerAttachment(att.id); message.success('删除成功'); fetchDetail() }
      catch { message.error('删除失败') }
    }
  })
}

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  if (['pdf'].includes(ext)) return FilePdfOutlined
  if (['xls', 'xlsx'].includes(ext)) return FileExcelOutlined
  if (['doc', 'docx'].includes(ext)) return FileWordOutlined
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(ext)) return FileImageOutlined
  if (['zip', 'rar', '7z'].includes(ext)) return FileZipOutlined
  return FileOutlined
}

const formatFileSize = (size: number) => {
  if (size < 1024) return size + ' B'
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB'
  return (size / 1024 / 1024).toFixed(1) + ' MB'
}

onMounted(() => { fetchDetail() })
</script>

<template>
  <div class="customer-detail" v-loading="loading">
    <!-- 顶部头区域 -->
    <div class="detail-header">
      <div class="header-left">
        <a-button type="text" @click="handleBack" class="back-btn">
          <template #icon><ArrowLeftOutlined /></template>
        </a-button>
        <div class="header-info">
          <div class="customer-code">{{ t(data.customer_number) }}</div>
          <div class="customer-name">{{ t(data.customer_name) }}</div>
        </div>
      </div>
      <div class="header-right">
        <a-space>
          <a-button v-if="isEnabled" danger @click="handleToggleCondition">
            <template #icon><StopOutlined /></template>禁用
          </a-button>
          <a-button v-else type="primary" @click="handleToggleCondition">
            <template #icon><CheckCircleOutlined /></template>启用
          </a-button>
          <a-button @click="handleBack">返回</a-button>
        </a-space>
        <div class="status-stamp" :class="isEnabled ? 'enabled' : 'disabled'">
          <span>{{ conditionText }}</span>
        </div>
      </div>
    </div>

    <!-- 基本信息 -->
    <div class="detail-basic">
      <a-descriptions :column="4" size="small">
        <a-descriptions-item label="分类">{{ t(data.classification) }}</a-descriptions-item>
        <a-descriptions-item label="国家/地区">{{ t(data.country) }}</a-descriptions-item>
        <a-descriptions-item label="币种代码">{{ t(data.currency_code) }}</a-descriptions-item>
        <a-descriptions-item label="销售税率">{{ t(data.sales_tax_rate) }}</a-descriptions-item>
        <a-descriptions-item label="行业">{{ t(data.industry) }}</a-descriptions-item>
        <a-descriptions-item label="销售负责人">{{ t(data.head_of_sales) }}</a-descriptions-item>
        <a-descriptions-item label="付款条件">{{ t(data.payment_terms) }}</a-descriptions-item>
      </a-descriptions>
    </div>

    <!-- 审核进度 -->
    <div class="detail-section audit-section">
      <div class="section-title">审核进度</div>
      <div class="section-body audit-body">
        <div class="audit-timeline">
          <div class="audit-node">
            <div class="audit-icon submit-icon">
              <CheckCircleOutlined />
            </div>
            <div class="audit-label">提交</div>
            <div class="audit-info">{{ t(data.created_by) }}</div>
            <div class="audit-time">{{ formatDateTime(data.created_at) }}</div>
          </div>
          <div class="audit-line"></div>
          <div class="audit-node">
            <div class="audit-icon complete-icon">
              <CheckCircleOutlined />
            </div>
            <div class="audit-label">完成</div>
            <div class="audit-time">{{ formatDateTime(data.created_at) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 联系信息 -->
    <div class="detail-section">
      <div class="section-title">联系信息</div>
      <div class="section-body">
        <a-descriptions :column="4" size="small">
          <a-descriptions-item label="联系人">{{ t(data.linkman) }}</a-descriptions-item>
          <a-descriptions-item label="手机">{{ t(data.contacts) }}</a-descriptions-item>
          <a-descriptions-item label="电话">{{ t(data.telephone) }}</a-descriptions-item>
          <a-descriptions-item label="传真">{{ t(data.fax) }}</a-descriptions-item>
          <a-descriptions-item label="Email">{{ t(data.email) }}</a-descriptions-item>
          <a-descriptions-item label="邮编">{{ t(data.zip_code) }}</a-descriptions-item>
          <a-descriptions-item label="所在地区">{{ t(data.region) }}</a-descriptions-item>
          <a-descriptions-item label="备注">{{ t(data.contact_remark) }}</a-descriptions-item>
          <a-descriptions-item label="详细地址" :span="4">{{ t(data.detail_address) }}</a-descriptions-item>
        </a-descriptions>
      </div>
    </div>

    <!-- 财务信息 -->
    <div class="detail-section">
      <div class="section-title">财务信息</div>
      <div class="section-body">
        <a-descriptions :column="4" size="small">
          <a-descriptions-item label="开户名称">{{ t(data.bank_account_name) }}</a-descriptions-item>
          <a-descriptions-item label="开户银行">{{ t(data.bank_name) }}</a-descriptions-item>
          <a-descriptions-item label="银行账号">{{ t(data.bank_account_number) }}</a-descriptions-item>
          <a-descriptions-item label="发票抬头">{{ t(data.invoice_title) }}</a-descriptions-item>
          <a-descriptions-item label="纳税人识别号">{{ t(data.tax_id) }}</a-descriptions-item>
          <a-descriptions-item label="开票电话">{{ t(data.invoice_phone) }}</a-descriptions-item>
          <a-descriptions-item label="开票地址" :span="2">{{ t(data.invoice_address) }}</a-descriptions-item>
        </a-descriptions>
      </div>
    </div>

    <!-- 地址信息 -->
    <div class="detail-section">
      <div class="section-title">
        地址信息
        <a-button type="link" size="small" @click="handleAddAddress" style="float: right; margin-top: -4px;">
          <template #icon><PlusOutlined /></template>新增地址
        </a-button>
      </div>
      <div class="section-body">
        <template v-if="addresses.length > 0">
          <a-tabs size="small">
            <a-tab-pane v-for="(addr, idx) in addresses" :key="addr.id" :tab="addr.address_type || `地址${idx + 1}`">
              <a-descriptions :column="4" size="small">
                <a-descriptions-item label="所在地区">{{ t(addr.region) }}</a-descriptions-item>
                <a-descriptions-item label="收货人">{{ t(addr.receiver) }}</a-descriptions-item>
                <a-descriptions-item label="手机">{{ t(addr.mobile) }}</a-descriptions-item>
                <a-descriptions-item label="电话">{{ t(addr.telephone) }}</a-descriptions-item>
                <a-descriptions-item label="详细地址" :span="3">{{ t(addr.detail_address) }}</a-descriptions-item>
                <a-descriptions-item label="传真">{{ t(addr.fax) }}</a-descriptions-item>
              </a-descriptions>
              <div style="text-align: right; margin-top: 4px;">
                <a-space>
                  <a-button type="link" size="small" @click="handleEditAddress(addr)"><template #icon><EditOutlined /></template>编辑</a-button>
                  <a-button type="link" danger size="small" @click="handleDeleteAddress(addr)"><template #icon><DeleteOutlined /></template>删除</a-button>
                </a-space>
              </div>
            </a-tab-pane>
          </a-tabs>
        </template>
        <template v-else>
          <a-empty description="暂无地址信息" :image-style="{ height: '40px' }" />
        </template>
      </div>
    </div>

    <!-- 附件信息 -->
    <div class="detail-section">
      <div class="section-title">附件信息</div>
      <div class="section-body">
        <div class="attachment-upload">
          <span style="margin-right: 8px;">上传文件：</span>
          <a-button size="small" @click="handleUploadClick">
            <template #icon><UploadOutlined /></template>上传文件
          </a-button>
          <span class="upload-hint">支持扩展名：PDF,Word,Excel,txt,JPG,PNG,BMP,GIF,RAR,ZIP</span>
          <input ref="fileInputRef" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.bmp,.gif,.rar,.zip" style="display: none" @change="handleFileChange" />
        </div>
        <template v-if="attachments.length > 0">
          <a-list size="small" :data-source="attachments" style="margin-top: 12px;">
            <template #renderItem="{ item }">
              <a-list-item>
                <a-list-item-meta>
                  <template #avatar>
                    <component :is="getFileIcon(item.file_name)" style="font-size: 24px; color: #666;" />
                  </template>
                  <template #title>{{ item.file_name }}</template>
                  <template #description>
                    {{ formatFileSize(item.file_size || 0) }} | 上传人: {{ item.uploaded_by || '-' }} | {{ formatDateTime(item.uploaded_at) }}
                  </template>
                </a-list-item-meta>
                <template #actions>
                  <a-button type="link" size="small" @click="handleDownload(item)"><DownloadOutlined /> 下载</a-button>
                  <a-button type="link" danger size="small" @click="handleDeleteAttachment(item)"><DeleteOutlined /> 删除</a-button>
                </template>
              </a-list-item>
            </template>
          </a-list>
        </template>
      </div>
    </div>

    <!-- 地址编辑弹窗 -->
    <a-modal v-model:open="addressModalVisible" :title="addressModalTitle" @ok="handleAddressSubmit" okText="确认" cancelText="取消" width="600px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="地址类型">
          <a-select v-model:value="addressForm.address_type">
            <a-select-option value="公司地址">公司地址</a-select-option>
            <a-select-option value="工厂地址">工厂地址</a-select-option>
            <a-select-option value="收货地址">收货地址</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="所在地区"><a-input v-model:value="addressForm.region" placeholder="请输入" /></a-form-item>
        <a-form-item label="详细地址"><a-input v-model:value="addressForm.detail_address" placeholder="请输入" /></a-form-item>
        <a-form-item label="收货人"><a-input v-model:value="addressForm.receiver" placeholder="请输入" /></a-form-item>
        <a-form-item label="手机"><a-input v-model:value="addressForm.mobile" placeholder="请输入" /></a-form-item>
        <a-form-item label="电话"><a-input v-model:value="addressForm.telephone" placeholder="请输入" /></a-form-item>
        <a-form-item label="传真"><a-input v-model:value="addressForm.fax" placeholder="请输入" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.customer-detail {
  padding: 0;
}

/* 顶部头区域 */
.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px 24px 10px;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
}
.header-left {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.back-btn {
  margin-top: 2px;
  color: #666;
}
.header-info {
  display: flex;
  flex-direction: column;
}
.customer-code {
  font-size: 12px;
  color: #999;
  margin-bottom: 2px;
}
.customer-name {
  font-size: 17px;
  font-weight: 600;
  color: #333;
}
.header-right {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  position: relative;
}
.status-stamp {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  transform: rotate(-15deg);
  border: 3px solid;
  opacity: 0.7;
}
.status-stamp.enabled {
  color: #52c41a;
  border-color: #52c41a;
  background: rgba(82, 196, 26, 0.06);
}
.status-stamp.disabled {
  color: #ff4d4f;
  border-color: #ff4d4f;
  background: rgba(255, 77, 79, 0.06);
}

/* 基本信息 */
.detail-basic {
  padding: 10px 24px;
  background: #fff;
  margin-bottom: 0;
}

/* 分区 */
.detail-section {
  margin-top: 4px;
  background: #fff;
}
.section-title {
  padding: 6px 24px;
  font-size: 14px;
  font-weight: 600;
  color: #333;
  background: #e8f4fd;
  border-left: 3px solid #1890ff;
}
.section-body {
  padding: 10px 24px;
}

/* 审核进度 */
.audit-body {
  background: #fafcff;
}
.audit-timeline {
  display: flex;
  align-items: flex-start;
  padding: 8px 0;
}
.audit-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 80px;
}
.audit-icon {
  width: 26px;
  height: 26px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #fff;
  margin-bottom: 4px;
}
.submit-icon {
  background: #1890ff;
}
.complete-icon {
  background: #52c41a;
}
.audit-label {
  font-size: 12px;
  font-weight: 600;
  color: #333;
  margin-bottom: 2px;
}
.audit-info {
  font-size: 11px;
  color: #999;
}
.audit-time {
  font-size: 11px;
  color: #999;
}
.audit-line {
  flex: 1;
  height: 2px;
  background: linear-gradient(to right, #1890ff, #52c41a);
  margin: 13px 12px 0;
  min-width: 80px;
}

/* 附件上传 */
.attachment-upload {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
.upload-hint {
  font-size: 12px;
  color: #999;
  margin-left: 12px;
}

:deep(.ant-descriptions-item-label) {
  color: #666;
  font-weight: normal;
}
:deep(.ant-descriptions-item-content) {
  color: #333;
}
</style>
