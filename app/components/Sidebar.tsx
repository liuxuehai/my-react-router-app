// src/react-app/components/Sidebar.tsx
import SidebarContent from "./SidebarContent";
import { ToolMetadata } from "@/lib/toolRegistry";

interface SidebarProps {
  tools: ToolMetadata[];
}

export default function Sidebar({ tools }: SidebarProps) {
  return (
    <div className="hidden md:flex md:w-64 md:flex-col">
      <SidebarContent tools={tools} />
    </div>
  );
}
