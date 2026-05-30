import { createRouter, createWebHistory } from 'vue-router'

const routes = [
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
      { path: 'orders', name: 'OrderList', component: () => import('@/views/OrderList.vue'), meta: { title: '订单列表' } },
      { path: 'order-create', name: 'OrderCreate', component: () => import('@/views/OrderCreate.vue'), meta: { title: '新建订单' } },
      { path: 'order/:id', name: 'OrderDetail', component: () => import('@/views/OrderDetail.vue'), meta: { title: '订单详情' } },
      { path: 'shipping', name: 'ShippingList', component: () => import('@/views/ShippingList.vue'), meta: { title: '发货单查询' } },
      { path: 'shipping/:id', name: 'ShippingDetail', component: () => import('@/views/ShippingDetail.vue'), meta: { title: '发货单详情' } },
      { path: 'shipping-summary', name: 'ShippingSummary', component: () => import('@/views/ShippingSummary.vue'), meta: { title: '发货按订单汇总表' } },
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.requiresAuth && !token) {
    next('/login')
  } else if (to.meta.guestOnly && token) {
    next('/home')
  } else {
    next()
  }
})

export default router
