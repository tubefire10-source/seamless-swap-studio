import { Outlet } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Search, Bell } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AuroraBackground } from "./AuroraBackground";

export function AppLayout() {
  return (
    <SidebarProvider>
      <AuroraBackground />
      <div className="relative flex min-h-screen w-full">
        <AppSidebar />

        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/40 bg-background/40 px-4 backdrop-blur-xl md:px-6">
            <SidebarTrigger className="text-muted-foreground hover:text-primary" />

            <div className="relative hidden flex-1 max-w-xl md:block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search blocks, transactions, addresses…"
                className="h-10 w-full rounded-xl border border-border/60 bg-surface/60 pl-11 pr-4 text-sm placeholder:text-muted-foreground/70 backdrop-blur-sm focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button className="hidden h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-surface/60 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary md:flex">
                <Bell className="h-4 w-4" />
              </button>
              <ConnectButton
                showBalance={{ smallScreen: false, largeScreen: true }}
                chainStatus="icon"
                accountStatus={{ smallScreen: "avatar", largeScreen: "address" }}
              />
            </div>
          </header>

          <main className="flex-1 overflow-x-hidden p-4 md:p-8">
            <div className="mx-auto max-w-7xl animate-fade-in">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
