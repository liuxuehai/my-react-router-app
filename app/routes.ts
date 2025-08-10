import { type RouteConfig, route, index } from "@react-router/dev/routes";

export default [route("/about", "routes/home2.tsx"),index("routes/home.tsx")] satisfies RouteConfig;
