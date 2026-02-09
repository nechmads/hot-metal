import "./styles.css";
import { createRoot } from "react-dom/client";
import App from "./app";
import { Providers } from "@/providers";

const root = createRoot(document.getElementById("app")!);

root.render(
  <Providers>
    <div className="bg-white text-[#0a0a0a] antialiased transition-colors selection:bg-amber-200 selection:text-amber-900 dark:bg-[#0a0a0a] dark:text-[#fafafa]" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
      <App />
    </div>
  </Providers>
);
