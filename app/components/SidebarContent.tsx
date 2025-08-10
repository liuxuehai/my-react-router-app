// src/react-app/components/SidebarContent.tsx
import { Link, useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { ToolMetadata } from "@/lib/toolRegistry";

interface SidebarContentProps {
  tools: ToolMetadata[];
  onNavigate?: () => void;
}

export default function SidebarContent({ tools, onNavigate }: SidebarContentProps) {
  const location = useLocation();

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-800">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div></div>
        <h1 className="text-xl font-bold text-gray-800 dark:text-white">Dev Tools</h1>
      </div>
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1">
          {tools.map((tool) => (
            <li key={tool.id}>
              <Button
                asChild
                variant={location.pathname === tool.path ? "default" : "ghost"}
                className="w-full justify-start px-4 py-2 flex items-center space-x-3"
                onClick={onNavigate}
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

export function getCurrentToolName(tools: ToolMetadata[], pathname: string): string {
  const currentTool = tools.find(tool => tool.path === pathname);
  return currentTool ? currentTool.name : "Tool";
}