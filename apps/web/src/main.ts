// コンポーネントより先に読み込むのは、base.css が宣言する層の順（reset, base, components）を先に決めるため
import "./styles/tokens.css";
import "./styles/base.css";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { createApp } from "vue";
import App from "./App.vue";
import { prepareStartup } from "./persistence/startup.ts";

const startup = await prepareStartup();

createApp(App, { startup }).mount("#root");
