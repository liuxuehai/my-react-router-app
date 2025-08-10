// src/react-app/lib/configManager.ts
export interface RouteConfig {
  path: string;
  component: string;
  id: string;
  name: string;
  description: string;
  icon?: string;
  category?: string;
}

// ToolMetadata is a subset of RouteConfig for sidebar tools
export type ToolMetadata = Omit<RouteConfig, 'component'>;

export class ConfigManager {
  private configs: Map<string, RouteConfig> = new Map();

  /**
   * Register a new route and tool configuration
   * @param config - The route and tool configuration
   */
  registerConfig(config: RouteConfig): void {
    if (this.configs.has(config.id)) {
      console.warn(
        `Config with id '${config.id}' is already registered. It will be overwritten.`
      );
    }
    this.configs.set(config.id, config);
  }

  /**
   * Get a configuration by its id
   * @param id - The id of the configuration to retrieve
   * @returns The configuration or undefined if not found
   */
  getConfig(id: string): RouteConfig | undefined {
    return this.configs.get(id);
  }

  /**
   * Get all registered configurations
   * @returns Array of all registered configurations
   */
  getAllConfigs(): RouteConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Get route configurations for React Router
   * @returns Array of route configurations
   */
  getRouteConfigs(): { path: string; component: string }[] {
    return Array.from(this.configs.values()).map(({ path, component }) => ({
      path,
      component,
    }));
  }

  /**
   * Get tool metadata for sidebar
   * @returns Array of tool metadata
   */
  getToolMetadata(): RouteConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Remove a configuration by its id
   * @param id - The id of the configuration to remove
   * @returns True if the configuration was removed, false if it didn't exist
   */
  unregisterConfig(id: string): boolean {
    return this.configs.delete(id);
  }

  /**
   * Check if a configuration is registered
   * @param id - The id of the configuration to check
   * @returns True if the configuration is registered, false otherwise
   */
  hasConfig(id: string): boolean {
    return this.configs.has(id);
  }
}

// Create a singleton instance
const configManager = new ConfigManager();

// Register default configurations
configManager.registerConfig({
  id: 'home',
  name: 'Home',
  description: 'Welcome page',
  path: '/',
  component: 'routes/home.tsx',
});

configManager.registerConfig({
  id: 'json',
  name: 'JSON Formatter',
  description: 'Format and validate JSON',
  path: '/json',
  component: 'routes/json.tsx',
});

configManager.registerConfig({
  id: 'home2',
  name: 'Home2',
  description: 'Secondary home page',
  path: '/home2',
  component: 'routes/home2.tsx',
});

export default configManager;
