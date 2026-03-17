<script setup lang="ts">
import { ref, onMounted } from 'vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { PieChart, BarChart, LineChart } from 'echarts/charts';
import { 
  TitleComponent, 
  TooltipComponent, 
  LegendComponent, 
  GridComponent 
} from 'echarts/components';
import * as dashboardApi from '@/api/dashboard';

// 注册 ECharts 组件
use([
  CanvasRenderer,
  PieChart, 
  BarChart, 
  LineChart,
  TitleComponent, 
  TooltipComponent, 
  LegendComponent, 
  GridComponent
]);
import type { DashboardStats } from '@/types';
import { 
  FileTextOutlined, 
  ClockCircleOutlined, 
  SyncOutlined, 
  CheckCircleOutlined 
} from '@ant-design/icons-vue';
import dayjs from 'dayjs';

const loading = ref(false);
const stats = ref<DashboardStats | null>(null);
const statusDistribution = ref<Record<string, number>>({});
const priorityDistribution = ref<Record<string, number>>({});
const assigneeWorkload = ref<Array<{ name: string; count: number }>>([]);
const trend = ref<Array<{ date: string; count: number }>>([]);

// 状态饼图配置
const statusChartOption = ref({});

// 优先级柱状图配置
const priorityChartOption = ref({});

// 趋势折线图配置
const trendChartOption = ref({});

// 工作负载柱状图配置
const workloadChartOption = ref({});

const fetchData = async () => {
  loading.value = true;
  try {
    // 获取统计数据
    const statsRes: any = await dashboardApi.getStats();
    if (statsRes.success) {
      stats.value = statsRes.data;
    }

    // 获取状态分布
    const statusRes: any = await dashboardApi.getStatusDistribution();
    if (statusRes.success) {
      statusDistribution.value = statusRes.data;
      updateStatusChart();
    }

    // 获取优先级分布
    const priorityRes: any = await dashboardApi.getPriorityDistribution();
    if (priorityRes.success) {
      priorityDistribution.value = priorityRes.data;
      updatePriorityChart();
    }

    // 获取工作负载
    const workloadRes: any = await dashboardApi.getAssigneeWorkload();
    if (workloadRes.success) {
      assigneeWorkload.value = workloadRes.data;
      updateWorkloadChart();
    }

    // 获取趋势数据(最近30天)
    const endDate = dayjs().format('YYYY-MM-DD');
    const startDate = dayjs().subtract(30, 'day').format('YYYY-MM-DD');
    const trendRes: any = await dashboardApi.getTrend(startDate, endDate);
    if (trendRes.success) {
      trend.value = trendRes.data;
      updateTrendChart();
    }
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error);
  } finally {
    loading.value = false;
  }
};

const updateStatusChart = () => {
  const statusMap: Record<string, string> = {
    pending: '待处理',
    in_progress: '处理中',
    completed: '已完成',
    closed: '已关闭'
  };

  statusChartOption.value = {
    title: {
      text: '工单状态分布',
      left: 'center'
    },
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      right: 10,
      top: 'center'
    },
    series: [
      {
        type: 'pie',
        radius: '60%',
        data: Object.entries(statusDistribution.value).map(([key, value]) => ({
          name: statusMap[key] || key,
          value
        })),
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }
    ]
  };
};

const updatePriorityChart = () => {
  const priorityMap: Record<string, string> = {
    low: '低',
    medium: '中',
    high: '高',
    urgent: '紧急'
  };

  priorityChartOption.value = {
    title: {
      text: '优先级分布',
      left: 'center'
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      }
    },
    xAxis: {
      type: 'category',
      data: Object.keys(priorityDistribution.value).map(key => priorityMap[key] || key)
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        type: 'bar',
        data: Object.values(priorityDistribution.value),
        itemStyle: {
          color: '#1890ff'
        }
      }
    ]
  };
};

const updateTrendChart = () => {
  trendChartOption.value = {
    title: {
      text: '工单创建趋势(最近30天)',
      left: 'center'
    },
    tooltip: {
      trigger: 'axis'
    },
    xAxis: {
      type: 'category',
      data: trend.value.map(item => dayjs(item.date).format('MM-DD')),
      boundaryGap: false
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        type: 'line',
        data: trend.value.map(item => item.count),
        smooth: true,
        itemStyle: {
          color: '#52c41a'
        },
        areaStyle: {
          color: 'rgba(82, 196, 26, 0.2)'
        }
      }
    ]
  };
};

const updateWorkloadChart = () => {
  workloadChartOption.value = {
    title: {
      text: '处理人工作负载',
      left: 'center'
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      }
    },
    xAxis: {
      type: 'category',
      data: assigneeWorkload.value.map(item => item.name),
      axisLabel: {
        rotate: 45
      }
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        type: 'bar',
        data: assigneeWorkload.value.map(item => item.count),
        itemStyle: {
          color: '#ff7875'
        }
      }
    ]
  };
};

onMounted(() => {
  fetchData();
});
</script>

<template>
  <div class="dashboard-container">
    <a-spin :spinning="loading">
      <!-- Statistics Cards -->
      <a-row :gutter="16" style="margin-bottom: 24px;">
        <a-col :xs="24" :sm="12" :md="6">
          <a-card>
            <a-statistic
              title="总工单"
              :value="stats?.total || 0"
              :value-style="{ color: '#1890ff' }"
            >
              <template #prefix><FileTextOutlined /></template>
            </a-statistic>
          </a-card>
        </a-col>
        <a-col :xs="24" :sm="12" :md="6">
          <a-card>
            <a-statistic
              title="待处理"
              :value="stats?.pending || 0"
              :value-style="{ color: '#faad14' }"
            >
              <template #prefix><ClockCircleOutlined /></template>
            </a-statistic>
          </a-card>
        </a-col>
        <a-col :xs="24" :sm="12" :md="6">
          <a-card>
            <a-statistic
              title="处理中"
              :value="stats?.in_progress || 0"
              :value-style="{ color: '#13c2c2' }"
            >
              <template #prefix><SyncOutlined /></template>
            </a-statistic>
          </a-card>
        </a-col>
        <a-col :xs="24" :sm="12" :md="6">
          <a-card>
            <a-statistic
              title="已完成"
              :value="stats?.completed || 0"
              :value-style="{ color: '#52c41a' }"
            >
              <template #prefix><CheckCircleOutlined /></template>
            </a-statistic>
          </a-card>
        </a-col>
      </a-row>

      <!-- Charts Row 1 -->
      <a-row :gutter="16" style="margin-bottom: 24px;">
        <a-col :xs="24" :md="12">
          <a-card>
            <VChart :option="statusChartOption" style="height: 400px;" />
          </a-card>
        </a-col>
        <a-col :xs="24" :md="12">
          <a-card>
            <VChart :option="priorityChartOption" style="height: 400px;" />
          </a-card>
        </a-col>
      </a-row>

      <!-- Charts Row 2 -->
      <a-row :gutter="16">
        <a-col :xs="24" :md="12">
          <a-card>
            <VChart :option="trendChartOption" style="height: 400px;" />
          </a-card>
        </a-col>
        <a-col :xs="24" :md="12">
          <a-card>
            <VChart :option="workloadChartOption" style="height: 400px;" />
          </a-card>
        </a-col>
      </a-row>
    </a-spin>
  </div>
</template>

<style scoped>
.dashboard-container {
  background: #f0f2f5;
}
</style>
