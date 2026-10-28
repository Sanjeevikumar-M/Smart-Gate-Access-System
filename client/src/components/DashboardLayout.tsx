import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import {
  Activity,
  BadgeAlert,
  BookOpenText,
  Cable,
  ChartNoAxesCombined,
  ChevronRight,
  ContactRound,
  LayoutDashboard,
  LogOut,
  Radio,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { useLocation } from "wouter";

const menuItems = [
  { icon: LayoutDashboard, label: "Command Centre", path: "/dashboard" },
  { icon: ContactRound, label: "Identity Directory", path: "/users" },
  { icon: Activity, label: "Access History", path: "/access-logs" },
  { icon: BadgeAlert, label: "Security Events", path: "/security-alerts" },
  { icon: Cable, label: "Gate Device", path: "/devices" },
  { icon: ChartNoAxesCombined, label: "Analytics", path: "/analytics" },
  { icon: Radio, label: "Simulation Console", path: "/simulator" },
  { icon: Settings2, label: "Gate Settings", path: "/settings" },
  { icon: BookOpenText, label: "Academic Report", path: "/report" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, logout } = useAuth();
  const [location, setLocation] = useLocation();

  if (loading) {
    return <div className="min-h-screen bg-[#071722]" />;
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#071722] grid place-items-center px-5 text-white">
        <section className="max-w-md rounded-[2rem] border border-white/10 bg-[#0d2634] p-10 text-center shadow-2xl shadow-black/30">
          <div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-400 text-[#06202c]">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Secure session required</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Gate operations console</h1>
          <p className="mt-4 text-sm leading-6 text-slate-300">Sign in to view monitored devices, security events, and access controls.</p>
          <Button onClick={() => startLogin()} className="mt-8 w-full bg-emerald-400 text-[#06202c] hover:bg-emerald-300">Continue securely</Button>
        </section>
      </main>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r border-white/10 bg-[#071722] text-slate-200">
        <SidebarHeader className="h-[88px] px-3 py-4">
          <button onClick={() => setLocation("/dashboard")} className="flex items-center gap-3 text-left group-data-[collapsible=icon]:justify-center">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400 text-[#06202c] shadow-lg shadow-emerald-900/20"><ShieldCheck className="h-5 w-5" /></div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-semibold tracking-wide text-white">SENTINEL GATE</p>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.19em] text-emerald-300">Access intelligence</p>
            </div>
          </button>
        </SidebarHeader>
        <SidebarContent className="px-2 py-3">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 group-data-[collapsible=icon]:hidden">Operations</p>
          <SidebarMenu>
            {menuItems.map(({ icon: Icon, label, path }) => (
              <SidebarMenuItem key={path}>
                <SidebarMenuButton
                  isActive={location === path}
                  onClick={() => setLocation(path)}
                  tooltip={label}
                  className="h-10 rounded-xl text-slate-400 hover:bg-white/7 hover:text-white data-[active=true]:bg-emerald-400 data-[active=true]:text-[#06202c]"
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 px-1 py-1 group-data-[collapsible=icon]:justify-center">
            <Avatar className="h-9 w-9 border border-white/10"><AvatarFallback className="bg-[#163747] text-emerald-300">{user.name?.slice(0, 1).toUpperCase() ?? "U"}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-medium text-white">{user.name ?? "Operations user"}</p>
              <p className="truncate text-xs capitalize text-slate-400">{user.role.replace("_", " ")}</p>
            </div>
            <button onClick={logout} className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white group-data-[collapsible=icon]:hidden" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-h-screen bg-[#f3f7f7]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-[#f3f7f7]/90 px-4 backdrop-blur md:px-7">
          <SidebarTrigger className="rounded-lg border border-slate-200 bg-white md:hidden" />
          <div className="hidden items-center gap-2 text-xs text-slate-400 md:flex"><span>Operations</span><ChevronRight className="h-3 w-3" /><span className="font-medium text-slate-600">{menuItems.find(item => item.path === location)?.label ?? "Console"}</span></div>
          <div className="ml-auto flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Monitoring active</div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] p-4 md:p-7">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
