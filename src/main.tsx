import { createRoot } from "react-dom/client";
import App from "@/App";
import "@/index.css";

// No StrictMode on purpose: the camera + AudioWorklet lifecycle is expensive to
// double-mount, and double getUserMedia calls can leave a stale MediaStream behind.
createRoot(document.getElementById("root")!).render(<App />);
