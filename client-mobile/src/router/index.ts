import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { guestOnly: true }
  },
  {
    path: '/',
    component: () => import('@/views/Layout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/home' },
      { path: 'home', name: 'Home', component: () => import('@/views/Home.vue'), meta: { title: '首页' } },
      { path: 'tasks', name: 'TaskList', component: () => import('@/views/TaskList.vue'), meta: { title: '我的任务' } },
      { path: 'profile', name: 'Profile', component: () => import('@/views/Profile.vue'), meta: { title: '我的' } }
    ]
  },
  {
    path: '/order/:id',
    name: 'OrderDetail',
    component: () => import('@/views/OrderDetail.vue'),
    meta: { requiresAuth: true, title: '生产单详情' }
  },
  {
    path: '/material/:id',
    name: 'MaterialPrep',
    component: () => import('@/views/MaterialPrep.vue'),
    meta: { requiresAuth: true, title: '备料操作' }
  },
  {
    path: '/process-prep',
    name: 'ProcessPrepEntry',
    component: () => import('@/views/ProcessPrepEntry.vue'),
    meta: { requiresAuth: true, title: '按工序备料' }
  },
  {
    path: '/process-prep/:orderNo',
    name: 'ProcessPrepAction',
    component: () => import('@/views/ProcessPrepAction.vue'),
    meta: { requiresAuth: true, title: '按工序备料' }
  },
  {
    path: '/report/:taskId',
    name: 'WorkReport',
    component: () => import('@/views/WorkReport.vue'),
    meta: { requiresAuth: true, title: '快速报工' }
  },
  {
    path: '/history',
    name: 'ReportHistory',
    component: () => import('@/views/ReportHistory.vue'),
    meta: { requiresAuth: true, title: '报工历史' }
  },
  {
    path: '/scan-report',
    name: 'ScanReportEntry',
    component: () => import('@/views/ScanReportEntry.vue'),
    meta: { requiresAuth: true, title: '扫码报工' }
  },
  {
    path: '/scan-report/:orderNo',
    name: 'OrderWorkReport',
    component: () => import('@/views/OrderWorkReport.vue'),
    meta: { requiresAuth: true, title: '按工序报工' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫
router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token')
  const isLoggedIn = !!token

  if (to.meta.requiresAuth && !isLoggedIn) {
    next('/login')
  } else if (to.meta.guestOnly && isLoggedIn) {
    next('/home')
  } else {
    next()
  }
})

export default router
