import type { Route } from "./+types/home2";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Home Counter" },
    { name: "description", content: "Counter example with shadcn/ui components" },
  ];
}

export default function Home() {
  const [count, setCount] = useState(0);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="ml-4">
            <CardTitle className="text-center">Counter</CardTitle>
            <CardDescription>Click the button to increment the counter</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="card">
              <Button
                onClick={() => setCount((count) => count + 1)}
                aria-label="increment"
              >
                count is {count}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}