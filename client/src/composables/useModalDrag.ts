import { reactive, computed, onBeforeUnmount } from 'vue'

/**
 * 为 a-modal 提供鼠标拖拽移动能力
 * @returns modalStyle - 绑定到 a-modal 的 :style
 * @returns onDragStart - 绑定到标题栏的 @mousedown
 * @returns resetDrag - 打开弹窗时调用，重置位置
 */
export function useModalDrag() {
  const dragState = reactive({ dragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 })

  const modalStyle = computed(() => ({
    transform: `translate(${dragState.offsetX}px, ${dragState.offsetY}px)`,
  }))

  function onDragStart(e: MouseEvent) {
    e.preventDefault()
    dragState.dragging = true
    dragState.startX = e.clientX - dragState.offsetX
    dragState.startY = e.clientY - dragState.offsetY
    document.addEventListener('mousemove', onDragMove)
    document.addEventListener('mouseup', onDragStop)
  }

  function onDragMove(e: MouseEvent) {
    if (!dragState.dragging) return
    dragState.offsetX = e.clientX - dragState.startX
    dragState.offsetY = e.clientY - dragState.startY
  }

  function onDragStop() {
    dragState.dragging = false
    document.removeEventListener('mousemove', onDragMove)
    document.removeEventListener('mouseup', onDragStop)
  }

  function resetDrag() {
    dragState.offsetX = 0
    dragState.offsetY = 0
  }

  onBeforeUnmount(() => {
    document.removeEventListener('mousemove', onDragMove)
    document.removeEventListener('mouseup', onDragStop)
  })

  return { modalStyle, onDragStart, resetDrag }
}
