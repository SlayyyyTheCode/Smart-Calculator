import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";
import { App } from "./app";
import { requestPersistence } from "./persistence";

// Asked for once, at startup, before anything is written. Browsers grant it
// silently to an installed app and may refuse a page opened once; refusal is
// not an error, and the Settings screen reports which happened.
void requestPersistence();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
