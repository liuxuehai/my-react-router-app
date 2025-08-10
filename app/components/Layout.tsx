// src/react-app/components/Layout.tsx
import { useLocation } from "react-router";
import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import SidebarContent, { getCurrentToolName } from "@/components/SidebarContent";
import toolRegistry, { ToolMetadata } from "@/lib/toolRegistry";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ModeToggle } from "@/components/mode-toggle";

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [tools, setTools] = useState<ToolMetadata[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // 只在Layout中加载一次tools
  useEffect(() => {
    setTools(toolRegistry.getAllTools());
  }, []);
  
  const handleMobileNavigate = () => {
    setIsMobileMenuOpen(false);
  };
  
  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      {/* 桌面端Sidebar */}
      <Sidebar tools={tools} />
      
      {/* 移动端Sidebar */}
      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetTrigger asChild>
          <Button 
            variant="outline" 
            size="icon" 
            className="fixed top-4 left-4 z-50 md:hidden"
            aria-label="切换侧边栏"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64">
          <div className="sr-only">导航菜单</div>
          <SidebarContent 
            tools={tools} 
            onNavigate={handleMobileNavigate} 
          />
        </SheetContent>
      </Sheet>
      
      {/* 主内容区域 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 桌面端头部 */}
        <header className="hidden md:flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-800 shadow-sm flex-shrink-0">
          <div></div> {/* 占位符，保持标题居中 */}
          <h2 className="text-xl font-bold text-gray-800 dark:text-white absolute left-1/2 transform -translate-x-1/2">
            {getCurrentToolName(tools, location.pathname)}
          </h2>
          <div className="flex items-center">
            <ModeToggle />
          </div>
        </header>
        
        {/* 内容区域 */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* 移动端头部 */}
          <div className="md:hidden bg-white dark:bg-gray-800 shadow-sm z-40 mb-4 -mt-6 -mx-6 p-4">
            <div className="flex items-center justify-between">
              <div></div> {/* 占位符，保持标题居中 */}
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white absolute left-1/2 transform -translate-x-1/2">
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