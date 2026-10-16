/* @refresh reload */
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { render } from "@solidjs/web";
import App from "./App.tsx";
import { prepareStartup } from "./editor/startup.ts";
import "./app.css";

const root = document.getElementById("root");
const startup = await prepareStartup();

render(() => <App startup={startup} />, root!);
