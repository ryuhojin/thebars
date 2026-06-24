import React from "react";
import ReactDOM from "react-dom/client";
import { AdminApp } from "./app/router/AdminApp";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>
);
