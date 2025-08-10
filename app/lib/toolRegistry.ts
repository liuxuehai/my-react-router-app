// src/react-app/lib/toolRegistry.ts
export interface ToolMetadata {
  id: string;
  name: string;
  description: string;
  path: string;
  icon?: string; // Optional icon for the tool
  category?: string; // Optional category for grouping tools
}

class ToolRegistry {
  private tools: Map<string, ToolMetadata> = new Map();

  /**
   * Register a new tool
   * @param tool - The tool metadata to register
   */
  registerTool(tool: ToolMetadata): void {
    if (this.tools.has(tool.id)) {
      console.warn(`Tool with id '${tool.id}' is already registered. It will be overwritten.`);
    }
    this.tools.set(tool.id, tool);
  }

  /**
   * Get a tool by its id
   * @param id - The id of the tool to retrieve
   * @returns The tool metadata or undefined if not found
   */
  getTool(id: string): ToolMetadata | undefined {
    return this.tools.get(id);
  }

  /**
   * Get all registered tools
   * @returns Array of all registered tools
   */
  getAllTools(): ToolMetadata[] {
    return Array.from(this.tools.values());
  }

  /**
   * Remove a tool by its id
   * @param id - The id of the tool to remove
   * @returns True if the tool was removed, false if it didn't exist
   */
  unregisterTool(id: string): boolean {
    return this.tools.delete(id);
  }

  /**
   * Check if a tool is registered
   * @param id - The id of the tool to check
   * @returns True if the tool is registered, false otherwise
   */
  hasTool(id: string): boolean {
    return this.tools.has(id);
  }
}

// Create a singleton instance
const toolRegistry = new ToolRegistry();

// Register default tools
toolRegistry.registerTool({
  id: "home",
  name: "Home",
  description: "Welcome page",
  path: "/"
});

toolRegistry.registerTool({
  id: "json-formatter",
  name: "JSON Formatter",
  description: "Format and validate JSON",
  path: "/json-formatter"
});

export default toolRegistry;