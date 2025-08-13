import { Hono } from "hono";
import { z } from "zod";
import {
  validateJson,
  validateQuery,
  validateParam,
  commonSchemas,
} from "../middleware/validation.js";
import {
  createSuccessResponse,
  createPaginatedResponse,
  calculatePaginationMeta,
  ApiExceptions,
  type ApiResponse,
  type PaginatedResponse,
} from "../types/index.js";

// 示例数据模型
export interface ExampleItem {
  id: string;
  name: string;
  description: string;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

// 验证模式
const createExampleSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),
  description: z
    .string()
    .max(500, "Description must be less than 500 characters")
    .optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

const updateExampleSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters")
    .optional(),
  description: z
    .string()
    .max(500, "Description must be less than 500 characters")
    .optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

const queryExampleSchema = z.object({
  ...commonSchemas.pagination.shape,
  status: z.enum(["active", "inactive"]).optional(),
  search: z.string().optional(),
});

// 模拟数据存储
let exampleItems: ExampleItem[] = [
  {
    id: "1",
    name: "Example Item 1",
    description: "This is the first example item",
    status: "active",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "2",
    name: "Example Item 2",
    description: "This is the second example item",
    status: "inactive",
    createdAt: "2024-01-02T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
  },
  {
    id: "3",
    name: "Example Item 3",
    description: "This is the third example item",
    status: "active",
    createdAt: "2024-01-03T00:00:00Z",
    updatedAt: "2024-01-03T00:00:00Z",
  },
];

// 工具函数
function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

function findItemById(id: string): ExampleItem | undefined {
  return exampleItems.find((item) => item.id === id);
}

function filterItems(query: z.infer<typeof queryExampleSchema>): ExampleItem[] {
  let filtered = [...exampleItems];

  // 按状态过滤
  if (query.status) {
    filtered = filtered.filter((item) => item.status === query.status);
  }

  // 按搜索词过滤
  if (query.search) {
    const searchLower = query.search.toLowerCase();
    filtered = filtered.filter(
      (item) =>
        item.name.toLowerCase().includes(searchLower) ||
        item.description?.toLowerCase().includes(searchLower)
    );
  }

  // 排序
  if (query.sort) {
    filtered.sort((a, b) => {
      const aValue = (a as any)[query.sort!];
      const bValue = (b as any)[query.sort!];

      if (query.order === "desc") {
        return bValue > aValue ? 1 : -1;
      }
      return aValue > bValue ? 1 : -1;
    });
  }

  return filtered;
}

/**
 * 创建示例 API 路由
 */
export function createExampleRoutes(): Hono {
  const app = new Hono();



  // GET /examples - 获取示例项目列表（支持分页和过滤）
  app.get("/", validateQuery(queryExampleSchema), async (c) => {
    const query = c.req.valid("query");

    // 过滤数据
    const filteredItems = filterItems(query);

    // 分页
    const startIndex = (query.page - 1) * query.limit;
    const endIndex = startIndex + query.limit;
    const paginatedItems = filteredItems.slice(startIndex, endIndex);

    // 计算分页元数据
    const paginationMeta = calculatePaginationMeta(
      query.page,
      query.limit,
      filteredItems.length
    );

    const response: PaginatedResponse<ExampleItem> = createPaginatedResponse(
      paginatedItems,
      paginationMeta,
      "Examples retrieved successfully"
    );

    return c.json(response);
  });

  // GET /examples/:id - 获取单个示例项目
  app.get("/:id", validateParam(commonSchemas.id), async (c) => {
    const { id } = c.req.valid("param");

    const item = findItemById(id);
    if (!item) {
      throw ApiExceptions.notFound(`Example item with id ${id} not found`);
    }

    const response: ApiResponse<ExampleItem> = createSuccessResponse(
      item,
      "Example item retrieved successfully"
    );

    return c.json(response);
  });

  // POST /examples - 创建新的示例项目
  app.post("/", validateJson(createExampleSchema), async (c) => {
    const data = c.req.valid("json");

    const newItem: ExampleItem = {
      id: generateId(),
      name: data.name,
      description: data.description || "",
      status: data.status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    exampleItems.push(newItem);

    const response: ApiResponse<ExampleItem> = createSuccessResponse(
      newItem,
      "Example item created successfully"
    );

    return c.json(response, 201);
  });

  // PUT /examples/:id - 更新示例项目
  app.put(
    "/:id",
    validateParam(commonSchemas.id),
    validateJson(updateExampleSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const updateData = c.req.valid("json");

      const itemIndex = exampleItems.findIndex((item) => item.id === id);
      if (itemIndex === -1) {
        throw ApiExceptions.notFound(`Example item with id ${id} not found`);
      }

      // 更新项目
      const updatedItem: ExampleItem = {
        ...exampleItems[itemIndex],
        ...updateData,
        updatedAt: new Date().toISOString(),
      };

      exampleItems[itemIndex] = updatedItem;

      const response: ApiResponse<ExampleItem> = createSuccessResponse(
        updatedItem,
        "Example item updated successfully"
      );

      return c.json(response);
    }
  );

  // DELETE /examples/:id - 删除示例项目
  app.delete("/:id", validateParam(commonSchemas.id), async (c) => {
    const { id } = c.req.valid("param");

    const itemIndex = exampleItems.findIndex((item) => item.id === id);
    if (itemIndex === -1) {
      throw ApiExceptions.notFound(`Example item with id ${id} not found`);
    }

    const deletedItem = exampleItems[itemIndex];
    exampleItems.splice(itemIndex, 1);

    const response: ApiResponse<ExampleItem> = createSuccessResponse(
      deletedItem,
      "Example item deleted successfully"
    );

    return c.json(response);
  });

  // GET /examples/stats - 获取统计信息
  app.get("/stats", async (c) => {
    const stats = {
      total: exampleItems.length,
      active: exampleItems.filter((item) => item.status === "active").length,
      inactive: exampleItems.filter((item) => item.status === "inactive")
        .length,
      lastCreated:
        exampleItems.length > 0
          ? exampleItems.reduce((latest, item) =>
              new Date(item.createdAt) > new Date(latest.createdAt)
                ? item
                : latest
            ).createdAt
          : null,
    };

    const response: ApiResponse<typeof stats> = createSuccessResponse(
      stats,
      "Statistics retrieved successfully"
    );

    return c.json(response);
  });

  return app;
}
