import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/app/App";
import "./styles/index.css";
import { installNativeMenuGuard } from "@/app/nativeMenu";
import { installTooltips } from "@/ui/tooltip";

installNativeMenuGuard();
installTooltips();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
