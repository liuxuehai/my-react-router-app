// src/react-app/components/Sidebar.tsx

import type { RouteConfig } from '@/lib/configManager';
import SidebarContent from './SidebarContent';

interface SidebarProps {
  tools: RouteConfig[];
}

export default function Sidebar({ tools }: SidebarProps) {
  return (
    <div className="h-full">
      <SidebarContent tools={tools} />
    </div>
  );
}
