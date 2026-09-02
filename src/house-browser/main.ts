import { createApp } from 'vue'
import '../ui-vue/tailwind.css'
import './style.css'
import App from './App.vue'

const root = document.getElementById('house-browser-root')
if (!root) throw new Error('#house-browser-root missing')

createApp(App).mount(root)
