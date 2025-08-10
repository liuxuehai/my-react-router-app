// src/react-app/components/Layout.tsx

import { Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { ModeToggle } from '@/components/mode-toggle';
import Sidebar from '@/components/Sidebar';
import SidebarContent, {
  getCurrentToolName,
} from '@/components/SidebarContent';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import type { RouteConfig } from '@/lib/configManager';
import configManager from '@/lib/configManager';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [tools, setTools] = useState<RouteConfig[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // 只在Layout中加载一次tools
  useEffect(() => {
    setTools(configManager.getAllConfigs());
  }, []);

  const handleMobileNavigate = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      {/* 桌面端Sidebar */}
      <div className="hidden h-full md:flex md:w-64 md:flex-col">
        <Sidebar tools={tools} />
      </div>

      {/* 移动端Sidebar */}
      <Sheet onOpenChange={setIsMobileMenuOpen} open={isMobileMenuOpen}>
        <SheetTrigger asChild>
          <Button
            aria-label="切换侧边栏"
            className="fixed top-4 left-4 z-50 md:hidden"
            size="icon"
            variant="outline"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-64 p-0" side="left">
          <div className="sr-only">导航菜单</div>
          <SidebarContent onNavigate={handleMobileNavigate} tools={tools} />
        </SheetContent>
      </Sheet>

      {/* 主内容区域 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 桌面端头部 */}
        <header className="hidden flex-shrink-0 items-center justify-between bg-white px-6 py-4 shadow-sm md:flex dark:bg-gray-800">
          <div /> {/* 占位符，保持标题居中 */}
          <h2 className="-translate-x-1/2 absolute left-1/2 transform font-bold text-gray-800 text-xl dark:text-white">
            {getCurrentToolName(tools, location.pathname)}
          </h2>
          <div className="flex items-center">
            <ModeToggle />
          </div>
        </header>

        {/* 内容区域 */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* 移动端头部 */}
          <div className="-mt-6 -mx-6 z-40 mb-4 bg-white p-4 shadow-sm md:hidden dark:bg-gray-800">
            <div className="flex items-center justify-between">
              <div /> {/* 占位符，保持标题居中 */}
              <h2 className="-translate-x-1/2 absolute left-1/2 transform font-semibold text-gray-800 text-lg dark:text-white">
                {getCurrentToolName(tools, location.pathname)}
              </h2>
              <ModeToggle />
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
