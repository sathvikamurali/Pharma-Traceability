import { useState, ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useWeb3 } from "@/contexts/Web3Context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Package,
  Users,
  ArrowRightLeft,
  QrCode,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  icon: React.ElementType;
  sectionId: string;
}

interface DashboardLayoutProps {
  title: string;
  role: string;
  navItems: NavItem[];
  activeSection: string;
  onSectionChange: (id: string) => void;
  children: ReactNode;
}

const roleColors: Record<string, string> = {
  Admin: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  Manufacturer: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Distributor: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  Pharmacy: "bg-green-500/20 text-green-400 border-green-500/30",
};

export default function DashboardLayout({
  title,
  role,
  navItems,
  activeSection,
  onSectionChange,
  children,
}: DashboardLayoutProps) {
  const [, setLocation] = useLocation();
  const { account } = useWeb3();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDisconnect = () => {
    setLocation("/");
  };

  const shortAddress = account
    ? `${account.slice(0, 6)}...${account.slice(-4)}`
    : "";

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-60 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:relative lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-sidebar-border">
          <div className="w-7 h-7 rounded bg-primary flex items-center justify-center flex-shrink-0">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-sm tracking-wider text-foreground">PHARMACHAIN</span>
          <button
            className="ml-auto lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Role badge */}
        <div className="px-4 py-3 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground font-mono truncate">{shortAddress}</p>
            </div>
            <Badge
              variant="outline"
              className={cn("text-xs shrink-0 border", roleColors[role] || "text-muted-foreground")}
            >
              {role}
            </Badge>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.sectionId;
            return (
              <button
                key={item.sectionId}
                data-testid={`nav-${item.sectionId}`}
                onClick={() => {
                  onSectionChange(item.sectionId);
                  setMobileOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition-all",
                  active
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.label}</span>
                {active && <ChevronRight className="w-3 h-3 ml-auto" />}
              </button>
            );
          })}
        </nav>

        {/* Disconnect */}
        <div className="p-3 border-t border-sidebar-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={handleDisconnect}
            data-testid="button-disconnect"
          >
            <LogOut className="w-4 h-4" />
            Disconnect
          </Button>
        </div>
      </aside>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-14 flex items-center gap-3 px-4 border-b border-border bg-background/80 backdrop-blur-sm shrink-0">
          <button
            className="lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="font-semibold text-sm text-foreground tracking-wide">{title}</h1>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

export { LayoutDashboard, Package, Users, ArrowRightLeft, QrCode };
