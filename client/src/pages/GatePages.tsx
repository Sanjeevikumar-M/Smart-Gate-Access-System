import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeAlert,
  BookOpenText,
  Cable,
  ChartNoAxesCombined,
  CheckCircle2,
  Clock3,
  ContactRound,
  Cpu,
  DoorOpen,
  Fingerprint,
  Gauge,
  KeyRound,
  LockKeyhole,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Siren,
  UserRoundPlus,
  Users,
  Wifi,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const dateFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" });

function pageTitle(eyebrow: string, title: string, description: string) {
  return (
    <div className="mb-7">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#102c3b] md:text-4xl">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function StatusBadge({ value }: { value: string | null | undefined }) {
  const normalized = value?.toLowerCase() ?? "unknown";
  const style = normalized.includes("critical") || normalized === "alert" || normalized === "offline" || normalized === "denied" || normalized === "revoked"
    ? "bg-rose-50 text-rose-700 border-rose-100"
    : normalized.includes("warning") || normalized.includes("opening") || normalized.includes("closing") || normalized.includes("suspended")
      ? "bg-amber-50 text-amber-700 border-amber-100"
      : "bg-emerald-50 text-emerald-700 border-emerald-100";
  return <Badge variant="outline" className={`border px-2.5 py-1 font-medium capitalize ${style}`}>{(value ?? "unknown").replaceAll("_", " ")}</Badge>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="grid min-h-32 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-sm text-slate-400">{label}</div>;
}

function useLiveRefresh() {
  const utils = trpc.useUtils();
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws/dashboard`);
    socket.onmessage = () => {
      void utils.dashboard.snapshot.invalidate();
      void utils.analytics.summary.invalidate();
      void utils.alerts.list.invalidate();
      void utils.devices.list.invalidate();
      void utils.gate.status.invalidate();
    };
    return () => socket.close();
  }, [utils]);
}

export function DashboardPage() {
  useLiveRefresh();
  const utils = trpc.useUtils();
  const { data, isLoading, isError, error, refetch } = trpc.dashboard.snapshot.useQuery(undefined, { refetchInterval: 5000 });
  const control = trpc.gate.control.useMutation({
    onSuccess: () => { toast.success("Gate command queued for device execution"); void utils.dashboard.snapshot.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const simulator = trpc.simulator.run.useMutation({
    onSuccess: () => { toast.success("Simulation event processed through the device contract"); void utils.dashboard.snapshot.invalidate(); },
    onError: error => toast.error(error.message),
  });

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !data) {
    return <Card className="max-w-2xl border-0 shadow-sm"><CardContent className="p-7"><div className="grid h-12 w-12 place-items-center rounded-xl bg-rose-50 text-rose-700"><AlertTriangle className="h-6 w-6" /></div><h1 className="mt-5 text-2xl font-semibold text-[#102c3b]">Monitoring data is unavailable</h1><p className="mt-3 text-sm leading-6 text-slate-600">{error?.message ?? "The dashboard did not receive a valid snapshot from the monitoring service."}</p><Button onClick={() => void refetch()} className="mt-6 bg-[#102c3b]"><RefreshCw className="mr-2 h-4 w-4" /> Retry data request</Button></CardContent></Card>;
  }
  const isOpen = data.gate.gateState === "open" || data.gate.gateState === "opening";
  const metrics = [
    { label: "Gate status", value: data.gate.gateState, icon: DoorOpen, tone: isOpen ? "text-amber-600 bg-amber-50" : "text-emerald-700 bg-emerald-50" },
    { label: "Today’s accesses", value: String(data.metrics.total), icon: Activity, tone: "text-sky-700 bg-sky-50" },
    { label: "Authorized", value: String(data.metrics.authorized), icon: ShieldCheck, tone: "text-emerald-700 bg-emerald-50" },
    { label: "Denied", value: String(data.metrics.denied), icon: ShieldAlert, tone: "text-rose-700 bg-rose-50" },
    { label: "Active alerts", value: String(data.metrics.activeAlerts), icon: BadgeAlert, tone: "text-amber-700 bg-amber-50" },
    { label: "Device", value: data.device?.status ?? "offline", icon: Wifi, tone: data.device?.status === "online" ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50" },
  ];

  return (
    <>
      {pageTitle("Secure operations", "Command centre", "A live view of access activity, device state, and physical gate controls. Dashboard data refreshes every five seconds if the live channel is unavailable.")}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {metrics.map(({ label, value, icon: Icon, tone }) => <Card key={label} className="border-0 shadow-sm"><CardContent className="p-4"><div className="flex items-start justify-between"><p className="text-xs font-medium text-slate-500">{label}</p><div className={`grid h-8 w-8 place-items-center rounded-lg ${tone}`}><Icon className="h-4 w-4" /></div></div><p className="mt-5 text-xl font-semibold capitalize text-[#102c3b]">{value.replaceAll("_", " ")}</p></CardContent></Card>)}
      </section>
      <section className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <Card className="overflow-hidden border-0 shadow-sm">
          <CardContent className="relative min-h-[340px] overflow-hidden bg-[#0a2634] p-6 text-white">
            <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 75% 15%, #3bb58b 0, transparent 28%), linear-gradient(115deg, transparent 50%, #17485e 50%)" }} />
            <div className="relative flex h-full flex-col">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Live gate panel</p><h2 className="mt-2 text-3xl font-semibold">Main entrance</h2><p className="mt-1 text-sm text-slate-300">{data.device?.deviceName ?? "No device registered"}</p></div><StatusBadge value={data.device?.status} /></div>
              <div className="my-auto grid grid-cols-[1fr_auto_1fr] items-end gap-3 pt-7">
                <div className="h-28 rounded-tl-[3rem] border-l-8 border-t-8 border-emerald-300/80 bg-emerald-300/10" />
                <div className="mb-3 h-2 w-10 rounded-full bg-slate-100/70" />
                <div className={`h-28 rounded-tr-[3rem] border-r-8 border-t-8 transition-transform duration-500 ${isOpen ? "translate-x-12 rotate-[-12deg] border-amber-300 bg-amber-300/10" : "border-emerald-300/80 bg-emerald-300/10"}`} />
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/15 p-3"><div><p className="text-[10px] uppercase tracking-widest text-slate-400">Current state</p><p className="mt-1 text-lg font-semibold capitalize">{data.gate.gateState}</p></div><div><p className="text-[10px] uppercase tracking-widest text-slate-400">Mode</p><p className="mt-1 text-lg font-semibold capitalize">{data.gate.gateMode.replace("_", " ")}</p></div><div><p className="text-[10px] uppercase tracking-widest text-slate-400">Auto-close</p><p className="mt-1 text-lg font-semibold">{data.gate.autoCloseTimeoutSeconds}s</p></div></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="text-lg text-[#102c3b]">Manual control</CardTitle><CardDescription>Commands are queued for the connected device and recorded in the audit log.</CardDescription></CardHeader><CardContent className="space-y-3"><Button disabled={control.isPending} onClick={() => control.mutate({ action: "open" })} className="h-12 w-full bg-emerald-600 hover:bg-emerald-700"><ArrowUpRight className="mr-2 h-4 w-4" /> Open gate</Button><Button disabled={control.isPending} onClick={() => control.mutate({ action: "close" })} variant="outline" className="h-12 w-full border-slate-200 bg-white text-[#102c3b]"><ArrowDownRight className="mr-2 h-4 w-4" /> Close gate</Button><Button disabled={control.isPending} onClick={() => control.mutate({ action: "auto" })} variant="ghost" className="h-12 w-full text-emerald-700 hover:bg-emerald-50"><RotateCcw className="mr-2 h-4 w-4" /> Enable auto mode</Button><div className="border-t border-slate-100 pt-4"><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Quick simulation</p><div className="grid grid-cols-2 gap-2"><Button onClick={() => simulator.mutate({ scenario: "authorized" })} disabled={simulator.isPending} variant="outline" className="text-xs"><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Authorized</Button><Button onClick={() => simulator.mutate({ scenario: "unauthorized" })} disabled={simulator.isPending} variant="outline" className="text-xs"><XCircle className="mr-1.5 h-3.5 w-3.5" /> Denied</Button></div></div></CardContent></Card>
      </section>
      <section className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <Card className="border-0 shadow-sm"><CardHeader className="flex-row items-center justify-between"><div><CardTitle className="text-lg text-[#102c3b]">Recent access activity</CardTitle><CardDescription>Latest authorization outcomes recorded by the gate.</CardDescription></div><Activity className="h-5 w-5 text-emerald-600" /></CardHeader><CardContent>{data.recentAccess.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-y border-slate-100 text-xs uppercase tracking-wider text-slate-400"><tr><th className="py-3 font-medium">Identity</th><th className="py-3 font-medium">RFID</th><th className="py-3 font-medium">Time</th><th className="py-3 text-right font-medium">Result</th></tr></thead><tbody>{data.recentAccess.map(row => <tr className="border-b border-slate-50 last:border-0" key={row.log.id}><td className="py-3 font-medium text-[#102c3b]">{row.userName ?? "Unregistered credential"}</td><td className="py-3 font-mono text-xs text-slate-500">{row.log.rfidUid}</td><td className="py-3 text-slate-500">{dateFormat.format(row.log.occurredAt)}</td><td className="py-3 text-right"><StatusBadge value={row.log.result} /></td></tr>)}</tbody></table></div> : <EmptyState label="No access activity has been recorded." />}</CardContent></Card>
        <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="text-lg text-[#102c3b]">Security attention</CardTitle><CardDescription>Unresolved security and device conditions.</CardDescription></CardHeader><CardContent className="space-y-3">{data.alerts.length ? data.alerts.map(alert => <div key={alert.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-[#102c3b]">{alert.eventType.replaceAll("_", " ")}</p><StatusBadge value={alert.severity} /></div><p className="mt-1 text-xs leading-5 text-slate-500">{alert.description}</p><p className="mt-2 text-[11px] text-slate-400">{dateFormat.format(alert.occurredAt)}</p></div>) : <EmptyState label="No unresolved alerts." />}</CardContent></Card>
      </section>
    </>
  );
}

function DashboardSkeleton() {
  return <div className="space-y-5 animate-pulse"><div className="h-6 w-36 rounded bg-slate-200" /><div className="h-12 w-2/3 rounded bg-slate-200" /><div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-white" />)}</div><div className="grid gap-5 xl:grid-cols-2"><div className="h-80 rounded-2xl bg-white" /><div className="h-80 rounded-2xl bg-white" /></div></div>;
}

export function IdentityDirectoryPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: directory } = trpc.users.list.useQuery();
  const { data: cards } = trpc.rfid.list.useQuery();
  const [open, setOpen] = useState(false);
  const [rfidOpen, setRfidOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "registered_user" as "admin" | "operator" | "registered_user" });
  const [newCard, setNewCard] = useState({ rfidUid: "", userId: "", label: "" });
  const createUser = trpc.users.create.useMutation({ onSuccess: () => { toast.success("Identity created"); setOpen(false); setNewUser({ name: "", email: "", role: "registered_user" }); void utils.users.list.invalidate(); }, onError: e => toast.error(e.message) });
  const registerCard = trpc.rfid.register.useMutation({ onSuccess: () => { toast.success("RFID card registered"); setRfidOpen(false); setNewCard({ rfidUid: "", userId: "", label: "" }); void utils.rfid.list.invalidate(); }, onError: e => toast.error(e.message) });
  const canManage = user?.role === "admin";
  return <>
    {pageTitle("Identity management", "Identity directory", "Manage registered people and their RFID identities. Administrative changes are available only to the Admin role.")}
    <Tabs defaultValue="users"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><TabsList className="bg-white shadow-sm"><TabsTrigger value="users">Registered users</TabsTrigger><TabsTrigger value="cards">RFID cards</TabsTrigger></TabsList>{canManage && <div className="flex gap-2"><Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button className="bg-[#102c3b]"><UserRoundPlus className="mr-2 h-4 w-4" /> Add user</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Create registered identity</DialogTitle><DialogDescription>This creates a managed project record; it does not provision platform sign-in credentials.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={e => { e.preventDefault(); createUser.mutate(newUser); }}><div><Label htmlFor="new-name">Name</Label><Input id="new-name" required value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} /></div><div><Label htmlFor="new-email">Email</Label><Input id="new-email" type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} /></div><div><Label>System role</Label><Select value={newUser.role} onValueChange={role => setNewUser({ ...newUser, role: role as typeof newUser.role })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="registered_user">Registered User</SelectItem><SelectItem value="operator">Security Operator</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select></div><Button disabled={createUser.isPending} className="w-full">Create identity</Button></form></DialogContent></Dialog><Dialog open={rfidOpen} onOpenChange={setRfidOpen}><DialogTrigger asChild><Button variant="outline" className="bg-white"><Fingerprint className="mr-2 h-4 w-4" /> Register RFID</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Register RFID card</DialogTitle><DialogDescription>Link a unique RFID UID to an active registered identity.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={e => { e.preventDefault(); registerCard.mutate({ rfidUid: newCard.rfidUid, userId: Number(newCard.userId), label: newCard.label || undefined }); }}><div><Label htmlFor="rfid-uid">RFID UID</Label><Input id="rfid-uid" required placeholder="e.g. RFID-DELTA-004" value={newCard.rfidUid} onChange={e => setNewCard({ ...newCard, rfidUid: e.target.value })} /></div><div><Label>Assign to user</Label><Select value={newCard.userId} onValueChange={userId => setNewCard({ ...newCard, userId })}><SelectTrigger><SelectValue placeholder="Choose identity" /></SelectTrigger><SelectContent>{directory?.filter(item => item.role === "registered_user").map(item => <SelectItem key={item.id} value={String(item.id)}>{item.name ?? item.openId}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="rfid-label">Card label</Label><Input id="rfid-label" value={newCard.label} onChange={e => setNewCard({ ...newCard, label: e.target.value })} /></div><Button disabled={registerCard.isPending || !newCard.userId} className="w-full">Register card</Button></form></DialogContent></Dialog></div>}</div>
      <TabsContent value="users"><Card className="border-0 shadow-sm"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-4">Identity</th><th className="px-5 py-4">Role</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Contact</th></tr></thead><tbody>{directory?.map(item => <tr key={item.id} className="border-t border-slate-100"><td className="px-5 py-4"><p className="font-medium text-[#102c3b]">{item.name ?? "Unnamed"}</p><p className="mt-1 font-mono text-[11px] text-slate-400">{item.openId}</p></td><td className="px-5 py-4"><StatusBadge value={item.role} /></td><td className="px-5 py-4"><StatusBadge value={item.status} /></td><td className="px-5 py-4 text-slate-500">{item.email ?? "—"}</td></tr>)}</tbody></table></div></CardContent></Card></TabsContent>
      <TabsContent value="cards"><Card className="border-0 shadow-sm"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-4">RFID UID</th><th className="px-5 py-4">Assigned identity</th><th className="px-5 py-4">Label</th><th className="px-5 py-4">Status</th></tr></thead><tbody>{cards?.map(({ card, userName }) => <tr key={card.id} className="border-t border-slate-100"><td className="px-5 py-4 font-mono text-xs text-[#102c3b]">{card.rfidUid}</td><td className="px-5 py-4 text-slate-600">{userName ?? "Unassigned"}</td><td className="px-5 py-4 text-slate-500">{card.label ?? "—"}</td><td className="px-5 py-4"><StatusBadge value={card.status} /></td></tr>)}</tbody></table></div></CardContent></Card></TabsContent>
    </Tabs>
  </>;
}

export function AccessLogsPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<"all" | "authorized" | "denied" | "error">("all");
  const { data, isFetching } = trpc.access.logs.useQuery({ query: query || undefined, result: result === "all" ? undefined : result, limit: 100 }, { refetchInterval: 5000 });
  return <>{pageTitle("Audit trail", "Access history", "Search the complete database-backed log of RFID decisions and gate-related access records.")}<Card className="border-0 shadow-sm"><CardHeader className="gap-3 md:flex-row md:items-center md:justify-between"><div><CardTitle className="text-lg text-[#102c3b]">Access records</CardTitle><CardDescription>{isFetching ? "Refreshing records…" : "Filters are applied to the server-side access-log query."}</CardDescription></div><div className="flex w-full gap-2 md:w-auto"><Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search RFID or name" className="bg-white md:w-60" /><Select value={result} onValueChange={value => setResult(value as typeof result)}><SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All results</SelectItem><SelectItem value="authorized">Authorized</SelectItem><SelectItem value="denied">Denied</SelectItem><SelectItem value="error">Errors</SelectItem></SelectContent></Select></div></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-y border-slate-100 bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">Timestamp</th><th className="px-5 py-3">Identity</th><th className="px-5 py-3">RFID</th><th className="px-5 py-3">Reason</th><th className="px-5 py-3">Gate</th><th className="px-5 py-3">Result</th></tr></thead><tbody>{data?.map(row => <tr className="border-b border-slate-50" key={row.log.id}><td className="px-5 py-4 text-slate-500">{dateFormat.format(row.log.occurredAt)}</td><td className="px-5 py-4 font-medium text-[#102c3b]">{row.userName ?? "Unregistered credential"}</td><td className="px-5 py-4 font-mono text-xs text-slate-500">{row.log.rfidUid}</td><td className="max-w-64 px-5 py-4 text-slate-500">{row.log.reason ?? "—"}</td><td className="px-5 py-4"><StatusBadge value={row.log.gateState} /></td><td className="px-5 py-4"><StatusBadge value={row.log.result} /></td></tr>)}</tbody></table></div>{!data?.length && <div className="p-5"><EmptyState label="No access records match the current filters." /></div>}</CardContent></Card></>;
}

export function SecurityAlertsPage() {
  const utils = trpc.useUtils();
  const { data } = trpc.alerts.list.useQuery({ includeResolved: false }, { refetchInterval: 5000 });
  const resolve = trpc.alerts.resolve.useMutation({ onSuccess: () => { toast.success("Alert marked resolved"); void utils.alerts.list.invalidate(); }, onError: e => toast.error(e.message) });
  return <>{pageTitle("Incident response", "Security events", "Review abnormal access, forced-open conditions, communication failures, and other gate security events.")}<div className="grid gap-4 lg:grid-cols-2">{data?.map(({ event, deviceName }) => <Card key={event.id} className="border-0 shadow-sm"><CardContent className="p-5"><div className="flex items-start justify-between gap-4"><div className="flex gap-3"><div className={`grid h-10 w-10 place-items-center rounded-xl ${event.severity === "critical" ? "bg-rose-50 text-rose-700" : event.severity === "warning" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}><Siren className="h-5 w-5" /></div><div><p className="font-semibold text-[#102c3b]">{event.eventType.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-400">{deviceName ?? "System event"} · {dateFormat.format(event.occurredAt)}</p></div></div><StatusBadge value={event.severity} /></div><p className="mt-4 text-sm leading-6 text-slate-600">{event.description}</p><div className="mt-5 flex justify-end"><Button disabled={resolve.isPending} onClick={() => resolve.mutate({ id: event.id })} variant="outline" className="bg-white"><CheckCircle2 className="mr-2 h-4 w-4" /> Resolve event</Button></div></CardContent></Card>)}{!data?.length && <div className="lg:col-span-2"><EmptyState label="No unresolved security events." /></div>}</div></>;
}

export function DevicePage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data } = trpc.devices.list.useQuery(undefined, { refetchInterval: 5000 });
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const rotateToken = trpc.devices.rotateToken.useMutation({
    onSuccess: result => { setDeviceToken(result.deviceToken); toast.success("A one-time device token has been generated"); void utils.devices.list.invalidate(); },
    onError: error => toast.error(error.message),
  });
  return <>{pageTitle("IoT fleet", "Gate device", "Monitor device heartbeat, connection type, and last-known operational status. The simulator and a physical ESP32 share the same device API contract.")}<div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">{data?.map(device => <Card key={device.id} className="border-0 shadow-sm"><CardHeader><div className="flex items-start justify-between"><div><CardTitle className="text-xl text-[#102c3b]">{device.deviceName}</CardTitle><CardDescription className="mt-1">{device.location ?? "Location not assigned"}</CardDescription></div><StatusBadge value={device.status} /></div></CardHeader><CardContent className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-5 text-sm"><div><p className="text-xs uppercase tracking-wider text-slate-400">Device ID</p><p className="mt-1 font-mono text-xs text-[#102c3b]">{device.deviceId}</p></div><div><p className="text-xs uppercase tracking-wider text-slate-400">Implementation</p><p className="mt-1 capitalize text-[#102c3b]">{device.connectionType}</p></div><div><p className="text-xs uppercase tracking-wider text-slate-400">Last seen</p><p className="mt-1 text-[#102c3b]">{device.lastSeenAt ? dateFormat.format(device.lastSeenAt) : "Never"}</p></div><div><p className="text-xs uppercase tracking-wider text-slate-400">Firmware</p><p className="mt-1 text-[#102c3b]">{device.firmwareVersion ?? "—"}</p></div></CardContent>{user?.role === "admin" && <CardContent className="border-t border-slate-100 pt-4"><Button variant="outline" disabled={rotateToken.isPending} onClick={() => rotateToken.mutate({ deviceId: device.id })} className="bg-white"><KeyRound className="mr-2 h-4 w-4" /> Rotate device token</Button></CardContent>}</Card>)}<Card className="border-0 bg-[#102c3b] text-white shadow-sm"><CardContent className="flex h-full flex-col justify-between p-6"><div><div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-400 text-[#102c3b]"><Cpu className="h-5 w-5" /></div><h2 className="mt-5 text-xl font-semibold">Physical ESP32 ready</h2><p className="mt-3 text-sm leading-6 text-slate-300">The REST contract is available at <code className="rounded bg-white/10 px-1.5 py-0.5 text-emerald-200">/api/iot/*</code>. The device authenticates with its identifier and token, submits telemetry, polls commands, and acknowledges execution.</p></div><div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300"><p className="font-semibold text-white">Required paths</p><p className="mt-2 font-mono leading-6">POST /api/iot/events<br />GET /api/iot/commands<br />POST /api/iot/commands/:id/ack</p></div></CardContent></Card></div>{deviceToken && <Card className="mt-5 border-0 bg-amber-50 shadow-sm"><CardContent className="p-5"><p className="font-semibold text-amber-950">Copy the device token now</p><p className="mt-1 text-sm text-amber-900">It is intentionally displayed only in the current Admin session. Store it in the device’s local configuration; the server retains only a one-way verifier.</p><code className="mt-4 block overflow-x-auto rounded-lg bg-amber-100 px-3 py-3 font-mono text-xs text-amber-950">{deviceToken}</code></CardContent></Card>}</>;
}

export function AnalyticsPage() {
  const { data, isLoading } = trpc.analytics.summary.useQuery(undefined, { refetchInterval: 5000 });
  if (isLoading || !data) return <DashboardSkeleton />;
  const colors = ["#10b981", "#fb7185", "#fbbf24"];
  return <>{pageTitle("Operational intelligence", "Gate analytics", "Access patterns and security-event distribution calculated from stored operational records. No performance claims are inferred from unmeasured physical hardware.")}<div className="grid gap-5 xl:grid-cols-2"><ChartCard title="Daily access volume" description="Authorized and denied records across the last seven days."><ResponsiveContainer width="100%" height={260}><BarChart data={data.daily}><CartesianGrid vertical={false} stroke="#e2e8f0" /><XAxis dataKey="date" tickFormatter={value => value.slice(5)} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Legend /><Bar dataKey="authorized" stackId="access" fill="#10b981" radius={[4, 4, 0, 0]} /><Bar dataKey="denied" stackId="access" fill="#fb7185" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></ChartCard><ChartCard title="Authorization outcome" description="All recorded access decisions in the analysis period."><ResponsiveContainer width="100%" height={260}><PieChart><Pie data={data.authorization} dataKey="value" nameKey="name" innerRadius={65} outerRadius={95} paddingAngle={4}>{data.authorization.map((_, i) => <Cell key={i} fill={colors[i]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></ChartCard><ChartCard title="Hourly traffic" description="Aggregate access records by local hour."><ResponsiveContainer width="100%" height={260}><LineChart data={data.hourly}><CartesianGrid vertical={false} stroke="#e2e8f0" /><XAxis dataKey="hour" tickLine={false} axisLine={false} interval={3} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Line type="monotone" dataKey="accesses" stroke="#0f766e" strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer></ChartCard><ChartCard title="Security event mix" description="Security-event severity levels in the analysis period."><ResponsiveContainer width="100%" height={260}><BarChart data={data.securityEvents} layout="vertical"><CartesianGrid horizontal={false} stroke="#e2e8f0" /><XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} /><YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={65} /><Tooltip /><Bar dataKey="value" radius={[0, 4, 4, 0]}>{data.securityEvents.map((_, i) => <Cell key={i} fill={colors[i]} />)}</Bar></BarChart></ResponsiveContainer></ChartCard></div><Card className="mt-5 border-0 bg-[#102c3b] text-white shadow-sm"><CardContent className="flex flex-wrap items-center justify-between gap-6 p-6"><div className="flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-400 text-[#102c3b]"><Clock3 className="h-5 w-5" /></div><div><p className="text-sm text-slate-300">Current open duration</p><p className="mt-1 text-2xl font-semibold">{data.gateOpenDuration.seconds}s <span className="text-sm font-normal capitalize text-slate-300">while {data.gateOpenDuration.status}</span></p></div></div><p className="max-w-lg text-sm leading-6 text-slate-300">Physical timing and actuator characteristics must be validated during hardware deployment. This display reports the currently stored gate state only.</p></CardContent></Card></>;
}

function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="text-lg text-[#102c3b]">{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>{children}</CardContent></Card>;
}

export function SimulatorPage() {
  const utils = trpc.useUtils();
  const { data: gate } = trpc.gate.status.useQuery(undefined, { refetchInterval: 5000 });
  const simulator = trpc.simulator.run.useMutation({ onSuccess: (_, input) => { toast.success(`${input.scenario.replaceAll("_", " ")} scenario processed`); void utils.gate.status.invalidate(); void utils.dashboard.snapshot.invalidate(); void utils.alerts.list.invalidate(); }, onError: error => toast.error(error.message) });
  const scenarios = [
    { id: "authorized" as const, title: "Authorized entry", description: "Presence detection, known RFID scan, command poll, and gate-open acknowledgement.", icon: CheckCircle2, style: "bg-emerald-50 text-emerald-700" },
    { id: "unauthorized" as const, title: "Unauthorized RFID", description: "Unknown credential is denied, logged, and shown as a security event.", icon: LockKeyhole, style: "bg-amber-50 text-amber-700" },
    { id: "forced_open" as const, title: "Forced gate open", description: "Reed/sensor anomaly changes the gate to alert and raises a critical event.", icon: AlertTriangle, style: "bg-rose-50 text-rose-700" },
    { id: "offline" as const, title: "Communication loss", description: "Reports a device-offline state and records a communication warning.", icon: Wifi, style: "bg-slate-100 text-slate-700" },
  ];
  return <>{pageTitle("Hardware-in-the-loop", "Simulation console", "Run repeatable device scenarios. The simulator uses the same event and command semantics as the ESP32 REST client; its activity is recorded in the normal production tables.")}<div className="grid gap-4 md:grid-cols-2">{scenarios.map(({ id, title, description, icon: Icon, style }) => <Card key={id} className="border-0 shadow-sm"><CardContent className="p-5"><div className={`grid h-11 w-11 place-items-center rounded-xl ${style}`}><Icon className="h-5 w-5" /></div><h2 className="mt-5 text-lg font-semibold text-[#102c3b]">{title}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{description}</p><Button disabled={simulator.isPending} onClick={() => simulator.mutate({ scenario: id })} className="mt-5 bg-[#102c3b] hover:bg-[#163b4d]"><Play className="mr-2 h-4 w-4" /> Run scenario</Button></CardContent></Card>)}</div><Card className="mt-5 border-0 bg-[#0a2634] text-white shadow-sm"><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Simulator device state</p><p className="mt-2 text-xl font-semibold capitalize">{gate?.device.status ?? "Loading device"} · {gate?.settings.gateState ?? "Unknown gate"}</p><p className="mt-1 text-sm text-slate-300">Configured auto-close timeout: {gate?.settings.autoCloseTimeoutSeconds ?? "—"} seconds.</p></div><Button onClick={() => simulator.mutate({ scenario: "apply_commands" })} disabled={simulator.isPending} className="bg-emerald-400 text-[#06202c] hover:bg-emerald-300"><RefreshCw className="mr-2 h-4 w-4" /> Poll & apply commands</Button></CardContent></Card></>;
}

export function SettingsPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data } = trpc.gate.status.useQuery();
  const [timeout, setTimeout] = useState(12);
  useEffect(() => { if (data) setTimeout(data.settings.autoCloseTimeoutSeconds); }, [data]);
  const configure = trpc.gate.configure.useMutation({ onSuccess: () => { toast.success("Auto-close timeout updated"); void utils.gate.status.invalidate(); }, onError: e => toast.error(e.message) });
  const isAdmin = user?.role === "admin";
  return <>{pageTitle("Policy configuration", "Gate settings", "Configure the automatic close timeout. The device receives this value as command data and applies it locally after a successful authorization.")}<Card className="max-w-2xl border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-xl text-[#102c3b]"><Settings2 className="h-5 w-5 text-emerald-600" /> Auto-close policy</CardTitle><CardDescription>Valid values range from 3 to 300 seconds. The default is 12 seconds.</CardDescription></CardHeader><CardContent><form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={e => { e.preventDefault(); configure.mutate({ autoCloseTimeoutSeconds: timeout }); }}><div className="flex-1"><Label htmlFor="timeout">Delay after a confirmed open position (seconds)</Label><Input id="timeout" type="number" min={3} max={300} value={timeout} disabled={!isAdmin} onChange={e => setTimeout(Number(e.target.value))} className="mt-2 bg-white" /></div><Button disabled={!isAdmin || configure.isPending} className="bg-[#102c3b]">Save setting</Button></form>{!isAdmin && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Only the Admin role may change this safety configuration.</p>}<div className="mt-7 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2"><div><p className="text-xs uppercase tracking-wider text-slate-400">Current mode</p><p className="mt-1 font-medium capitalize text-[#102c3b]">{data?.settings.gateMode.replace("_", " ") ?? "—"}</p></div><div><p className="text-xs uppercase tracking-wider text-slate-400">Current status</p><p className="mt-1 font-medium capitalize text-[#102c3b]">{data?.settings.gateState ?? "—"}</p></div></div></CardContent></Card></>;
}

export function ReportPage() {
  const [location, setLocation] = useLocation();
  const sections = [
    ["Front matter", "Cover page, title page, Bonafide Certificate, Abstract, contents, lists, and abbreviations"],
    ["Chapter 1", "Introduction: background, problem statement, objectives, scope, proposed solution, and advantages"],
    ["Chapter 2", "Literature review: IoT access control, RFID, ESP32 devices, sensor monitoring, and web-based security"],
    ["Chapter 3", "System analysis and requirements: existing limitations, feasibility, functional and non-functional requirements"],
    ["Chapter 4", "System design: hardware/software architecture, data flow, use case, sequence, ER model, API and security design"],
    ["Chapter 5", "Implementation: ESP32/simulator, backend services, database, authentication, dashboard and alerts"],
    ["Chapter 6", "Testing and results: planned test cases, simulation evidence, integration test procedure, and deployment validation notes"],
    ["Chapter 7", "Conclusion, contributions, known limitations, and explicitly-labelled future enhancement opportunities"],
    ["Appendices", "API contract, device-event table, selected code excerpts, hardware integration guide, and references"],
  ];
  return <>{pageTitle("Documentation workspace", "Academic project report", "A KGiSL-ordered report is packaged with this project. Candidate, supervisor, degree, department, and signature details are intentionally held as placeholders until supplied by the institution.")}<Card className="overflow-hidden border-0 shadow-sm"><div className="bg-[#102c3b] p-7 text-white"><div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-400 text-[#06202c]"><BookOpenText className="h-6 w-6" /></div><p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">KGiSL Institute of Technology format</p><h2 className="mt-2 max-w-3xl text-2xl font-semibold">Smart Automated Gate Control and Access Monitoring System Using IoT, Sensors, and Full-Stack Technologies</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">The report follows the supplied order: cover and title pages, certificate, abstract, contents, lists, seven chapters, appendices, and references. It distinguishes simulation from physical validation and avoids fabricated measurement claims.</p><Button onClick={() => setLocation("/report/preview")} className="mt-6 bg-emerald-400 text-[#06202c] hover:bg-emerald-300">Open formatted report preview</Button></div><CardContent className="grid gap-3 p-5 md:grid-cols-2">{sections.map(([name, detail]) => <div key={name} className="rounded-xl border border-slate-100 p-4"><p className="font-semibold text-[#102c3b]">{name}</p><p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p></div>)}</CardContent></Card></>;
}

export function ReportPreviewPage() {
  const reportSections = ["Cover Page & Title Page", "Bonafide Certificate", "Abstract", "Table of Contents", "List of Tables", "List of Figures", "List of Symbols, Abbreviations and Nomenclature", "Chapter 1 — Introduction", "Chapter 2 — Literature Review", "Chapter 3 — System Analysis and Requirements", "Chapter 4 — System Design", "Chapter 5 — Implementation", "Chapter 6 — Testing and Results", "Chapter 7 — Conclusion and Future Enhancements", "Appendices", "References"];
  return <div className="mx-auto max-w-5xl pb-12"><div className="rounded-t-2xl bg-[#102c3b] p-8 text-center text-white"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">KGiSL Institute of Technology · Academic report package</p><h1 className="mx-auto mt-5 max-w-3xl text-3xl font-semibold leading-tight">Smart Automated Gate Control and Access Monitoring System Using IoT, Sensors, and Full-Stack Technologies</h1><p className="mt-5 text-sm text-slate-300">A project report submitted in partial fulfilment of the requirements for the award of a B.E. / B.Tech degree</p></div><div className="bg-white p-7 shadow-sm md:p-12"><div className="border-b border-slate-200 pb-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Format compliance checklist</p><h2 className="mt-2 text-2xl font-semibold text-[#102c3b]">Report sections</h2><p className="mt-3 text-sm leading-6 text-slate-500">Use the full report source included in the project documentation for final editing. Replace the named placeholders only with institution-confirmed details and signatures.</p></div><ol className="mt-8 space-y-3">{reportSections.map((section, index) => <li key={section} className="flex gap-4 rounded-xl border border-slate-100 p-4"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700">{index + 1}</span><span className="text-sm font-medium text-[#102c3b]">{section}</span></li>)}</ol><div className="mt-9 rounded-xl bg-amber-50 p-5 text-sm leading-6 text-amber-900"><p className="font-semibold">Academic integrity note</p><p className="mt-1">Simulation activity is labelled as simulated. Physical performance, response-time, accuracy, and deployment claims are marked as requiring validation during physical deployment.</p></div></div></div>;
}
