import { NavLink, useNavigate } from 'react-router-dom';
import { ReactNode } from 'react';
import {
  Activity, LayoutDashboard, Upload, Zap, FileText,
  Building2, FlaskConical, BarChart3, AlertTriangle, LogOut, LogIn, ChevronRight
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  authOnly?: boolean;
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/upload', label: 'Upload Brief', icon: Upload, authOnly: true },
  { to: '/issues', label: 'Issues', icon: FileText },
  { to: '/signals', label: 'BD Signals', icon: Zap },
  { to: '/companies', label: 'Companies', icon: Building2 },
  { to: '/assets', label: 'Assets', icon: FlaskConical },
  { to: '/comps', label: 'Precedent Comps', icon: BarChart3 },
  { to: '/flags', label: 'Mispricing Flags', icon: AlertTriangle },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const visibleNavItems = navItems.filter(item => !item.authOnly || user);

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-sky-500 rounded-md flex items-center justify-center shrink-0">
              <Activity size={14} className="text-white" />
            </div>
            <div>
              <div className="text-white text-sm font-semibold leading-tight">BD Brief DB</div>
              <div className="text-slate-500 text-xs">Intelligence Platform</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {visibleNavItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors group ${
                  isActive
                    ? 'bg-sky-600/20 text-sky-300 font-medium'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={15} className={isActive ? 'text-sky-400' : 'text-slate-500 group-hover:text-slate-400'} />
                  <span className="flex-1">{item.label}</span>
                  {isActive && <ChevronRight size={12} className="text-sky-400" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="px-2 py-3 border-t border-slate-800">
          {user ? (
            <>
              <div className="px-3 py-2 text-xs text-slate-500 truncate mb-1">{user.email}</div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2.5 px-3 py-2 w-full rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <LogOut size={15} className="text-slate-500" />
                Sign out
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-2.5 px-3 py-2 w-full rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <LogIn size={15} className="text-slate-500" />
              Sign in
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto bg-slate-950">
        {children}
      </main>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between px-6 py-5 border-b border-slate-800">
      <div>
        <h1 className="text-white text-xl font-semibold">{title}</h1>
        {subtitle && <p className="text-slate-400 text-sm mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 ml-4">{actions}</div>}
    </div>
  );
}
