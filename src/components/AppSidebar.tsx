import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Home,
  LayoutDashboard,
  Boxes,
  ArrowLeftRight,
  Network as NetIcon,
  Activity,
  Zap,
  Compass,
  Shield,
  Globe,
  FileText,
  Rocket,
  Sparkles,
} from "lucide-react";

const explorerItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Blocks", url: "/blocks", icon: Boxes },
  { title: "Transactions", url: "/transactions", icon: ArrowLeftRight },
  { title: "Network", url: "/network", icon: NetIcon },
  { title: "Uptime", url: "/uptime", icon: Activity },
];

const chainItems = [
  { title: "Swap", url: "/swap", icon: ArrowLeftRight },
  { title: "Deploy Token", url: "/deploy", icon: Rocket },
  { title: "Terminal", url: "/terminal", icon: Zap },
  { title: "Ecosystem", url: "/ecosystem", icon: Compass },
  { title: "Parameters", url: "/parameters", icon: Shield },
];

const litvmItems = [
  { title: "LiteForge Explorer", url: "https://liteforge.explorer.caldera.xyz", icon: Globe, external: true },
  { title: "Docs", url: "https://docs.litvm.io", icon: FileText, external: true },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar/80 backdrop-blur-xl">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-violet shadow-glow-violet">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
            <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-display text-lg font-bold text-gradient-aurora">LitVM</div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Explorer · v2</div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-[10px] font-semibold tracking-[0.25em] text-muted-foreground/70">
            Explorer
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {explorerItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={`group relative h-10 rounded-xl transition-all data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium hover:bg-sidebar-accent`}
                    >
                      <RouterNavLink to={item.url} end>
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-violet shadow-glow-violet" />
                        )}
                        <item.icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} />
                        <span>{item.title}</span>
                      </RouterNavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-[10px] font-semibold tracking-[0.25em] text-muted-foreground/70">
            DeFi
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {chainItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className="group relative h-10 rounded-xl transition-all data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium hover:bg-sidebar-accent"
                    >
                      <RouterNavLink to={item.url}>
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-violet shadow-glow-violet" />
                        )}
                        <item.icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} />
                        <span>{item.title}</span>
                      </RouterNavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-[10px] font-semibold tracking-[0.25em] text-muted-foreground/70">
            External
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {litvmItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    className="h-10 rounded-xl transition-all hover:bg-sidebar-accent"
                  >
                    <a href={item.url} target="_blank" rel="noreferrer">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        {!collapsed ? (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-primary">
              <span className="status-dot" /> Network Live
            </div>
            <div className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              LitVM LiteForge · Chain 4441
              <br />© 2026 LiteForge
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <span className="status-dot" />
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
