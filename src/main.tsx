import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import App from "./App.tsx";
import "./index.css";
import { wagmiConfig } from "./lib/wagmi";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <WagmiProvider config={wagmiConfig}>
    <QueryClientProvider client={queryClient}>
      <RainbowKitProvider
        theme={darkTheme({
          accentColor: "hsl(174 56% 56%)",
          accentColorForeground: "hsl(215 21% 7%)",
          borderRadius: "medium",
          overlayBlur: "small",
        })}
      >
        <App />
      </RainbowKitProvider>
    </QueryClientProvider>
  </WagmiProvider>,
);
