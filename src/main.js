// main.js

import { mount } from "svelte"
import App from "./App.svelte"

let app = mount(App, {
    target: document.body
})

export default app
