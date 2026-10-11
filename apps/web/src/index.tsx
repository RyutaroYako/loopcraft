/* @refresh reload */
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { render } from "@solidjs/web";
import App from "./App.tsx";
import "./styles.css";

const root = document.getElementById("root");

render(() => <App />, root!);
