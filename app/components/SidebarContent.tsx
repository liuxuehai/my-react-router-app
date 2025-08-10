// src/react-app/components/SidebarContent.tsx
import { Link, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import type { RouteConfig } from '@/lib/configManager';

interface SidebarContentProps {
  tools: RouteConfig[];
  onNavigate?: () => void;
}

export default function SidebarContent({
  tools,
  onNavigate,
}: SidebarContentProps) {
  const location = useLocation();

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-800">
      <div className="border-gray-200 border-b px-6 py-4 dark:border-gray-700">
        <div className="flex items-center justify-between py-1">
          <h1 className="font-bold text-gray-800 text-xl dark:text-white">
            Dev Tools
          </h1>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1">
          {tools.map((tool) => (
            <li key={tool.id}>
              <Button
                asChild
                className="flex w-full items-center justify-start space-x-3 px-4 py-2"
                onClick={onNavigate}
                variant={location.pathname === tool.path ? 'default' : 'ghost'}
              >
                <Link to={tool.path}>
                  <span>{tool.name}</span>
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function getCurrentToolName(
  tools: RouteConfig[],
  pathname: string
): string {
  const currentTool = tools.find((tool) => tool.path === pathname);
  return currentTool ? currentTool.name : 'Tool';
}
