import React from "react";
import ReactDOM from "react-dom/client";
import { CustomerApp } from "./app/router/CustomerApp";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <CustomerApp />
  </React.StrictMode>
);
