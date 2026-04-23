<template>
  <a-select
    v-model:value="selectedValue"
    show-search
    :placeholder="placeholder"
    :filter-option="filterOption"
    :loading="loading"
    :mode="mode"
    :allow-clear="allowClear"
    :style="{ width: width }"
    @change="handleChange"
  >
    <a-select-option v-for="item in options" :key="item.supplier_number" :value="item.supplier_number">
      {{ item.supplier_number }} - {{ item.supplier_name }}
    </a-select-option>
  </a-select>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getSuppliers } from '@/api/master-data/supplier'

const props = withDefaults(defineProps<{
  modelValue?: string | string[]
  placeholder?: string
  mode?: 'multiple' | 'tags' | undefined
  allowClear?: boolean
  width?: string
}>(), {
  placeholder: '请选择供应商',
  allowClear: true,
  width: '100%',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | string[] | undefined): void
  (e: 'change', value: string | string[] | undefined, item?: any): void
}>()

const loading = ref(false)
const options = ref<any[]>([])
const selectedValue = ref<string | string[] | undefined>(props.modelValue)

const filterOption = (input: string, option: any) => {
  const item = options.value.find(o => o.supplier_number === option.value)
  return item?.supplier_name?.toLowerCase().includes(input.toLowerCase()) ||
         item?.supplier_number?.toLowerCase().includes(input.toLowerCase()) ||
         false
}

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getSuppliers({ page: 1, limit: 500 })
    options.value = (res.data?.items || res.items || []) as any[]
  } catch { /* ignore */ }
  finally { loading.value = false }
}

const handleChange = (value: string | string[] | undefined) => {
  emit('update:modelValue', value)
  const item = options.value.find(o => o.supplier_number === value)
  emit('change', value, item)
}

onMounted(fetchData)
</script>
