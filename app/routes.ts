import { index, type RouteConfig, route } from '@react-router/dev/routes';
import configManager from './lib/configManager';

const routeConfigs = configManager.getRouteConfigs();
const routes: RouteConfig = [];

// Add index route first
const indexConfig = configManager.getConfig('home');
if (indexConfig) {
  routes.push(index(indexConfig.component));
}

// Add other routes
routeConfigs.forEach(({ path, component }) => {
  // Skip the home route as it's already added as index
  if (path !== '/') {
    routes.push(route(path, component));
  }
});

export default routes satisfies RouteConfig;
