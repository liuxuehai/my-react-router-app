import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { Route } from './+types/home2';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Home Counter' },
    {
      name: 'description',
      content: 'Counter example with shadcn/ui components',
    },
  ];
}

export default function Home() {
  const [count, setCount] = useState(0);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="ml-4">
            <CardTitle className="text-center">Counter</CardTitle>
            <CardDescription>
              Click the button to increment the counter
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="card">
              <Button
                aria-label="increment"
                onClick={() => setCount((count) => count + 1)}
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
