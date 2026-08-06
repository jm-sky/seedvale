import { createApp } from './app/createApp'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) {
  throw new Error('#app not found')
}

void createApp(root)
