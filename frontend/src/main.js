import { createApp } from 'vue'
import { createBootstrap } from 'bootstrap-vue-next'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import 'bootstrap-icons/font/bootstrap-icons.css'
import 'bootstrap-vue-next/dist/bootstrap-vue-next.css'
import './styles.css'
import App from './App.vue'
import router from './router'

window.addEventListener('auth:expired', () => {
  if (router.currentRoute.value.name !== 'login') {
    router.replace({
      name: 'login',
      query: {
        expired: '1',
        redirect: router.currentRoute.value.fullPath,
      },
    })
  }
})

createApp(App).use(router).use(createBootstrap()).mount('#app')
