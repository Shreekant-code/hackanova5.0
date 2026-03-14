import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import "react-toastify/dist/ReactToastify.css";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <ToastContainer
          position="top-right"
          autoClose={2600}
          hideProgressBar={false}
          closeOnClick
          pauseOnFocusLoss
          pauseOnHover
          draggable
          theme="light"
        />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
