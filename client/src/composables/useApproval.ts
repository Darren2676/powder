import { ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { createVNode } from 'vue'
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'

/**
 * 通用审核操作 composable
 * 封装审核、撤消操作逻辑
 */
export function useApproval(fetchData: () => Promise<void>) {
  const approving = ref(false)

  /** 审核 */
  const handleApprove = async (
    record: any,
    approveFn: (id: string | number) => Promise<any>,
    nameLabel = '记录'
  ) => {
    try {
      const res = await approveFn(record.id || record.customer_id || record.supplier_id || record.number)
      if (res.success || res.data) {
        message.success(`${nameLabel}审核成功`)
        await fetchData()
      }
    } catch {
      message.error(`${nameLabel}审核失败`)
    }
  }

  /** 撤消审核 */
  const handleWithdraw = async (
    record: any,
    withdrawFn: (id: string | number) => Promise<any>,
    nameLabel = '记录'
  ) => {
    Modal.confirm({
      title: '确认撤消',
      icon: createVNode(ExclamationCircleOutlined),
      content: `确定要撤消该${nameLabel}的审核吗？`,
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await withdrawFn(record.id || record.customer_id || record.supplier_id || record.number)
          if (res.success || res.data) {
            message.success(`${nameLabel}已撤消`)
            await fetchData()
          }
        } catch {
          message.error(`${nameLabel}撤消失败`)
        }
      },
    })
  }

  /** 提交审批（通用审批流程） */
  const handleSubmitApproval = async (
    record: any,
    submitFn: (params: any) => Promise<any>,
    businessType: string,
    nameLabel = '记录'
  ) => {
    try {
      const res = await submitFn({
        business_type: businessType,
        business_id: record.id || record.number,
        business_number: record.number || record.order_number || record.id,
      })
      if (res.success || res.data) {
        message.success(`${nameLabel}已提交审批`)
        await fetchData()
      }
    } catch {
      message.error(`${nameLabel}提交审批失败`)
    }
  }

  /** 反审 */
  const handleReverse = async (
    record: any,
    reverseFn: (params: any) => Promise<any>,
    businessType: string,
    nameLabel = '记录'
  ) => {
    Modal.confirm({
      title: '确认反审',
      icon: createVNode(ExclamationCircleOutlined),
      content: `确定要反审该${nameLabel}吗？反审后将恢复为未审核状态。`,
      okText: '确定',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await reverseFn({
            business_type: businessType,
            business_id: record.id || record.number,
          })
          if (res.success || res.data) {
            message.success(`${nameLabel}已反审`)
            await fetchData()
          }
        } catch {
          message.error(`${nameLabel}反审失败`)
        }
      },
    })
  }

  return {
    approving,
    handleApprove,
    handleWithdraw,
    handleSubmitApproval,
    handleReverse,
  }
}
